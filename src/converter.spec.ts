import * as converter from "./converter";
import * as ts from "@tslab/typescript-for-tslab";
import {
  runInTmp,
  runInTmpAsync,
  sleep,
  WaitFileEventFunc,
  createConverterWithFileWatcher
} from "./testutil";
import fs from "fs";
import pathlib from "path";

let conv: converter.Converter;
let waitFileEvent: WaitFileEventFunc;
beforeAll(() => {
  ({ converter: conv, waitFileEvent } = createConverterWithFileWatcher());
});
afterAll(() => {
  if (conv) {
    conv.close();
  }
});

function buildOutput(
  lines: string[],
  opts?: {
    noEsModule?: boolean;
    importStar?: boolean;
    importDefault?: boolean;
  }
): string {
  const out: string[] = [];
  if (opts && opts.importDefault) {
    out.push(
      ...[
        "var __importDefault = (this && this.__importDefault) || function (mod) {",
        '    return (mod && mod.__esModule) ? mod : { "default": mod };',
        "};"
      ]
    );
  }
  if (opts && opts.importStar) {
    out.push(
      ...[
        "var __importStar = (this && this.__importStar) || function (mod) {",
        "    if (mod && mod.__esModule) return mod;",
        "    var result = {};",
        "    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];",
        '    result["default"] = mod;',
        "    return result;",
        "};"
      ]
    );
  }
  if (!opts || !opts.noEsModule) {
    // cf. https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#support-for-import-d-from-cjs-from-commonjs-modules-with---esmoduleinteropa
    out.push('Object.defineProperty(exports, "__esModule", { value: true });');
  }
  out.push(...lines);
  out.push("");
  return out.join("\n");
}

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
      buildOutput([
        "let x = 123;",
        "exports.x = x;",
        "const y = 'foo';",
        "exports.y = y;",
        "var z = true;",
        "exports.z = z;",
        "exports.x = x *= 2;",
        "let obj = { a: 10, b: 'hello' };",
        "exports.obj = obj;",
        "let { a, b: c } = obj;",
        "exports.a = a;",
        "exports.c = c;"
      ])
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
      buildOutput([
        "function sum(x, y) {",
        "    return x + y;",
        "}",
        "exports.sum = sum;",
        "function* xrange(n) {",
        "    for (let i = 0; i < n; i++) {",
        "        yield i;",
        "    }",
        "}",
        "exports.xrange = xrange;",
        "async function sleep(ms) {",
        "    return new Promise(resolve => {",
        "        setTimeout(resolve, ms);",
        "    });",
        "}",
        "exports.sleep = sleep;"
      ])
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
    expect(out.output).toEqual(
      buildOutput([
        "let [x, y] = [123, 'hello'];",
        "exports.x = x;",
        "exports.y = y;",
        'let { a, b: c } = { a: 123, b: "hello" };',
        "exports.a = a;",
        "exports.c = c;"
      ])
    );
    expect(out.declOutput).toEqual(`declare let x: number, y: string;
declare let a: number, c: string;
`);
  });

  it("optional chaining and nullish coalescing", () => {
    // Supported since TypeScript 3.7
    const out = conv.convert(
      "",
      `
      let obj: any = null;
      let a = obj?.a?.b;
      let b = a ?? obj;
      `
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput([
        "var _a, _b;",
        "let obj = null;",
        "exports.obj = obj;",
        "let a = (_b = (_a = obj) === null || _a === void 0 ? void 0 : _a.a) === null || _b === void 0 ? void 0 : _b.b;",
        "exports.a = a;",
        "let b = (a !== null && a !== void 0 ? a : obj);",
        "exports.b = b;"
      ])
    );
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
      buildOutput([
        "let counter = 0;",
        "exports.counter = counter;",
        "function increment() {",
        "    exports.counter = counter += 1;",
        "}",
        "exports.increment = increment;"
      ])
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
    expect(out.output).toEqual(
      buildOutput([
        "class SquareImpl {",
        "    constructor(color, sideLength) {",
        "        this.color = color;",
        "        this.sideLength = sideLength;",
        "    }",
        "}",
        "exports.SquareImpl = SquareImpl;"
      ])
    );
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
    expect(out.output).toEqual(
      buildOutput([
        "function identity(arg) {",
        "    return arg;",
        "}",
        "exports.identity = identity;"
      ])
    );
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
    expect(out.output).toEqual(
      buildOutput([
        "var Direction;",
        "exports.Direction = Direction;",
        "(function (Direction) {",
        '    Direction[Direction["Up"] = 1] = "Up";',
        '    Direction[Direction["Down"] = 2] = "Down";',
        '    Direction[Direction["Left"] = 3] = "Left";',
        '    Direction[Direction["Right"] = 4] = "Right";',
        "})(Direction || (exports.Direction = Direction = {}));"
      ])
    );
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
    expect(out.output).toEqual(
      buildOutput(["{", "    x: 10;", "}"], { noEsModule: true })
    );
    expect(out.declOutput).toEqual("");

    out = conv.convert("", "{x: 3, y: 4}");
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2695,
        messageText:
          "Left side of comma operator is unused and has no side effects.",
        start: {
          character: 4,
          line: 0,
          offset: 4
        },
        end: {
          character: 5,
          line: 0,
          offset: 5
        }
      },
      {
        category: 1,
        code: 2304,
        messageText: "Cannot find name 'y'.",
        start: {
          character: 7,
          line: 0,
          offset: 7
        },
        end: {
          character: 8,
          line: 0,
          offset: 8
        }
      },
      {
        category: 1,
        code: 1005,
        messageText: "';' expected.",
        start: {
          character: 8,
          line: 0,
          offset: 8
        },
        end: {
          character: 9,
          line: 0,
          offset: 9
        }
      }
    ]);
  });

  it("import", () => {
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
    expect(out.output).toEqual(
      buildOutput(
        [
          'const os = __importStar(require("os"));',
          "exports.os = os;",
          "const os2 = os;",
          "exports.os2 = os2;",
          "let info;",
          "exports.info = info;"
        ],
        { importStar: true }
      )
    );
    // let info: CpuInfo; in src causes /// reference for some reason.
    // TODO: Understand why /// reference is in the output.
    expect(out.declOutput).toEqual(`/// <reference types="node" />
import * as os from "os";
declare const os2: typeof os;
import { CpuInfo, UserInfo } from "os";
declare let info: CpuInfo;
`);
  });

  it("import default", () => {
    // Test esModuleInterop
    const out = conv.convert(
      "",
      `import os from "os";
let info: os.CpuInfo;
import * as pathlib from "path";
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput(
        [
          'const os_1 = __importDefault(require("os"));',
          "exports.os = os_1.default;",
          "let info;",
          "exports.info = info;",
          'const pathlib = __importStar(require("path"));',
          "exports.pathlib = pathlib;"
        ],
        { importDefault: true, importStar: true }
      )
    );
    expect(out.declOutput).toEqual(`/// <reference types="node" />
import os from "os";
declare let info: os.CpuInfo;
import * as pathlib from "path";
`);
  });

  it("indirect import", () => {
    // UserInfo<string> is imported indirectly.
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

  it("dynamic import", async () => {
    const out = conv.convert(
      "",
      `
const {userInfo} = await import("os");
let info = userInfo();
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput(
        [
          'const { userInfo } = await Promise.resolve().then(() => __importStar(require("os")));',
          "exports.userInfo = userInfo;",
          "let info = userInfo();",
          "exports.info = info;"
        ],
        { importStar: true }
      )
    );
    expect(out.declOutput).toEqual(
      `/// <reference types="node" />
declare const userInfo: typeof import("os").userInfo;
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
    expect(out.output).toEqual(
      buildOutput([
        "let obj = {",
        "    abc: 123,",
        '    xyz: "hello"',
        "};",
        "exports.obj = obj;"
      ])
    );
    expect(out.declOutput).toEqual(`interface MyInterface {
    abc: number;
}
interface MyInterface {
    xyz: string;
}
declare let obj: MyInterface;
`);
  });

  it("decorators", () => {
    const out = conv.convert(
      "",
      `
      function sealed(constructor: Function) {
        Object.seal(constructor);
        Object.seal(constructor.prototype);
      }

      @sealed
      class Greeter {}
      `
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toContain("Greeter = __decorate([");
  });
});

describe("converter diagnostics", () => {
  it("syntax error", () => {
    const out = conv.convert("", `let x + 10;`);
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 1005,
        messageText: "',' expected.",
        start: {
          character: 6,
          line: 0,
          offset: 6
        },
        end: {
          character: 7,
          line: 0,
          offset: 7
        }
      }
    ]);
  });

  it("type error", () => {
    const out = conv.convert("", `let x: string = 10;`);
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2322,
        messageText: "Type '10' is not assignable to type 'string'.",
        start: {
          character: 4,
          line: 0,
          offset: 4
        },
        end: {
          character: 5,
          line: 0,
          offset: 5
        }
      }
    ]);
  });

  it("redeclare variable", () => {
    const out = conv.convert("", `let x = 3; let x = 4;`);
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2451,
        messageText: "Cannot redeclare block-scoped variable 'x'.",
        start: {
          character: 4,
          line: 0,
          offset: 4
        },
        end: {
          character: 5,
          line: 0,
          offset: 5
        }
      },
      {
        category: 1,
        code: 2451,
        messageText: "Cannot redeclare block-scoped variable 'x'.",
        start: {
          character: 15,
          line: 0,
          offset: 15
        },
        end: {
          character: 16,
          line: 0,
          offset: 16
        }
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
        messageText:
          "Class 'ShapeImpl' incorrectly implements interface 'Shape'.",
        start: {
          character: 6,
          line: 4,
          offset: 44
        },
        end: {
          character: 15,
          line: 4,
          offset: 53
        }
      },
      {
        category: 1,
        code: 2741,
        messageText:
          "Property 'color' is missing in type 'ShapeImpl' but required in type 'Shape'.",
        start: {
          character: 6,
          line: 4,
          offset: 44
        },
        end: {
          character: 15,
          line: 4,
          offset: 53
        }
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
        messageText:
          "Return type of exported function has or is using private name 'Promise'.",
        start: {
          character: 21,
          line: 1,
          offset: 22
        },
        end: {
          character: 23,
          line: 1,
          offset: 24
        }
      }
    ]);
  });

  it("top-level await", () => {
    const out = conv.convert(
      "",
      `async function asyncHello() {
        return "Hello, World!";
      }
      let msg = await asyncHello();`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput([
        "async function asyncHello() {",
        '    return "Hello, World!";',
        "}",
        "exports.asyncHello = asyncHello;",
        "let msg = await asyncHello();",
        "exports.msg = msg;"
      ])
    );
    expect(out.declOutput).toEqual(
      [
        "declare function asyncHello(): Promise<string>;",
        "declare let msg: string;",
        ""
      ].join("\n")
    );
  });

  it("require is reserved", () => {
    // TODO: Reenable checkCollisionWithRequireExportsInGeneratedCode.
    const out = conv.convert("", "let require = 123;");
    expect(out.diagnostics).toEqual([]);
  });

  it("lastExpressionVar", () => {
    let out = conv.convert("", "let x = 3 + 4\n;x * x;");
    expect(out.diagnostics).toEqual([]);
    expect(out.lastExpressionVar).toBe("tsLastExpr");
    expect(out.output).toEqual(
      buildOutput([
        "let x = 3 + 4;",
        "exports.x = x;",
        "exports.tsLastExpr = x * x;"
      ])
    );

    out = conv.convert("", "let x = 3 + 4\n;let y = x * x;");
    expect(out.diagnostics).toEqual([]);
    expect(out.lastExpressionVar).toBeUndefined();

    out = conv.convert("", "class C {}");
    expect(out.diagnostics).toEqual([]);
    expect(out.lastExpressionVar).toBeUndefined();

    out = conv.convert(
      "",
      "let tsLastExpr = 10; const tsLastExpr0 = 30; tsLastExpr + tsLastExpr0;"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.lastExpressionVar).toEqual("tsLastExpr1");
    expect(out.output).toEqual(
      buildOutput([
        "let tsLastExpr = 10;",
        "exports.tsLastExpr = tsLastExpr;",
        "const tsLastExpr0 = 30;",
        "exports.tsLastExpr0 = tsLastExpr0;",
        "exports.tsLastExpr1 = tsLastExpr + tsLastExpr0;"
      ])
    );
  });

  describe("non-top-level await", () => {
    const tests = [
      {
        name: "function expression",
        src: "let f = function() { return await asyncHello(); }"
      },
      {
        name: "arrow function",
        src: "let f = () => { return await asyncHello(); }"
      },
      {
        name: "arrow function w/o block",
        src: "let f = () => await asyncHello()"
      },
      {
        name: "function declaration",
        src: "function f() { return await asyncHello(); }"
      },
      {
        name: "class declaration",
        src: "class Cls { f() { return await asyncHello(); } }"
      },
      {
        name: "namespace",
        src: "namespace ns { await asyncHello(); }"
      }
    ];
    for (const tt of tests) {
      it(tt.name, () => {
        const out = conv.convert(
          "",
          `async function asyncHello() {
          return 'Hello, async!';
        }
        ` + tt.src
        );
        expect(out.diagnostics.map(e => e.messageText)).toEqual([
          "'await' expression is only allowed within an async function."
        ]);
      });
    }
  });
});

describe("with prev", () => {
  it("basics", () => {
    const out0 = conv.convert("", "let x = 123;");
    expect(out0.diagnostics).toEqual([]);
    expect(out0.declOutput).toEqual("declare let x: number;\n");
    const out1 = conv.convert(out0.declOutput, "let y = x * x;");
    expect(out1.diagnostics).toEqual([]);
    expect(out1.output).toEqual(
      buildOutput(["let y = x * x;", "exports.y = y;"])
    );
    // TODO: Include let x; into out1.declOutput.
    expect(out1.declOutput).toEqual(
      "declare let y: number;\ndeclare let x: number;\n"
    );
  });

  it("assign to prev", () => {
    const out = conv.convert("declare let x: number\n", "x = x * x;\n");
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput(["exports.tsLastExpr = x = x * x;"])
    );
    expect(out.declOutput).toEqual("declare let x: number;\n");
  });

  it("assign to prev const", () => {
    const out = conv.convert("declare const x: number\n", "x = x * x;\n");
    expect(out.diagnostics).toEqual([
      {
        category: 1,
        code: 2588,
        messageText: "Cannot assign to 'x' because it is a constant.",
        start: {
          character: 0,
          line: 0,
          offset: 0
        },
        end: {
          character: 1,
          line: 0,
          offset: 1
        }
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
    expect(out.output).toEqual(
      buildOutput([
        "class itype {",
        "}",
        "exports.itype = itype;",
        "let atype = 123;",
        "exports.atype = atype;"
      ])
    );
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
    expect(out.output).toEqual(buildOutput(["let A = 10;", "exports.A = A;"]));
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

  it("overwrite prev enum with value", () => {
    const out = conv.convert(
      [
        "declare enum A {",
        "    K = 1",
        "}",
        "declare enum B {",
        "    L = 2",
        "}"
      ].join("\n"),
      "let A = 10;"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(buildOutput(["let A = 10;", "exports.A = A;"]));
    expect(out.declOutput).toEqual(
      "declare let A: number;\ndeclare enum B {\n    L = 2\n}\n"
    );
  });

  it("overwrite prev enum with type", () => {
    // TODO: Fill this test.
    const out = conv.convert(
      [
        "declare enum A {",
        "    K = 1",
        "}",
        "declare enum B {",
        "    L = 2",
        "}"
      ].join("\n"),
      "interface A {x: number}"
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual("");
    expect(out.declOutput).toEqual(
      [
        "interface A {",
        "    x: number;",
        "}",
        "declare enum B {",
        "    L = 2",
        "}",
        "let A: any;",
        ""
      ].join("\n")
    );
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
    expect(out.output).toEqual(
      buildOutput(["let os = 10;", "exports.os = os;"])
    );
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

  it("fixed bug#1: call named imported functions", () => {
    let out = conv.convert("", 'import {join} from "path";');
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput([
        'const path_1 = require("path");',
        "exports.join = path_1.join;"
      ])
    );
    out = conv.convert(out.declOutput, 'join("a", "b");');
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual('import { join } from "path";\n');
    expect(out.output).toEqual(
      buildOutput(['exports.tsLastExpr = join("a", "b");'])
    );
  });

  it("package tslab", () => {
    const out = conv.convert(
      "",
      ['import * as tslab from "tslab";', "let d = tslab.newDisplay();"].join(
        "\n"
      )
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput(
        [
          'const tslab = __importStar(require("tslab"));',
          "exports.tslab = tslab;",
          "let d = tslab.newDisplay();",
          "exports.d = d;"
        ],
        { importStar: true }
      )
    );
    expect(out.declOutput).toEqual(
      'import * as tslab from "tslab";\ndeclare let d: tslab.Display;\n'
    );
  });
});

describe("modules", () => {
  it("updated", () => {
    expect(conv.addModule("mylib", `export const abc = "ABC";`)).toEqual([]);
    let out = conv.convert(
      "",
      'import {abc} from "./mylib";\nconst xyz = abc;'
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      buildOutput([
        'const mylib_1 = require("./mylib");',
        "exports.abc = mylib_1.abc;",
        "const xyz = mylib_1.abc;",
        "exports.xyz = xyz;"
      ])
    );
    expect(out.declOutput).toEqual(
      'import { abc } from "./mylib";\ndeclare const xyz = "ABC";\n'
    );

    // update mylib.
    expect(conv.addModule("mylib", `export const abc = 1234;`)).toEqual([]);
    out = conv.convert("", 'import {abc} from "./mylib";\nconst xyz = abc;');
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(
      'import { abc } from "./mylib";\ndeclare const xyz = 1234;\n'
    );
  });

  it("errors", () => {
    const want = [
      {
        start: { offset: 13, line: 0, character: 13 },
        end: { offset: 16, line: 0, character: 16 },
        messageText: `Type '"ABC"' is not assignable to type 'number'.`,
        category: 1,
        code: 2322,
        fileName: "mylib.ts"
      }
    ];
    expect(
      conv.addModule("mylib", `export const abc: number = "ABC";`)
    ).toEqual(want);
    const out = conv.convert("", 'import * as mylib from "./mylib";');
    expect(out.diagnostics).toEqual(want);
  });

  it("notExternalModule", () => {
    // Though the content of the module does not contain either `export` or `import`,
    // tslab handles it as a module. Thus, this does not define a global variable `abc`.
    // c.f. https://www.typescriptlang.org/docs/handbook/modules.html#introduction
    expect(conv.addModule("mylib", `const abc = "ABC";`)).toEqual([]);
    expect(conv.convert("", "const xyz = abc;").diagnostics).toEqual([
      {
        start: { offset: 12, line: 0, character: 12 },
        end: { offset: 15, line: 0, character: 15 },
        messageText: "Cannot find name 'abc'.",
        category: 1,
        code: 2304,
        fileName: undefined
      }
    ]);
  });
});

describe("repeated inputs", () => {
  it("expressions", () => {
    // builder.emit does not emit JS for duplicated inputs when they only include
    // expressions for some reason. This test checks convert does not handle such a case.
    const src = "'x'";
    const want = {
      output: buildOutput(["exports.tsLastExpr = 'x';"]),
      declOutput: "",
      diagnostics: [],
      hasToplevelAwait: false,
      lastExpressionVar: "tsLastExpr"
    };
    let out = conv.convert("", src);
    expect(out).toEqual(want);
    out = conv.convert("", src);
    expect(out).toEqual(want);
  });

  it("invalid", () => {
    // Check the error from src is generated even when the valid src gets invalid
    // due to the change of prevDecl.
    const src = "x++";
    expect(conv.convert("declare let x: number;", src).diagnostics).toEqual([]);
    expect(conv.convert("declare let x: string;", src).diagnostics).toEqual([
      {
        start: { offset: 0, line: 0, character: 0 },
        end: { offset: 1, line: 0, character: 1 },
        messageText:
          "An arithmetic operand must be of type 'any', 'number', 'bigint' or an enum type.",
        category: 1,
        code: 2356
      }
    ]);
  });
});

describe("externalFiles", () => {
  it("sideOutputs", () => {
    runInTmp("pkg", dir => {
      fs.writeFileSync(
        pathlib.join(dir, "hello.ts"),
        'export const message: string = "Hello tslab in hello.ts!";'
      );
      const output = conv.convert(
        "",
        `import {message} from "./${dir}/hello";`
      );
      expect(output.diagnostics).toEqual([]);
      expect(output.sideOutputs).toEqual([
        {
          path: pathlib.join(process.cwd(), `${dir}/hello.js`),
          data: buildOutput(['exports.message = "Hello tslab in hello.ts!";'])
        }
      ]);
    });
  });

  it("dependencies", () => {
    runInTmp("pkg", dir => {
      // Confirm b.js is output to sideOutputs though c.js is not.
      fs.writeFileSync(
        pathlib.join(dir, "a.ts"),
        'export const aVal: string = "AAA";'
      );
      fs.writeFileSync(
        pathlib.join(dir, "b.ts"),
        'export const bVal: string = "BBB";'
      );
      fs.writeFileSync(
        pathlib.join(dir, "c.ts"),
        'import {aVal} from "./a";\nexport const cVal = aVal + "CCC";'
      );
      const output = conv.convert("", `import {cVal} from "./${dir}/c";`);
      expect(output.diagnostics).toEqual([]);
      expect(output.sideOutputs).toEqual([
        {
          path: pathlib.join(process.cwd(), `${dir}/a.js`),
          data: buildOutput(['exports.aVal = "AAA";'])
        },
        {
          path: pathlib.join(process.cwd(), `${dir}/c.js`),
          data: buildOutput([
            'const a_1 = require("./a");',
            'exports.cVal = a_1.aVal + "CCC";'
          ])
        }
      ]);
    });
  });

  it("errors", () => {
    runInTmp("pkg", dir => {
      fs.writeFileSync(
        pathlib.join(dir, "a.ts"),
        'export const aVal: number = "AAA";\nlet x = await new Promise(resolve => resolve(1));'
      );
      const output = conv.convert("", `import {aVal} from "./${dir}/a";`);
      expect(output.diagnostics).toEqual([
        {
          start: { offset: 13, line: 0, character: 13 },
          end: { offset: 17, line: 0, character: 17 },
          messageText: "Type '\"AAA\"' is not assignable to type 'number'.",
          category: 1,
          code: 2322,
          fileName: `${dir}/a.ts`
        },
        // Top-level await is not allowed in external files.
        {
          start: { offset: 43, line: 1, character: 8 },
          end: { offset: 48, line: 1, character: 13 },
          messageText:
            "'await' expression is only allowed within an async function.",
          category: 1,
          code: 1308,
          fileName: `${dir}/a.ts`
        }
      ]);
    });
  });

  it("changed", async () => {
    await runInTmpAsync("pkg", async dir => {
      const srcPath = pathlib.resolve(pathlib.join(dir, "a.ts"));
      fs.writeFileSync(srcPath, 'export const aVal: string = "ABC";');
      let output = conv.convert("", `import {aVal} from "./${dir}/a";`);
      expect(output.diagnostics).toEqual([]);
      expect(output.sideOutputs).toEqual([
        {
          path: pathlib.join(process.cwd(), `${dir}/a.js`),
          data: buildOutput(['exports.aVal = "ABC";'])
        }
      ]);

      fs.writeFileSync(srcPath, 'export const aVal: string = "XYZ";');
      await waitFileEvent(srcPath, ts.FileWatcherEventKind.Changed);
      // yield to TyeScript compiler just for safety.
      await sleep(0);
      output = conv.convert("", `import {aVal} from "./${dir}/a";`);
      expect(output.diagnostics).toEqual([]);
      expect(output.sideOutputs).toEqual([
        {
          path: pathlib.join(process.cwd(), `${dir}/a.js`),
          data: buildOutput(['exports.aVal = "XYZ";'])
        }
      ]);
    });
  });
});

describe("isCompleteCode", () => {
  it("force complete", () => {
    expect(converter.isCompleteCode("function f() {")).toEqual({
      completed: false,
      indent: "  "
    });
    expect(converter.isCompleteCode("function f() {\n")).toEqual({
      completed: false,
      indent: ""
    });
    expect(converter.isCompleteCode("function f() {\n\n")).toEqual({
      completed: true
    });
    expect(converter.isCompleteCode("function f() {\n  \n\t")).toEqual({
      completed: true
    });
    expect(converter.isCompleteCode("function f() {\r\n  \r\n\t")).toEqual({
      completed: true
    });
    expect(converter.isCompleteCode("  \n  ")).toEqual({
      completed: true
    });
  });

  it("completed", () => {
    expect(converter.isCompleteCode("let x = 10")).toEqual({ completed: true });
    expect(converter.isCompleteCode("function f() {\n}")).toEqual({
      completed: true
    });
    expect(converter.isCompleteCode("class C {\n}")).toEqual({
      completed: true
    });
    expect(converter.isCompleteCode("let x-+10")).toEqual({
      completed: true
    });
    expect(converter.isCompleteCode("<div></div>")).toEqual({
      completed: true
    });
  });

  it("incompleted", () => {
    expect(converter.isCompleteCode("function f() {\n  f()")).toEqual({
      completed: false,
      indent: "  "
    });
    expect(converter.isCompleteCode("while (true) {\n\tlet x = 10;")).toEqual({
      completed: false,
      indent: "\t"
    });
    expect(converter.isCompleteCode("fn(x,\n   y")).toEqual({
      completed: false,
      indent: "   "
    });
    expect(converter.isCompleteCode("let x = y +")).toEqual({
      completed: false,
      indent: ""
    });

    // increase indnet
    expect(converter.isCompleteCode("  function f() {")).toEqual({
      completed: false,
      indent: "    "
    });
    // decrease indent
    expect(
      converter.isCompleteCode("function f() {\n  if (x) {\n    }")
    ).toEqual({
      completed: false,
      indent: "  "
    });
    // JSX/TSX
    expect(converter.isCompleteCode("<div>")).toEqual({
      completed: false,
      // TODO: Autoindent JSX.
      indent: ""
    });
  });
});

describe("keepNamesInImport", () => {
  it("keep named import", () => {
    const src = ts.createSourceFile(
      "src.ts",
      'import mydefault, {foo, bar as baz} from "mylib";',
      ts.ScriptTarget.ES2019
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
      ts.ScriptTarget.ES2019
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
      ts.ScriptTarget.ES2019
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
      ts.ScriptTarget.ES2019
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
      ts.ScriptTarget.ES2019
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
      ts.ScriptTarget.ES2019
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
      ts.ScriptTarget.ES2019
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

describe("esModuleToCommonJSModule", () => {
  it("empty", () => {
    expect(
      converter.esModuleToCommonJSModule("", ts.ScriptTarget.ES2019)
    ).toEqual("");
  });

  it("variables", () => {
    const src = [
      "let x = 10;",
      "const y = 20;",
      "var z = x + y;",
      "export {x, y, z}"
    ].join("\n");
    const want = buildOutput([
      "let x = 10;",
      "exports.x = x;",
      "const y = 20;",
      "exports.y = y;",
      "var z = x + y;",
      "exports.z = z;"
    ]);
    expect(
      converter.esModuleToCommonJSModule(src, ts.ScriptTarget.ES2019)
    ).toEqual(want);
  });

  it("import", () => {
    const src = [
      'import * as os from "os";',
      'import {a, b} from "vm";',
      "let c = a() + b;",
      "export {os, a, b, c}"
    ].join("\n");
    expect(
      converter.esModuleToCommonJSModule(src, ts.ScriptTarget.ES2019)
    ).toEqual(
      buildOutput(
        [
          'const os = __importStar(require("os"));',
          "exports.os = os;",
          'const vm_1 = require("vm");',
          "exports.a = vm_1.a;",
          "exports.b = vm_1.b;",
          "let c = vm_1.a() + vm_1.b;",
          "exports.c = c;"
        ],
        { importStar: true }
      )
    );
  });
});
