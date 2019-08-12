import * as ts from "typescript";

// TODO: Disallow accessing "module" of Node.js.

const tsLabNs = "__tslab__";

const createSourceFileOrig = ts.createSourceFile;

export interface ConvertResult {
  output?: string;
  declOutput?: string;
  diagnostics: Diagnostic[];
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

const srcName = "__tslab__.ts";
const dstName = "__tslab__.js";
const dstDeclName = "__tslab__.d.ts";
const prevName = "__prev__.d.ts";

interface RebuildTimer {
  callback: (...args: any[]) => void;
  rand: number;
}

export function createConverter(): Converter {
  let content: string = "";
  let prevContent: string = "";
  let builder: ts.BuilderProgram = null;

  const sys = Object.create(ts.sys) as ts.System;
  let rebuildTimer: RebuildTimer = null;
  sys.setTimeout = (callback: (...args: any[]) => void): any => {
    if (rebuildTimer) {
      throw new Error("Unexpected pending rebuildTimer");
    }
    rebuildTimer = { callback, rand: Math.floor(Math.random() * 1000) };
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
    if (path === srcName) {
      return content;
    }
    if (path === prevName) {
      return prevContent;
    }
    return ts.sys.readFile(path, encoding);
  };
  sys.writeFile = function(path, data) {
    throw new Error("writeFile should not be called");
  };
  let notifyUpdateSrc: ts.FileWatcherCallback = null;
  let notifyUpdatePrev: ts.FileWatcherCallback = null;
  sys.watchFile = (path, callback) => {
    if (path === srcName) {
      notifyUpdateSrc = callback;
    } else if (path === prevName) {
      notifyUpdatePrev = callback;
    }
    return {
      close: () => {}
    };
  };
  const host = ts.createWatchCompilerHost(
    [prevName, srcName],
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
    const srcPrefix = "export {}" + sys.newLine;
    updateContent(prevDecl, srcPrefix + src);
    let program = builder.getProgram();
    let prevFile = builder.getSourceFile(prevName);
    let srcFile = builder.getSourceFile(srcName);

    const locals = (srcFile as any).locals;
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
      updateContent(prevDecl, srcPrefix + src + suffix);
      program = builder.getProgram();
      prevFile = builder.getSourceFile(prevName);
      srcFile = builder.getSourceFile(srcName);
    }
    srcFile.parent = prevFile;

    let output: string;
    let declOutput: string;
    builder.emit(
      srcFile,
      (fileName: string, data: string) => {
        if (fileName === dstName) {
          output = data;
        } else if (fileName === dstDeclName) {
          declOutput = data;
        }
      },
      undefined,
      undefined,
      getCustomTransformers()
    );
    return {
      output,
      declOutput,
      diagnostics: convertDiagnostics(
        srcPrefix.length,
        ts.getPreEmitDiagnostics(program, srcFile)
      )
    };
  }

  function updateContent(p: string, c: string) {
    content = c;
    prevContent = p;
    builder = null;
    // TODO: Notify updates only when src is really updated,
    // unless there is another cache layer in watcher API.
    notifyUpdateSrc(srcName, ts.FileWatcherEventKind.Changed);
    notifyUpdatePrev(prevName, ts.FileWatcherEventKind.Changed);
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
      ret.push({
        start: d.start - offset,
        length: d.length,
        messageText: d.messageText.toString(),
        category: d.category,
        code: d.code
      });
    }
    return ret;
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
