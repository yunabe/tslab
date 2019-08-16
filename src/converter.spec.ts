import * as converter from "./converter";

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

  it("imported", () => {
    const out = conv.convert(
      "",
      `
import * as os from "os";
import { CpuInfo, UserInfo } from "os";
let info: CpuInfo;
`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(`const os = require(\"os\");
exports.os = os;
let info;
exports.info = info;
`);
    // let info: CpuInfo; in src causes /// reference for some reason.
    // TODO: Understand why /// reference is in the output.
    expect(out.declOutput).toEqual(`/// <reference types="node" />
import * as os from "os";
import { CpuInfo, UserInfo } from "os";
declare let info: CpuInfo;
`);
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
        start: 46
      },
      {
        category: 1,
        code: 2741,
        length: 9,
        messageText:
          "Property 'color' is missing in type 'ShapeImpl' but required in type 'Shape'.",
        start: 46
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
    expect(out1.declOutput).toEqual("declare let y: number;\n");
  });

  it("overwrite-global", () => {
    let out = conv.convert("", "let x = process;");
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual(`/// <reference types="node" />
declare let x: NodeJS.Process;
`);
    out = conv.convert("declare let process: number", "let x = process;");
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toEqual("declare let x: number;\n");
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
    // TODO(yunabe): The type of n must be Map.
    expect(out.declOutput).toEqual("declare let n: any;\n");
  });
});
