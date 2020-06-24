/**
 * tsapi.spec.ts checks the specs of TypeScript compiler API.
 */

import * as ts from "@tslab/typescript-for-tslab";

describe("transpile", () => {
  it("jsfile", () => {
    // With .js suffix in fileName, ts.transpileModule handle the input as JS, not TS.
    let out = ts.transpileModule('let x: string = "hello"', {
      fileName: "src.js",
      reportDiagnostics: true,
      compilerOptions: {
        newLine: ts.NewLineKind.LineFeed,
      },
    });
    expect(out.diagnostics.length).toEqual(1);
    expect(out.diagnostics[0].messageText).toEqual(
      "'types' can only be used in a .ts file."
    );
    expect(out.outputText).toEqual('var x = "hello";\n');
    expect(out.sourceMapText).toBeUndefined();
  });

  it("import to require", () => {
    let out = ts.transpileModule(
      [
        'import {a, b} from "os";',
        'import * as c from "vm";',
        "let d = a() + b;",
        "let e = x(y);",
        "export {a, b, c, d, e}",
      ].join("\n"),
      {
        fileName: "src.js",
        compilerOptions: {
          noImplicitUseStrict: true,
          module: ts.ModuleKind.CommonJS,
          newLine: ts.NewLineKind.LineFeed,
        },
      }
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.outputText).toEqual(
      [
        'Object.defineProperty(exports, "__esModule", { value: true });',
        'var os_1 = require("os");',
        "exports.a = os_1.a;",
        "exports.b = os_1.b;",
        'var c = require("vm");',
        "exports.c = c;",
        "var d = os_1.a() + os_1.b;",
        "exports.d = d;",
        "var e = x(y);",
        "exports.e = e;",
        "",
      ].join("\n")
    );
  });
});
