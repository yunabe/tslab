import * as ts from "typescript";

// TODO: Disallow accessing "module" of Node.js.

const tsLabNs = "__tslab__";

const createSourceFileOrig = ts.createSourceFile;

(ts as any).createSourceFile = function createSourceFile(
  fileName: string,
  sourceText: string,
  languageVersion: ts.ScriptTarget,
  setParentNodes?: boolean,
  scriptKind?: ts.ScriptKind
): ts.SourceFile {
  const file = createSourceFileOrig(
    fileName,
    sourceText,
    languageVersion,
    setParentNodes,
    scriptKind
  );
  ts.forEachChild(file, mod => {
    if (!ts.isModuleDeclaration(mod)) {
      return;
    }
    if (mod.name.text !== tsLabNs) {
      return;
    }
    ts.forEachChild(mod.body, stmt => {
      if (
        ts.isVariableStatement(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt)
      ) {
        addExportToNode(stmt);
      }
    });
  });
  return file;
};

function addExportToNode(node: ts.Node): void {
  if (!node.modifiers) {
    node.modifiers = ts.createNodeArray([
      ts.createModifier(ts.SyntaxKind.ExportKeyword)
    ]);
    return;
  }
  for (const modifier of node.modifiers) {
    if (modifier.kind == ts.SyntaxKind.ExportKeyword) {
      return;
    }
  }
  const modifiers: ts.Modifier[] = [
    ts.createModifier(ts.SyntaxKind.ExportKeyword)
  ];
  for (const modifier of node.modifiers) {
    modifiers.push(modifier);
  }
  node.modifiers = ts.createNodeArray(
    modifiers,
    node.modifiers.hasTrailingComma
  );
}

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

export function createConverter(): Converter {
  let content: string = "";
  let builder: ts.BuilderProgram = null;

  const sys = Object.create(ts.sys) as ts.System;
  sys.setTimeout = callback => {
    callback();
  };
  sys.readFile = function(path, encoding) {
    if (path === srcName) {
      return content;
    }
    return ts.sys.readFile(path, encoding);
  };
  sys.writeFile = function(path, data) {
    throw new Error("writeFile should not be called");
  };
  let notifyUpdate: ts.FileWatcherCallback = null;
  sys.watchFile = (path, callback) => {
    if (path === srcName) {
      notifyUpdate = callback;
    }
    return {
      close: () => {}
    };
  };
  const host = ts.createWatchCompilerHost(
    [srcName],
    {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017
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
    const prefix = "export {}" + sys.newLine;
    updateContent(prefix + src);
    const program = builder.getProgram();
    const srcFile = builder.getSourceFile(srcName);
    return {
      diagnostics: convertDiagnostics(
        prefix.length,
        ts.getPreEmitDiagnostics(program, srcFile)
      )
    };
  }

  function updateContent(c: string) {
    content = c;
    builder = null;
    notifyUpdate(srcName, ts.FileWatcherEventKind.Changed);
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
}
