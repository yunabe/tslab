import * as converter from "./converter";
import * as ts from "typescript";

let conv: converter.Converter;
beforeAll(() => {
  conv = converter.createConverter();
});
afterAll(() => {
  if (conv) {
    conv.close();
  }
});

describe("converter valid", () => {
  it("variables", () => {
    const out = conv.convert(
      "",
      `let x = 123;
const y = 'foo';
var z = true;
x *= 2;
let obj = {a: 10, b: 'hello'};
let {a, b: c} = obj;
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      `let x = 123;
exports.x = x;
const y = 'foo';
exports.y = y;
var z = true;
exports.z = z;
exports.x = x *= 2;
let obj = { a: 10, b: 'hello' };
exports.obj = obj;
let { a, b: c } = obj;
exports.a = a;
exports.c = c;
`
    );
    expect(out.declOutput).toEqual(
      `declare let x: number;
declare const y = "foo";
declare var z: boolean;
declare let obj: {
    a: number;
    b: string;
};
declare let a: number, c: string;
`
    );
  });

  it("functions", () => {
    const out = conv.convert(
      "",
      `
      function sum(x: number, y: number): number {
        return x + y;
      }
      function* xrange(n: number): IterableIterator<number> {
        for (let i = 0; i < n; i++) {
          yield i;
        }
      }
      async function sleep(ms: number) {
        return new Promise<never>(resolve => {
          setTimeout(resolve, ms);
        });
      }
      `
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      `function sum(x, y) {
    return x + y;
}
exports.sum = sum;
function* xrange(n) {
    for (let i = 0; i < n; i++) {
        yield i;
    }
}
exports.xrange = xrange;
async function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
exports.sleep = sleep;
`
    );
    expect(out.declOutput).toEqual(
      `declare function sum(x: number, y: number): number;
declare function xrange(n: number): IterableIterator<number>;
declare function sleep(ms: number): Promise<never>;
`
    );
  });

  it("destructuring", () => {
    const out = conv.convert(
      "",
      `
      let [x, y] = [123, 'hello'];
      let { a, b: c } = { a: 123, b: "hello" };
      `
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`let [x, y] = [123, 'hello'];
exports.x = x;
exports.y = y;
let { a, b: c } = { a: 123, b: \"hello\" };
exports.a = a;
exports.c = c;
`);
    expect(out.declOutput).toEqual(`declare let x: number, y: string;
declare let a: number, c: string;
`);
  });

  it("side-effect to var", () => {
    const out = conv.convert(
      "",
      `
let counter = 0;
function increment() {
  counter++;
}
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      `let counter = 0;
exports.counter = counter;
function increment() {
    exports.counter = counter += 1;
}
exports.increment = increment;
`
    );
    expect(out.declOutput).toEqual(`declare let counter: number;
declare function increment(): void;
`);
  });

  it("interfaces and classes", () => {
    const out = conv.convert(
      "",
      `interface Shape {
  color: string;
}

interface Square extends Shape {
  sideLength: number;
}

class SquareImpl implements Square {
  color: string;
  sideLength: number;

  constructor(color: string, sideLength: number) {
    this.color = color;
    this.sideLength = sideLength;
  }
}
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`class SquareImpl {
    constructor(color, sideLength) {
        this.color = color;
        this.sideLength = sideLength;
    }
}
exports.SquareImpl = SquareImpl;
`);
    expect(out.declOutput).toEqual(`interface Shape {
    color: string;
}
interface Square extends Shape {
    sideLength: number;
}
declare class SquareImpl implements Square {
    color: string;
    sideLength: number;
    constructor(color: string, sideLength: number);
}
`);
  });

  it("types", () => {
    const out = conv.convert("", `type mytype = number | string;`);
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("");
    expect(out.declOutput).toEqual("declare type mytype = number | string;\n");
  });

  it("generics", () => {
    const out = conv.convert(
      "",
      `
function identity<T>(arg: T): T {
  return arg;
}
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`function identity(arg) {
    return arg;
}
exports.identity = identity;
`);
    expect(out.declOutput).toEqual(
      "declare function identity<T>(arg: T): T;\n"
    );
  });

  it("enum", () => {
    const out = conv.convert(
      "",
      `
enum Direction {
  Up = 1,
  Down,
  Left,
  Right,
}`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`var Direction;
(function (Direction) {
    Direction[Direction["Up"] = 1] = "Up";
    Direction[Direction["Down"] = 2] = "Down";
    Direction[Direction["Left"] = 3] = "Left";
    Direction[Direction["Right"] = 4] = "Right";
})(Direction || (Direction = {}));
exports.Direction = Direction;
`);
    expect(out.declOutput).toEqual(`declare enum Direction {
    Up = 1,
    Down = 2,
    Left = 3,
    Right = 4
}
`);
  });

  it("labeled expressions look object literals", () => {
    // TODO: Revisit how to handle this ambiguity.
    let out = conv.convert("", "{x: 10}");
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`{
    x: 10;
}
`);
    expect(out.declOutput).toEqual("");

    out = conv.convert("", "{x: 3, y: 4}");
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2695,
        length: 1,
        messageText:
          "Left side of comma operator is unused and has no side effects.",
        start: 4
      },
      {
        category: 1,
        code: 2304,
        length: 1,
        messageText: "Cannot find name 'y'.",
        start: 7
      },
      {
        category: 1,
        code: 1005,
        length: 1,
        messageText: "';' expected.",
        start: 8
      }
    ]);
  });

  it("imported", () => {
    const out = conv.convert(
      "",
      `
import * as os from "os";
const os2 = os;
import { CpuInfo, UserInfo } from "os";
let info: CpuInfo;
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`const os = require(\"os\");
exports.os = os;
const os2 = os;
exports.os2 = os2;
let info;
exports.info = info;
`);
    // let info: CpuInfo; in src causes /// reference for some reason.
    // TODO: Understand why /// reference is in the output.
    expect(out.declOutput).toEqual(`/// <reference types="node" />
import * as os from "os";
declare const os2: typeof os;
import { CpuInfo, UserInfo } from "os";
declare let info: CpuInfo;
`);
  });

  it("indirect import", () => {
    const out = conv.convert(
      "",
      `
import { userInfo } from "os";
let info = userInfo();
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      `/// <reference types="node" />
import { userInfo } from \"os\";
declare let info: import(\"os\").UserInfo<string>;
`
    );
  });

  it("interface merge", () => {
    // Interfaces are not merged in declOutput.
    const out = conv.convert(
      "",
      `
      interface MyInterface {
        abc: number;
      }
      interface MyInterface {
        xyz: string;
      }
      let obj: MyInterface = {
        abc: 123,
        xyz: "hello"
      };
      `
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`let obj = {
    abc: 123,
    xyz: \"hello\"
};
exports.obj = obj;
`);
    expect(out.declOutput).toEqual(`interface MyInterface {
    abc: number;
}
interface MyInterface {
    xyz: string;
}
declare let obj: MyInterface;
`);
  });
});

describe("converter diagnostics", () => {
  it("syntax error", () => {
    const out = conv.convert("", `let x + 10;`);
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 1005,
        length: 1,
        messageText: "',' expected.",
        start: 6
      }
    ]);
  });

  it("type error", () => {
    const out = conv.convert("", `let x: string = 10;`);
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2322,
        length: 1,
        messageText: "Type '10' is not assignable to type 'string'.",
        start: 4
      }
    ]);
  });

  it("redeclare variable", () => {
    const out = conv.convert("", `let x = 3; let x = 4;`);
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2451,
        length: 1,
        messageText: "Cannot redeclare block-scoped variable 'x'.",
        start: 4
      },
      {
        category: 1,
        code: 2451,
        length: 1,
        messageText: "Cannot redeclare block-scoped variable 'x'.",
        start: 15
      }
    ]);
  });

  it("wrong implementation", () => {
    const out = conv.convert(
      "",
      `interface Shape {
  color: string;
}

class ShapeImpl implements Shape {}
`
    );
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2420,
        length: 9,
        messageText:
          "Class 'ShapeImpl' incorrectly implements interface 'Shape'.",
        start: 44
      },
      {
        category: 1,
        code: 2741,
        length: 9,
        messageText:
          "Property 'color' is missing in type 'ShapeImpl' but required in type 'Shape'.",
        start: 44
      }
    ]);
  });

  it("overwrite-implicit-types", () => {
    const out = conv.convert(
      "",
      `
      async function fn() {
        return 0;
      }
      class Promise {}
      `
    );
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 4060,
        length: 2,
        messageText:
          "Return type of exported function has or is using private name 'Promise'.",
        start: 22
      }
    ]);
  });
});

describe("with prev", () => {
  it("basics", () => {
    const out0 = conv.convert("", "let x = 123;");
    expect(out0.diagnostics).toEqual([]);
    expect(out0.declOutput).toEqual("declare let x: number;\n");
    const out1 = conv.convert(out0.declOutput, "let y = x * x;");
    expect(out1.diagnostics).toEqual([]);
    expect(out1.output).toEqual("let y = x * x;\nexports.y = y;\n");
    // TODO: Include let x; into out1.declOutput.
    expect(out1.declOutput).toEqual(
      "declare let y: number;\ndeclare let x: number;\n"
    );
  });

  it("assign to prev", () => {
    const out = conv.convert("declare let x: number\n", "x = x * x;\n");
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("x = x * x;\n");
    expect(out.declOutput).toEqual("declare let x: number;\n");
  });

  it("assign to prev const", () => {
    const out = conv.convert("declare const x: number\n", "x = x * x;\n");
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2588,
        length: 1,
        messageText: "Cannot assign to 'x' because it is a constant.",
        start: 0
      }
    ]);
  });

  it("overwrite-old-variable", () => {
    const out = conv.convert(
      "declare let x: number, y: string;\ndeclare let z: boolean;\ndeclare const a: number\n",
      "let x = true;\nlet z = 'z';"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      [
        "declare let x: boolean;",
        "declare let z: string;",
        "declare let y: string;",
        "declare const a: number;"
      ].join("\n") + "\n"
    );
  });

  it("overwrite prev type alias", () => {
    const out = conv.convert(
      "interface itype {x: number;}\ntype atype = itype | number;",
      "class itype { y: string; }\nlet atype = 123;"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`class itype {
}
exports.itype = itype;
let atype = 123;
exports.atype = atype;
`);
    expect(out.declOutput).toEqual(`declare class itype {
    y: string;
}
declare let atype: number;
type atype = itype | number;
`);
  });

  it("overwrite prev class with value", () => {
    const out = conv.convert("class A {}\nclass B {}\n", "let A = 10;");
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("let A = 10;\nexports.A = A;\n");
    expect(out.declOutput).toEqual("declare let A: number;\nclass B {\n}\n");
  });

  it("overwrite prev class with type", () => {
    const out = conv.convert(
      "class A {}\nclass B {}\n",
      "interface A {x: number}"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("");
    expect(out.declOutput).toEqual(`interface A {
    x: number;
}
class B {
}
let A: any;
`);
  });

  it("overwrite imported type", () => {
    const out = conv.convert(
      'import { CpuInfo, UserInfo } from "os";',
      "interface CpuInfo {x: number}"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("");
    expect(out.declOutput).toEqual(`interface CpuInfo {
    x: number;
}
import { UserInfo } from "os";
`);
  });

  it("merge imported type and new value", () => {
    const out = conv.convert(
      'import { CpuInfo } from "os";',
      "let CpuInfo = 10;"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(`declare let CpuInfo: number;
import { CpuInfo } from "os";
`);
  });

  it("overwrite imported value", () => {
    const out = conv.convert('import { cpus } from "os";', "let cpus = 10");
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual("declare let cpus: number;\n");
  });

  it("merge imported value and new type", () => {
    const out = conv.convert(
      'import { cpus } from "os";',
      "type cpus = number;"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      'declare type cpus = number;\nimport { cpus } from "os";\n'
    );
  });

  it("overwrite imported namespace with value", () => {
    const out = conv.convert('import * as os from "os";', "let os = 10;");
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("let os = 10;\nexports.os = os;\n");
    expect(out.declOutput).toEqual("declare let os: number;\n");
  });

  it("merge imported namespace with new type", () => {
    const out = conv.convert('import * as os from "os";', "type os = string;");
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("");
    expect(out.declOutput).toEqual(
      'declare type os = string;\nimport * as os from "os";\n'
    );
  });

  it("overwrite-global", () => {
    let out = conv.convert("", "let x = process;");
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(`/// <reference types="node" />
declare let x: NodeJS.Process;
`);
    out = conv.convert("declare let process: number", "let x = process;");
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      "declare let x: number;\ndeclare let process: number;\n"
    );
  });

  it("overwrite-global-interface", () => {
    let out = conv.convert(
      "",
      `
interface Map {
  mymethod(): number;
}
function createMap(): Map {
  return null;
}
let m = createMap();
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      `interface Map {
    mymethod(): number;
}
declare function createMap(): Map;
declare let m: Map;
`
    );
    out = conv.convert(out.declOutput, "let n = createMap();");
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      [
        "declare let n: Map;",
        "interface Map {",
        "    mymethod(): number;",
        "}",
        "declare function createMap(): Map;",
        "declare let m: Map;",
        ""
      ].join("\n")
    );
  });

  it("bug: can not call named imported functions", () => {
    let out = conv.convert("", 'import {join} from "path";');
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      [
        'const path_1 = require("path");',
        "exports.join = path_1.join;",
        ""
      ].join("\n")
    );
    out = conv.convert(out.declOutput, 'join("a", "b");');
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual('import { join } from "path";\n');
    // TODO: Fix this.
    expect(out.output).toEqual('path_1.join("a", "b");\n');
  });

  it("bug: can not call named imported functions", () => {
    let out = conv.convert("", 'import {join} from "path";\nlet path_1 = 10;');
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      [
        'const path_1 = require("path");',
        "exports.join = path_1.join;",
        ""
      ].join("\n")
    );
    out = conv.convert(out.declOutput, 'join("a", "b");');
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual('import { join } from "path";\n');
    // TODO: Fix this.
    expect(out.output).toEqual('path_1.join("a", "b");\n');
  });
});

describe("keepNamesInImport", () => {
  it("keep named import", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, {foo, bar as baz} from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["foo"]);
    converter.keepNamesInImport(stmt, names as Set<ts.__String>);
    let printer = ts.createPrinter();
    expect(printer.printFile(src)).toEqual('import { foo } from "mylib";\n');
  });

  it("keep renamed import", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, {foo, bar as baz} from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["baz"]);
    converter.keepNamesInImport(stmt, names as Set<ts.__String>);
    let printer = ts.createPrinter();
    expect(printer.printFile(src)).toEqual(
      'import { bar as baz } from "mylib";\n'
    );
  });

  it("keep default import", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, {foo, bar as baz} from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["mydefault"]);
    converter.keepNamesInImport(stmt, names as Set<ts.__String>);
    let printer = ts.createPrinter();
    expect(printer.printFile(src)).toEqual('import mydefault from "mylib";\n');
  });

  it("keep default and named import", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, {foo, bar as baz} from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["mydefault", "baz"]);
    converter.keepNamesInImport(stmt, names as Set<ts.__String>);
    let printer = ts.createPrinter();
    expect(printer.printFile(src)).toEqual(
      'import mydefault, { bar as baz } from "mylib";\n'
    );
  });

  it("keep namespace", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, * as ns from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["ns"]);
    converter.keepNamesInImport(stmt, names as Set<ts.__String>);
    let printer = ts.createPrinter();
    expect(printer.printFile(src)).toEqual('import * as ns from "mylib";\n');
  });

  it("keep default remove namespace", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, * as ns from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["mydefault"]);
    converter.keepNamesInImport(stmt, names as Set<ts.__String>);
    let printer = ts.createPrinter();
    expect(printer.printFile(src)).toEqual('import mydefault from "mylib";\n');
  });

  it("wrong names", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, * as ns from "mylib";',
      ts.ScriptTarget.ES2017
    );
    const stmt = src.statements[0];
    if (!ts.isImportDeclaration(stmt)) {
      fail("stmt is not isImportDeclaration");
      return;
    }
    const names = new Set(["wrong"]);
    try {
      converter.keepNamesInImport(stmt, names as Set<ts.__String>);
      fail("keepNamesInImport must fail.");
    } catch (e) {
      expect(String(e)).toEqual("Error: no symbol is included in names");
    }
  });
});
