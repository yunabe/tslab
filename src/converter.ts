import * as ts from "typescript";

// TODO: Disallow accessing "module" of Node.js.

const createSourceFileOrig = ts.createSourceFile;

export interface ConvertResult {
  output?: string;
  declOutput?: string;
  diagnostics: Diagnostic[];
  hasLastExpression: boolean;
}

export interface Diagnostic {
  start: number;
  length: number;
  messageText: string;
  category: number;
  code: number;
}

export interface Converter {
  convert(prevDecl: string, src: string): ConvertResult;
  close(): void;
}

const srcFilename = "__tslab__.ts";
const dstFilename = "__tslab__.js";
const dstDeclFilename = "__tslab__.d.ts";
const declFilename = "__prev__.d.ts";

interface RebuildTimer {
  callback: (...args: any[]) => void;
}

export function createConverter(): Converter {
  const srcPrefix = "export {}" + ts.sys.newLine;
  let srcContent: string = "";
  let declContent: string = "";
  let builder: ts.BuilderProgram = null;

  const sys = Object.create(ts.sys) as ts.System;
  let rebuildTimer: RebuildTimer = null;
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
    return ts.sys.readFile(path, encoding);
  };
  sys.writeFile = function(path, data) {
    throw new Error("writeFile should not be called");
  };
  let notifyUpdateSrc: ts.FileWatcherCallback = null;
  let notifyUpdateDecls: ts.FileWatcherCallback = null;
  sys.watchFile = (path, callback) => {
    if (path === srcFilename) {
      notifyUpdateSrc = callback;
    } else if (path === declFilename) {
      notifyUpdateDecls = callback;
    }
    return {
      close: () => {}
    };
  };
  const host = ts.createWatchCompilerHost(
    [declFilename, srcFilename],
    {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017,
      declaration: true,
      // Remove 'use strict' from outputs.
      noImplicitUseStrict: true
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
    convert
  };

  function close() {
    watch.close();
  }

  function convert(prevDecl: string, src: string): ConvertResult {
    updateContent(prevDecl, src);
    let program = builder.getProgram();
    let declsFile = builder.getSourceFile(declFilename);
    let srcFile = builder.getSourceFile(srcFilename);

    const hasLastExpression = checkHasLastExpression(srcFile);
    const locals = (srcFile as any).locals as ts.SymbolTable;
    const keys: string[] = [];
    if (locals) {
      locals.forEach((_: any, key: any) => {
        keys.push(key);
      });
    }
    if (keys.length > 0) {
      // Export all local variables.
      // TODO: Disallow "export" in the input.
      const suffix = "\nexport {" + keys.join(", ") + "}";
      updateContent(prevDecl, src + suffix);
      program = builder.getProgram();
      declsFile = builder.getSourceFile(declFilename);
      srcFile = builder.getSourceFile(srcFilename);
    }
    srcFile.parent = declsFile;

    let output: string;
    let declOutput: string;
    builder.emit(
      srcFile,
      (fileName: string, data: string) => {
        if (fileName === dstFilename) {
          output = data;
        } else if (fileName === dstDeclFilename) {
          declOutput = data;
        }
      },
      undefined,
      undefined,
      getCustomTransformers()
    );
    declOutput += remainingDecls(program.getTypeChecker(), srcFile, declsFile);
    return {
      output,
      declOutput,
      diagnostics: convertDiagnostics(
        srcPrefix.length,
        ts.getPreEmitDiagnostics(program, srcFile)
      ),
      hasLastExpression
    };
  }

  function remainingDecls(
    checker: ts.TypeChecker,
    srcSF: ts.SourceFile,
    declsSF: ts.SourceFile
  ): string {
    const declLocals = (declsSF as any).locals as ts.SymbolTable;
    const locals = (srcSF as any).locals as ts.SymbolTable;
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
        if (ts.isClassDeclaration(node)) {
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

  function convertDiagnostics(
    offset: number,
    input: readonly ts.Diagnostic[]
  ): Diagnostic[] {
    const ret: Diagnostic[] = [];
    for (const d of input) {
      if (!d.file || d.file.fileName !== "__tslab__.ts") {
        continue;
      }
      if (typeof d.messageText === "string") {
        ret.push({
          start: d.start - offset,
          length: d.length,
          messageText: d.messageText.toString(),
          category: d.category,
          code: d.code
        });
        continue;
      }
      traverseDiagnosticMessageChain(
        d.start - offset,
        d.length,
        d.messageText,
        ret
      );
    }
    return ret;
  }

  function traverseDiagnosticMessageChain(
    start: number,
    length: number,
    msg: ts.DiagnosticMessageChain,
    out: Diagnostic[]
  ) {
    out.push({
      start,
      length,
      messageText: msg.messageText,
      category: msg.category,
      code: msg.code
    });
    if (!msg.next) {
      return;
    }
    for (const child of msg.next) {
      traverseDiagnosticMessageChain(start, length, child, out);
    }
  }

  function getCustomTransformers(): ts.CustomTransformers {
    return {
      after: [after],
      afterDeclarations: [afterDeclarations]
    };
    function after(
      context: ts.TransformationContext
    ): (node: ts.SourceFile) => ts.SourceFile {
      return (node: ts.SourceFile) => {
        // Delete Object.defineProperty(exports, \"__esModule\", { value: true });
        node.statements = ts.createNodeArray(node.statements.slice(1));
        return node;
      };
    }
    function afterDeclarations(
      context: ts.TransformationContext
    ): (node: ts.SourceFile) => ts.SourceFile {
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
}

function checkHasLastExpression(src: ts.SourceFile) {
  if (!src.statements.length) {
    return false;
  }
  const last = src.statements[src.statements.length - 1];
  return ts.isExpressionStatement(last);
}

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
