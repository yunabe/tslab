import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as ts from "typescript";

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
  vars: Map<string, string>;
  types: Map<string, string>;

  scriptName: string;
  scriptContent: string;
  scriptVersion: number;

  service: ts.LanguageService;

  convert(prevDecl: string, src: string): ConvertResult;
}

class ConverterImpl implements Converter {
  vars: Map<string, string>;
  types: Map<string, string>;

  scriptName: string;
  scriptContent: string;
  scriptVersion: number;

  service: ts.LanguageService;

  constructor() {
    this.vars = new Map();
    this.types = new Map();
    this.scriptName = "__tslab__.ts";
    this.scriptContent = "";
    this.scriptVersion = 0;
    this.service = null;
  }

  private setContent(content: string) {
    this.scriptVersion++;
    this.scriptContent = content;
  }

  static convertDiagnostics(
    offset: number,
    input: readonly ts.Diagnostic[],
    out: Diagnostic[]
  ) {
    for (const d of input) {
      if (d.file.fileName !== "__tslab__.ts") {
        continue;
      }
      out.push({
        start: d.start - offset,
        length: d.length,
        messageText: d.messageText.toString(),
        category: d.category,
        code: d.code
      });
    }
  }

  convert(prevDecl: string, src: string): ConvertResult {
    const srcPrefix = `export {}
${prevDecl}
export namespace __tslab__ {
`;
    this.setContent(`${srcPrefix}${src}
}`);
    const program = this.service.getProgram();
    const diagnostics: Diagnostic[] = [];
    ConverterImpl.convertDiagnostics(
      srcPrefix.length,
      program.getSyntacticDiagnostics(),
      diagnostics
    );
    return {
      diagnostics
    };

    /*
    let emit = this.service.getEmitOutput(this.scriptName);
    console.log("emit.emitSkipped", emit.emitSkipped);
    if (emit.emitSkipped) {
      return;
    }
    for (const out of emit.outputFiles) {
      console.log(out.name, "=====\n", out.text);
    }
    return {};

    const program = this.service.getProgram();
    const sf = program.getSourceFile(this.scriptName);
    let checker = program.getTypeChecker();
    function visit(node: ts.Node) {
      const symb = checker.getSymbolAtLocation(node);
      if (symb) {
        // console.log("sym", symb, "--------------\n", node.getText());
        const typ = checker.getTypeAtLocation(node);
        console.log("----node---:\n", node.getText());
        console.log("---type---:\n", checker.typeToString(typ));
        const typ2 = checker.getDeclaredTypeOfSymbol(symb);
        console.log("---typ2---:\n", checker.typeToString(typ2));
        for (let decl of symb.getDeclarations()) {
          console.log("decl:", decl.getText());
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    let symbols = checker.getSymbolsInScope(
      sf,
      ts.SymbolFlags.BlockScopedVariable
    );
    const symb = checker.getSymbolAtLocation(sf);
    symb.
    console.log("symbols", symbols);
    */
  }
}

export function createConverter(): Converter {
  const converter = new ConverterImpl();
  const host = createLanguageServiceHost(converter);
  converter.service = ts.createLanguageService(
    host,
    ts.createDocumentRegistry()
  );
  return converter;
}

function createLanguageServiceHost(
  conv: ConverterImpl
): ts.LanguageServiceHost {
  function getScriptFileNames() {
    return [conv.scriptName];
  }
  function getProjectVersion() {
    return String(conv.scriptVersion);
  }
  function getScriptVersion(fileName: string) {
    if (fileName == conv.scriptName) {
      return String(conv.scriptVersion);
    }
    return "0";
  }
  function getScriptSnapshot(fileName: string) {
    console.log("getScriptSnapshot:", fileName);
    if (fileName == conv.scriptName) {
      return ts.ScriptSnapshot.fromString(conv.scriptContent);
    }
    return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName).toString());
  }
  function getCurrentDirectory() {
    const cwd = process.cwd();
    console.log("getCurrentDirectory", cwd);
    return cwd;
  }
  function getCompilationSettings(): ts.CompilerOptions {
    console.log("getCompilationSettings...");
    return {
      declaration: true,
      sourceMap: true,
      newLine: ts.NewLineKind.LineFeed,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017
      // TODO: Set lib to disable DOM API. ["es2017"] does not work for some reason.
    };
  }
  function getDefaultLibFileName(options: ts.CompilerOptions): string {
    const lib = ts.getDefaultLibFilePath(options);
    console.log("getDefaultLibFileName:", lib);
    return lib;
  }
  function fileExists(path: string) {
    let exist = ts.sys.fileExists(path);
    console.trace("fileExists: ", path, exist);
    return exist;
  }
  function readFile(path: string, encoding?: string): string {
    console.log("readFile:", path);
    return ts.sys.readFile(path, encoding);
  }
  function readDirectory(
    path: string,
    extensions?: ReadonlyArray<string>,
    exclude?: ReadonlyArray<string>,
    include?: ReadonlyArray<string>,
    depth?: number
  ): string[] {
    console.log("readDirectory:", path);
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  }
  function getCustomTransformers(): ts.CustomTransformers {
    return {
      before: [before]
    };
    function before(
      context: ts.TransformationContext
    ): (node: ts.SourceFile) => ts.SourceFile {
      console.log("======= before ========");
      return (node: ts.SourceFile) => {
        ts.forEachChild(node, chld => {
          console.log("chld.kind", chld.kind);
          if (chld.kind == ts.SyntaxKind.ModuleDeclaration) {
            console.log("*** module 1 ***");
          }
          if (ts.isModuleDeclaration(chld)) {
            console.log("*** module ***");
            ts.forEachChild(chld.body, n => {
              console.log("n ==", n.getText(), ts.SyntaxKind[n.kind], n.flags);
              if (ts.isVariableStatement(n)) {
                if (!n.modifiers) {
                  n.modifiers = ts.createNodeArray([
                    ts.createModifier(ts.SyntaxKind.ExportKeyword)
                  ]);
                  console.log("n2 ==", n.getText());
                }
              }
            });
          }
        });
        return node;
      };
    }
  }
  return {
    getCustomTransformers,
    getScriptFileNames,
    getProjectVersion,
    getScriptVersion,
    getScriptSnapshot,
    getCurrentDirectory,
    getCompilationSettings,
    getDefaultLibFileName,
    fileExists,
    readFile,
    readDirectory
  };
}
