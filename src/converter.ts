import pathlib from "path";
import semver from "semver";
import * as ts from "@tslab/typescript-for-tslab";
import { isValidModuleName } from "./util";

// TODO: Disallow accessing "module" of Node.js.

export interface SideOutput {
  path: string;
  data: string;
}

export interface ConvertResult {
  output?: string;
  declOutput?: string;
  /**
   * When diagnostics is not empty, other fields are not set.
   */
  diagnostics: Diagnostic[];
  /**
   * The variable name to store the last expression if exists.
   * This is necessary to fix #11
   */
  lastExpressionVar?: string;
  /**
   * If true, the input and the output have top-level await statements.
   */
  hasToplevelAwait?: boolean;
  /**
   * JavaScript outputs from external files in the root dir.
   */
  sideOutputs?: SideOutput[];
}

export interface DiagnosticPos {
  /** Byte-offset. */
  offset: number;
  /** Zero-based line number. */
  line: number;
  /** Zero-based char offset in the line. */
  character: number;
}

export interface Diagnostic {
  start: DiagnosticPos;
  end: DiagnosticPos;
  messageText: string;
  category: number;
  code: number;
  fileName?: string;
}

export interface CompletionInfo {
  start: number;
  end: number;
  candidates: string[];
  /**
   * The original completion from TS compiler.
   * It's exposed for debugging purpuse.
   */
  original?: ts.CompletionInfo;
}

export interface IsCompleteResult {
  completed: boolean;
  indent?: string;
}

export interface ConverterOptions {
  /** If true, JavaScript mode. TypeSceript mode otherwise */
  isJS?: boolean;
  /** If true, creates a converter for browser mode. Otherwise, Node.js */
  isBrowser?: boolean;
  /** Only for testing. File changes are forwarded to this handler. */
  _fileWatcher?: ts.FileWatcherCallback;
}

export interface Converter {
  convert(prevDecl: string, src: string): ConvertResult;
  inspect(prevDecl: string, src: string, position: number): ts.QuickInfo;
  complete(prevDecl: string, src: string, position: number): CompletionInfo;
  /** Release internal resources to terminate the process gracefully. */
  close(): void;
  /** Defines a in-memory module */
  addModule(name: string, content: string): Diagnostic[];
}

interface RebuildTimer {
  callback: (...args: any[]) => void;
}

const cancellationToken: ts.CancellationToken = {
  isCancellationRequested: (): boolean => false,
  throwIfCancellationRequested: (): void => {}
};

export function createConverter(options?: ConverterOptions): Converter {
  const cwd = ts.sys.getCurrentDirectory();
  const srcFilename = pathlib.join(
    cwd,
    options?.isJS ? "__tslab__.js" : "__tslab__.ts"
  );
  const declFilename = pathlib.join(cwd, "__prev__.d.ts");
  const rootFiles = new Set<string>([declFilename, srcFilename]);
  const outDir = "outDir";
  const dstFilename = pathlib.join(outDir, "__tslab__.js");
  const dstDeclFilename = pathlib.join(outDir, "__tslab__.d.ts");

  // c.f.
  // https://github.com/microsoft/TypeScript/wiki/Node-Target-Mapping
  // https://github.com/microsoft/TypeScript/issues/22306#issuecomment-412266626
  const transpileTarget =
    semver.major(process.version) >= 12
      ? ts.ScriptTarget.ES2019
      : ts.ScriptTarget.ES2018;
  // References:
  // https://github.com/microsoft/TypeScript/blob/master/src/lib/es2019.full.d.ts
  const transpileLib =
    transpileTarget === ts.ScriptTarget.ES2019 ? ["es2019"] : ["es2018"];
  if (options?.isBrowser) {
    transpileLib.push("dom");
    transpileLib.push("dom.iterable");
  }
  /**
   * A prefix to sources to handle sources as external modules
   * > any file containing a top-level import or export is considered a module.
   * > https://www.typescriptlang.org/docs/handbook/modules.html#introduction
   */
  const srcPrefix = "export {};" + ts.sys.newLine;
  /** Used in adjustSrcFileOffset */
  const srcPrefixOffsets = {
    offset: srcPrefix.length,
    line: (srcPrefix.match(/\n/g) || []).length,
    char: srcPrefix.length - (srcPrefix.lastIndexOf("\n") + 1)
  };
  let srcContent: string = "";
  let declContent: string = "";
  /** Check if external .ts files are converted. */
  const sideInputsConverted = new Set<string>();
  let builder: ts.BuilderProgram = null;

  const sys = Object.create(ts.sys) as ts.System;
  let rebuildTimer: RebuildTimer = null;
  sys.getCurrentDirectory = function() {
    return cwd;
  };
  sys.setTimeout = (callback: (...args: any[]) => void): any => {
    if (rebuildTimer) {
      throw new Error("Unexpected pending rebuildTimer");
    }
    rebuildTimer = { callback };
    return rebuildTimer;
  };
  sys.clearTimeout = (timeoutId: any) => {
    if (rebuildTimer === timeoutId) {
      rebuildTimer = null;
      return;
    }
    throw new Error("clearing unexpected tiemr");
  };
  sys.readFile = function(path, encoding) {
    if (path === srcFilename) {
      return srcPrefix + srcContent;
    }
    if (path === declFilename) {
      return srcPrefix + declContent;
    }
    if (virtualFiles.has(path)) {
      return virtualFiles.get(path);
    }
    return ts.sys.readFile(forwardTslabPath(cwd, path), encoding);
  };
  sys.directoryExists = function(path: string): boolean {
    if (ts.sys.directoryExists(forwardTslabPath(cwd, path))) {
      return true;
    }
    // Fake the existence of node_modules for tslab. This is necessary
    // to import `tslab` when `node_modules` does not exist in `cwd`.
    // See forwardTslabPath for details.
    // TODO: Test this behavior.
    return pathlib.join(cwd, "node_modules") === path;
  };
  sys.fileExists = function(path: string): boolean {
    if (ts.sys.fileExists(forwardTslabPath(cwd, path))) {
      return true;
    }
    return virtualFiles.has(path);
  };
  sys.readDirectory = function(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number
  ): string[] {
    return ts.sys.readDirectory(
      forwardTslabPath(cwd, path),
      extensions,
      exclude,
      include,
      depth
    );
  };
  sys.writeFile = function(path, data) {
    throw new Error("writeFile must not be called");
  };
  let notifyUpdateSrc: ts.FileWatcherCallback = null;
  let notifyUpdateDecls: ts.FileWatcherCallback = null;
  /** files for modules in memory. `srcPrefix` is prepended to values of virtualFiles. */
  const virtualFiles = new Map<string, string>();
  const fileWatchers = new Map<string, ts.FileWatcherCallback>();
  sys.watchFile = (path, callback, pollingInterval?: number) => {
    if (path === srcFilename) {
      notifyUpdateSrc = callback;
      return {
        close: () => {}
      };
    }
    if (path === declFilename) {
      notifyUpdateDecls = callback;
      return {
        close: () => {}
      };
    }
    // Note: File watchers for real files and virtual files are mixed here.
    // This implementation is not 100% precise, though it causes a minor performance issue.
    const cb = (fileName, eventKind) => {
      sideInputsConverted.delete(fileName);
      callback(fileName, eventKind);
      if (options?._fileWatcher) {
        options._fileWatcher(fileName, eventKind);
      }
    };
    fileWatchers.set(path, cb);
    const watcher = ts.sys.watchFile(path, cb, pollingInterval);
    return {
      close: () => {
        fileWatchers.delete(path);
        watcher.close();
      }
    };
  };
  // This takes several hundreds millisecs.
  const host = ts.createWatchCompilerHost(
    Array.from(rootFiles),
    {
      // module is ESNext, not ES2015, to support dynamic import.
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      target: transpileTarget,
      // We need to wrap entries with lib.*.d.ts before passing `lib` though it's not documented clearly.
      // c.f.
      // https://github.com/microsoft/TypeScript/blob/master/src/testRunner/unittests/config/commandLineParsing.ts
      // https://github.com/microsoft/TypeScript/blob/master/src/compiler/commandLineParser.ts
      lib: transpileLib.map(lib => `lib.${lib}.d.ts`),
      declaration: true,
      newLine: ts.NewLineKind.LineFeed,
      // Remove 'use strict' from outputs.
      noImplicitUseStrict: true,
      experimentalDecorators: true,
      typeRoots: getTypeRoots(),
      // allowJs, checkJs and outDir are necessary to transpile .js files.
      allowJs: true,
      checkJs: true,
      // tslab does not show error messages in d.ts (e.g. files in @types).
      // This may improve the compile performance slightly.
      skipLibCheck: true,
      // rootDir is necessary to stabilize the paths of output files.
      rootDir: cwd,
      outDir
    },
    sys,
    null,
    function(d: ts.Diagnostic) {
      console.log(d.messageText);
    },
    function(d: ts.Diagnostic) {
      // Drop watch status changes.
    }
  );
  host.afterProgramCreate = function(b: ts.BuilderProgram) {
    builder = b;
  };
  const watch = ts.createWatchProgram(host);
  if (!builder) {
    throw new Error("builder is not created");
  }
  return {
    close,
    convert,
    inspect,
    complete,
    addModule
  };

  function close() {
    watch.close();
  }

  function convert(prevDecl: string, src: string): ConvertResult {
    updateContent(prevDecl, src);
    let declsFile = builder.getSourceFile(declFilename);
    let srcFile = builder.getSourceFile(srcFilename);

    const locals: ts.SymbolTable = srcFile.locals;
    const keys = new Set<string>();
    if (locals) {
      locals.forEach((_: any, key: any) => {
        keys.add(key);
      });
    }
    if (keys.size > 0) {
      // Export all local variables.
      // TODO: Disallow "export" in the input.
      const suffix = "\nexport {" + Array.from(keys).join(", ") + "}";
      updateContent(prevDecl, src + suffix);
      declsFile = builder.getSourceFile(declFilename);
      srcFile = builder.getSourceFile(srcFilename);
    }
    srcFile.parent = declsFile;
    const diag = convertDiagnostics(
      getPreEmitDiagnosticsWithDependencies(builder, srcFile)
    );
    if (diag.diagnostics.length > 0) {
      return {
        diagnostics: diag.diagnostics
      };
    }

    let output: string;
    let declOutput: string;
    let lastExpressionVar: string;
    let sideOutputs: SideOutput[];
    for (const dep of getAllSrcDependencies(builder, srcFile)) {
      if (sideInputsConverted.has(dep)) {
        continue;
      }
      if (dep !== srcFilename) {
        sideInputsConverted.add(dep);
      }
      builder.emit(
        builder.getSourceFile(dep),
        (fileName: string, data: string) => {
          if (fileName === dstFilename) {
            output = data;
            return;
          }
          if (fileName === dstDeclFilename) {
            declOutput = data;
            return;
          }
          if (!fileName.endsWith(".js")) {
            return;
          }
          const rel = pathlib.relative(outDir, fileName);
          if (rel.startsWith("..")) {
            throw new Error("unexpected emit path: " + fileName);
          }
          if (!sideOutputs) {
            sideOutputs = [];
          }
          sideOutputs.push({
            path: pathlib.join(cwd, rel),
            data: esModuleToCommonJSModule(data, transpileTarget)
          });
        },
        undefined,
        undefined,
        getCustomTransformers(keys, (name: string) => {
          lastExpressionVar = name;
        })
      );
    }
    if (sideOutputs) {
      sideOutputs.sort((a, b) => a.path.localeCompare(b.path));
    }
    declOutput += remainingDecls(
      builder.getProgram().getTypeChecker(),
      srcFile,
      declsFile
    );
    return {
      output: esModuleToCommonJSModule(output, transpileTarget),
      declOutput,
      diagnostics: diag.diagnostics,
      hasToplevelAwait: diag.hasToplevelAwait,
      sideOutputs,
      lastExpressionVar
    };
  }

  function getTypeRoots(): string[] {
    // If @types/node does not exist in the default type roots,
    // use @types under tslab/node_modules (bug#10).
    // TODO: Integration-test for this behavior.
    const typeRoots =
      ts.getDefaultTypeRoots(cwd, {
        directoryExists: sys.directoryExists
      }) || [];
    for (const root of typeRoots) {
      if (ts.sys.fileExists(pathlib.join(root, "node", "package.json"))) {
        return typeRoots;
      }
    }
    typeRoots.push(pathlib.join(__dirname, "..", "node_modules", "@types"));
    return typeRoots;
  }

  function inspect(
    prevDecl: string,
    src: string,
    position: number
  ): ts.QuickInfo | undefined {
    // c.f.
    // https://github.com/microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/hover.ts
    updateContent(prevDecl, src);
    let declsFile = builder.getSourceFile(declFilename);
    let srcFile = builder.getSourceFile(srcFilename);
    srcFile.parent = declsFile;
    const info = ts.getQuickInfoAtPosition(
      srcFile,
      builder.getProgram().getTypeChecker(),
      cancellationToken,
      position + srcPrefix.length
    );
    if (info && info.textSpan) {
      info.textSpan.start -= srcPrefix.length;
    }
    return info;
  }

  function complete(
    prevDecl: string,
    src: string,
    position: number
  ): CompletionInfo {
    updateContent(prevDecl, src);
    let declsFile = builder.getSourceFile(declFilename);
    let srcFile = builder.getSourceFile(srcFilename);
    srcFile.parent = declsFile;

    const pos = position + srcPrefix.length;
    const info = getCompletionsAtPosition(
      builder.getProgram(),
      () => {
        // ignore log messages
      },
      srcFile,
      pos,
      {},
      undefined
    );

    const prev: ts.Node = ts.tslab.findPrecedingToken(pos, srcFile);
    // Note: In contradiction to the docstring, findPrecedingToken may return prev with
    // prev.end > pos (e.g. `members with surrounding` test case).
    //
    // Note: Be careful. node.pos != node.getStart().
    // (e.g. `globals with prefix` test case)
    if (prev && ts.isIdentifier(prev) && prev.end >= pos) {
      return completionWithId(info, prev, srcFile);
    }
    const next: ts.Node = prev
      ? ts.tslab.findNextToken(prev, srcFile, srcFile)
      : null;
    if (
      next &&
      ts.isIdentifier(next) &&
      next.getStart(srcFile) <= pos &&
      pos <= next.end
    ) {
      return completionWithId(info, next, srcFile);
    }
    let entries = info && info.entries ? info.entries.slice() : [];
    entries.sort((a, b) => {
      const ord = a.sortText.localeCompare(b.sortText);
      return ord !== 0 ? ord : a.name.localeCompare(b.name);
    });
    const candidates = entries.map(e => e.name);
    return {
      start: pos - srcPrefix.length,
      end: pos - srcPrefix.length,
      candidates,
      original: info
    };
  }

  function completionWithId(
    info: ts.CompletionInfo | undefined,
    id: ts.Identifier,
    srcFile: ts.SourceFile
  ): CompletionInfo {
    let name = id.escapedText.toString();
    let lower = name.toLowerCase();
    let entries = info ? info.entries : [];
    const candidates = entries
      .map((e, index) => {
        const key = (() => {
          if (e.name.startsWith(name)) {
            return "0";
          }
          const lname = e.name.toLowerCase();
          if (lname.toLowerCase().startsWith(lower)) {
            return "1";
          }
          if (lname.indexOf(lower) >= 0) {
            return "2";
          }
          return "";
        })();
        if (key === "") {
          return null;
        }
        return {
          name: e.name,
          sortKey: key + e.sortText,
          index
        };
      })
      .filter(e => !!e);
    // Sort stably by using the original index.
    candidates.sort((a, b) => {
      const ord = a.sortKey.localeCompare(b.sortKey);
      return ord !== 0 ? ord : a.index - b.index;
    });
    return {
      start: id.getStart(srcFile) - srcPrefix.length,
      end: id.end - srcPrefix.length,
      candidates: candidates.map(e => e.name),
      original: info
    };
  }

  function remainingDecls(
    checker: ts.TypeChecker,
    srcSF: ts.SourceFile,
    declsSF: ts.SourceFile
  ): string {
    const declLocals = declsSF.locals as ts.SymbolTable;
    const locals = srcSF.locals as ts.SymbolTable;
    let keepMap = new Map<ts.Node, Set<ts.__String>>();
    function addName(node: ts.Node, name: ts.__String) {
      let set = keepMap.get(node);
      if (!set) {
        set = new Set();
        keepMap.set(node, set);
      }
      set.add(name);
    }
    let valueNames = new Set<ts.__String>();
    let anyVars = new Set<ts.__String>();
    declLocals.forEach((sym, key) => {
      let keep = checkKeepDeclType(checker, locals.get(key));
      if (!keep.type && !keep.value) {
        return;
      }
      sym.declarations.forEach(decl => {
        let node = decl as ts.Node;
        while (node.parent !== declsSF) {
          node = node.parent;
        }
        if (node.kind === ts.SyntaxKind.VariableStatement) {
          if (keep.value) {
            addName(node, key);
            if (anyVars.has(key)) {
              anyVars.delete(key);
            }
            valueNames.add(key);
          }
          return;
        }
        if (ts.isTypeAliasDeclaration(node)) {
          if (keep.type) {
            addName(node, key);
          }
          return;
        }
        if (ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
          if (keep.type) {
            if (keep.value) {
              addName(node, key);
            }
            // If !keep.value, forget this class.
            return;
          }
          // keep.value === true
          if (!valueNames.has(node.name.escapedText)) {
            anyVars.add(node.name.escapedText);
          }
          return;
        }
        if (ts.isImportDeclaration(node)) {
          if (keep.type && keep.value) {
            addName(node, key);
            return;
          }
          let aliased = checker.getAliasedSymbol(sym);
          if (!keep.value) {
            // Here, keep.type == true.
            if (aliased.flags & ts.SymbolFlags.Value) {
              // Overwritten with a new value.
              return;
            }
            if (aliased.flags && ts.SymbolFlags.Type) {
              addName(node, key);
            }
            return;
          }
          // Here, keep.value == true and keep.type == false.
          if (aliased.flags & ts.SymbolFlags.Type) {
            // Overwritten with a new type.
            if (
              aliased.flags & ts.SymbolFlags.Value &&
              !valueNames.has(aliased.escapedName)
            ) {
              anyVars.add(aliased.escapedName);
            }
            return;
          }
          addName(node, key);
          return;
        }
        if (ts.isFunctionDeclaration(node)) {
          if (keep.value) {
            addName(node, key);
          }
          return;
        }
        if (ts.isInterfaceDeclaration(node)) {
          if (keep.type) {
            addName(node, key);
          }
        }
        // TODO: Support more kinds.
        // console.log(
        //   ts.SyntaxKind[node.kind],
        //   ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, declsSF)
        // );
      });
    });
    let statements = [];
    declsSF.statements.forEach(stmt => {
      let names = keepMap.get(stmt);
      if (!names) {
        return;
      }
      statements.push(stmt);
      if (ts.isVariableStatement(stmt)) {
        const decls: ts.VariableDeclaration[] = [];
        stmt.declarationList.declarations.forEach(decl => {
          if (!ts.isIdentifier(decl.name)) {
            // This must not happen.
            return;
          }
          if (!names.has(decl.name.escapedText)) {
            return;
          }
          decls.push(decl);
        });
        stmt.declarationList.declarations = ts.createNodeArray(decls);
      }
      if (ts.isImportDeclaration(stmt)) {
        keepNamesInImport(stmt, names);
      }
      // Do nothing for
      // - TypeAliasDeclaration (No multiple specs)
      // - FunctionDeclaration (ditto)
      // - InterfaceDeclaration (ditto)
    });
    declsSF.statements = ts.createNodeArray(statements);
    let printer = ts.createPrinter();
    let anyVarsDecls: string[] = [];
    anyVars.forEach(name => {
      anyVarsDecls.push(`let ${name}: any;\n`);
    });
    return printer.printFile(declsSF) + anyVarsDecls.join("");
  }

  function checkKeepDeclType(
    checker: ts.TypeChecker,
    symb: ts.Symbol
  ): { value: boolean; type: boolean } {
    const ret = { value: true, type: true };
    if (!symb) {
      return ret;
    }
    if (symb.flags & ts.SymbolFlags.Alias) {
      symb = checker.getAliasedSymbol(symb);
    }
    if (symb.flags & ts.SymbolFlags.Value) {
      ret.value = false;
    }
    if (symb.flags & ts.SymbolFlags.Type) {
      ret.type = false;
    }
    return ret;
  }

  function updateContent(decls: string, src: string) {
    declContent = decls;
    srcContent = src;
    builder = null;
    // TODO: Notify updates only when src is really updated,
    // unless there is another cache layer in watcher API.
    notifyUpdateSrc(srcFilename, ts.FileWatcherEventKind.Changed);
    notifyUpdateDecls(declFilename, ts.FileWatcherEventKind.Changed);
    if (!rebuildTimer) {
      throw new Error("rebuildTimer is not set properly");
    }
    rebuildTimer.callback();
    rebuildTimer = null;
    if (!builder) {
      throw new Error("builder is not recreated");
    }
  }

  /**
   * Check if `d` is a diagnostic from a top-level await.
   * This is used to allow top-level awaits (#16).
   */
  function isTopLevelAwaitDiagnostic(
    srcFile: ts.SourceFile,
    d: ts.Diagnostic
  ): boolean {
    if (d.code !== 1308 || srcFile == null) {
      // https://github.com/microsoft/TypeScript/search?q=await_expression_is_only_allowed_within_an_async_function_1308
      return false;
    }
    const await: ts.Node = ts.tslab.findPrecedingToken(
      d.start + d.length,
      srcFile
    );
    if (await.kind !== ts.SyntaxKind.AwaitKeyword) {
      // This must not happen, though.
      return false;
    }
    let isTop = true;
    let parent = await.parent;
    while (isTop && parent && parent !== srcFile) {
      switch (parent.kind) {
        case ts.SyntaxKind.ArrowFunction:
        case ts.SyntaxKind.FunctionExpression:
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.ClassDeclaration:
        case ts.SyntaxKind.ModuleDeclaration:
          // await is not top-level. This is invalid in tslab.
          return false;
      }
      parent = parent.parent;
    }
    return true;
  }

  function adjustSrcFileOffset(
    fileName: string,
    offset: number
  ): DiagnosticPos {
    const lineChar = ts.getLineAndCharacterOfPosition(
      builder.getSourceFile(fileName),
      offset
    );
    const pos = {
      offset: offset,
      line: lineChar.line,
      character: lineChar.character
    };
    if (fileName === srcFilename || virtualFiles.has(fileName)) {
      pos.offset -= srcPrefixOffsets.offset;
      pos.line -= srcPrefixOffsets.line;
      pos.character -= srcPrefixOffsets.char;
    }
    return pos;
  }

  function convertDiagnostics(
    input: readonly ts.Diagnostic[]
  ): {
    diagnostics: Diagnostic[];
    hasToplevelAwait: boolean;
  } {
    let hasToplevelAwait = false;
    const diagnostics: Diagnostic[] = [];
    const srcFile = builder.getSourceFile(srcFilename);
    for (const d of input) {
      if (!d.file) {
        continue;
      }
      if (
        d.file.fileName === srcFilename &&
        isTopLevelAwaitDiagnostic(srcFile, d)
      ) {
        hasToplevelAwait = true;
        continue;
      }
      let fileName: string;
      if (d.file.fileName !== srcFilename) {
        const rel = pathlib.relative(cwd, d.file.fileName);
        if (rel.startsWith("..")) {
          continue;
        }
        fileName = rel;
      }
      const start = adjustSrcFileOffset(d.file.fileName, d.start);
      const end = adjustSrcFileOffset(d.file.fileName, d.start + d.length);
      if (typeof d.messageText === "string") {
        diagnostics.push({
          start,
          end,
          messageText: d.messageText.toString(),
          category: d.category,
          code: d.code,
          fileName
        });
        continue;
      }
      traverseDiagnosticMessageChain(
        start,
        end,
        d.messageText,
        diagnostics,
        fileName
      );
    }
    return { diagnostics, hasToplevelAwait };
  }

  function traverseDiagnosticMessageChain(
    start: DiagnosticPos,
    end: DiagnosticPos,
    msg: ts.DiagnosticMessageChain,
    out: Diagnostic[],
    fileName?: string
  ) {
    out.push({
      start,
      end,
      messageText: msg.messageText,
      category: msg.category,
      code: msg.code
    });
    if (!msg.next) {
      return;
    }
    for (const child of msg.next) {
      traverseDiagnosticMessageChain(start, end, child, out);
    }
  }

  /**
   * @param locals A set of names of declared variables.
   * @param setLastExprName A callback to store the created name.
   */
  function getCustomTransformers(
    locals: Set<string>,
    setLastExprName: (name: string) => void
  ): ts.CustomTransformers {
    return {
      after: [after],
      afterDeclarations: [afterDeclarations]
    };
    function createLastExprVar() {
      const prefix = "tsLastExpr";
      if (!locals.has(prefix)) {
        return prefix;
      }
      let i = 0;
      while (true) {
        let name = `${prefix}${i}`;
        if (!locals.has(name)) {
          return name;
        }
        i++;
      }
    }
    function after(): (node: ts.SourceFile) => ts.SourceFile {
      // Rewrite the output to store the last expression to a variable.
      return (node: ts.SourceFile) => {
        for (let i = node.statements.length - 1; i >= 0; i--) {
          const stmt = node.statements[i];
          if (ts.isExportDeclaration(stmt)) {
            continue;
          }
          if (!ts.isExpressionStatement(stmt)) {
            break;
          }
          const lastName = createLastExprVar();
          let statements = node.statements.slice(0, i);
          statements.push(
            ts.createVariableStatement(
              [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
              ts.createVariableDeclarationList(
                [
                  ts.createVariableDeclaration(
                    lastName,
                    undefined,
                    stmt.expression
                  )
                ],
                ts.NodeFlags.Const
              )
            )
          );
          setLastExprName(lastName);
          statements.push(...node.statements.slice(i + 1));
          node.statements = ts.createNodeArray(statements);
          break;
        }
        return node;
      };
    }
    function afterDeclarations(): (node: ts.SourceFile) => ts.SourceFile {
      // Delete all exports { ... }
      return (node: ts.SourceFile) => {
        const statements = [];
        for (const stmt of node.statements) {
          if (ts.isExportDeclaration(stmt)) {
            continue;
          }
          statements.push(stmt);
        }
        node.statements = ts.createNodeArray(statements);
        return node;
      };
    }
  }

  function addModule(name: string, content: string): Diagnostic[] {
    if (!isValidModuleName(name)) {
      throw new Error("invalid module name: " + JSON.stringify(name));
    }
    content = srcPrefix + content;
    const ext = options?.isJS ? ".js" : ".ts";
    const path = pathlib.join(cwd, name + ext);
    virtualFiles.set(path, content);
    if (fileWatchers.has(path)) {
      fileWatchers.get(path)(path, ts.FileWatcherEventKind.Changed);
    }
    builder = null;
    rootFiles.add(path);
    watch.updateRootFileNames(Array.from(rootFiles));
    if (!rebuildTimer) {
      throw new Error("rebuildTimer is not set properly");
    }
    rebuildTimer.callback();
    rebuildTimer = null;
    const file = builder.getSourceFile(path);

    const diags = ts.getPreEmitDiagnostics(builder.getProgram(), file);
    return convertDiagnostics(diags).diagnostics;
  }
}

export function isCompleteCode(content: string): IsCompleteResult {
  if (/(^|\n)\s*\n\s*$/.test(content)) {
    // Force to process src if it ends with two white-space lines.
    return { completed: true };
  }
  const src = ts.createSourceFile(
    "tmp.ts",
    content,
    ts.ScriptTarget.Latest,
    undefined,
    ts.ScriptKind.TSX
  );
  const diags: ts.DiagnosticWithLocation[] = (src as any).parseDiagnostics;
  if (!diags) {
    return { completed: true };
  }
  const end = content.length;
  for (const diag of diags) {
    if (diag.start !== end || diag.length !== 0) {
      continue;
    }
    if (typeof diag.messageText !== "string") {
      continue;
    }
    if (diag.messageText.endsWith(" expected.")) {
      const indent = indentOnEnter(content);
      return { completed: false, indent };
    }
  }
  return { completed: true };
}

function indentOnEnter(src: string): string {
  // References:
  // https://code.visualstudio.com/api/language-extensions/language-configuration-guide#indentation-rules
  // https://github.com/microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/languageConfiguration.ts
  let line = src.match(/[^\n]*$/)[0];
  let current = line.match(/^\s*/)[0];
  if (/^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$/.test(line)) {
    // decrease indent
    // TODO: Look into the indent of the previous line.
    if (current.endsWith("  ")) {
      return current.substring(0, current.length - 2);
    }
    if (current.endsWith("\t") || current.endsWith(" ")) {
      return current.substring(0, current.length - 1);
    }
    return current;
  }
  if (/^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/.test(line)) {
    // increase indent
    return current + "  ";
  }
  return current;
}

/*@internal*/
export function esModuleToCommonJSModule(
  js: string,
  target: ts.ScriptTarget
): string {
  let out = ts.transpileModule(js, {
    fileName: "custom.js",
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target,
      newLine: ts.NewLineKind.LineFeed,
      // Remove 'use strict' from outputs.
      noImplicitUseStrict: true
    }
  }).outputText;
  return out;
}

/*@internal*/
export function keepNamesInImport(
  im: ts.ImportDeclaration,
  names: Set<ts.__String>
) {
  if (!names || !names.size) {
    throw new Error("names is empty of null");
  }
  let imc = im.importClause;
  if (imc.name && !names.has(imc.name.escapedText)) {
    delete imc.name;
  }
  if (imc.namedBindings) {
    if (ts.isNamespaceImport(imc.namedBindings)) {
      if (!names.has(imc.namedBindings.name.escapedText)) {
        delete imc.namedBindings;
      }
    } else {
      let elms: ts.ImportSpecifier[] = [];
      imc.namedBindings.elements.forEach(elm => {
        if (names.has(elm.name.escapedText)) {
          elms.push(elm);
        }
      });
      if (elms.length) {
        imc.namedBindings.elements = ts.createNodeArray(elms);
      } else {
        delete imc.namedBindings;
      }
    }
  }
  if (!imc.name && !imc.namedBindings) {
    throw new Error("no symbol is included in names");
  }
}

function getCompletionsAtPosition(
  program: ts.Program,
  log: (message: string) => void,
  sourceFile: ts.SourceFile,
  position: number,
  preferences: ts.UserPreferences,
  triggerCharacter?: ts.CompletionsTriggerCharacter
): ts.CompletionInfo {
  const host: ts.LanguageServiceHost = {} as any;
  return ts.tslab.getCompletionsAtPosition(
    host,
    program,
    log,
    sourceFile,
    position,
    preferences,
    triggerCharacter
  );
}

function forwardTslabPath(cwd: string, path: string): string {
  const rel = pathlib.relative(
    pathlib.join(cwd, "node_modules", "tslab"),
    path
  );
  if (rel.startsWith("..")) {
    return path;
  }
  return pathlib.join(pathlib.dirname(__dirname), rel);
}

function getPreEmitDiagnosticsWithDependencies(
  builder: ts.BuilderProgram,
  sourceFile: ts.SourceFile
): readonly ts.Diagnostic[] {
  const files = [sourceFile];
  for (const dep of getAllSrcDependencies(builder, sourceFile)) {
    if (dep !== sourceFile.fileName) {
      files.push(builder.getSourceFile(dep));
    }
  }
  return ts.getPreEmitDiagnosticsOfFiles(builder.getProgram(), files);
}

/**
 * Get a list of all .ts and .js file dependencies (including `sourceFile`) of `sourceFile`.
 */
function getAllSrcDependencies(
  builder: ts.BuilderProgram,
  sourceFile: ts.SourceFile
): string[] {
  return builder
    .getAllDependencies(sourceFile)
    .filter(
      dep =>
        dep.endsWith(".js") || (dep.endsWith(".ts") && !dep.endsWith(".d.ts"))
    );
}
