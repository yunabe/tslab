import * as executor from "./executor";
import { createConverter, Converter } from "./converter";
import { createHash } from "crypto";

let ex: executor.Executor;
let conv: Converter;

let consoleLogCalls = [];
let consoleErrorCalls = [];

beforeAll(() => {
  conv = createConverter();
  let exconsole = {
    log: function(...args) {
      consoleLogCalls.push(args);
    },
    error: function(...args) {
      consoleErrorCalls.push(args);
    }
  };
  ex = executor.createExecutor(process.cwd(), conv, exconsole);
});
afterAll(() => {
  if (conv) {
    conv.close();
  }
});

afterEach(() => {
  ex.reset();
  consoleLogCalls = [];
  consoleErrorCalls = [];
});

describe("execute", () => {
  it("immediate", () => {
    // Show code is executed immediately with execute.
    // See a docstring of execute for details.
    const promise = ex.execute("let x = 10; x + 4;");
    expect(consoleLogCalls).toEqual([[14]]);
  });

  it("calculate numbers", async () => {
    expect(await ex.execute(`let x = 3, y = 4;`)).toBe(true);
    expect(await ex.execute(`let z = x * y; z -= 2;`)).toBe(true);
    expect(await ex.execute(`y = x * z;`)).toBe(true);
    expect(ex.locals).toEqual({ x: 3, y: 30, z: 10 });
    expect(await ex.execute(`x = Math.max(z, y)`));
    expect(ex.locals).toEqual({ x: 30, y: 30, z: 10 });
    expect(consoleLogCalls).toEqual([[10], [30], [30]]);
  });

  it("recursion", async () => {
    let ok = await ex.execute(
      `
      function naiveFib(n: number) {
        if (n > 1) {
          return naiveFib(n - 1) + naiveFib(n - 2);
        }
        return 1;
      }
      let fib20 = naiveFib(20);`
    );
    expect(ok).toBe(true);
    expect(ex.locals.fib20).toEqual(10946);
  });

  it("node globals", async () => {
    let ok = await ex.execute(`
    let myglobal = global;
    let myprocess = process;
    let myconsole = console;
    let MyArray = Array;`);
    expect(ok).toBe(true);
    const expectLocals = {
      myglobal: global,
      myprocess: process,
      myconsole: console,
      MyArray: Array
    };
    for (let key of Object.getOwnPropertyNames(ex.locals)) {
      expect(ex.locals[key]).toBe(expectLocals[key]);
      delete expectLocals[key];
    }
    expect(Object.getOwnPropertyNames(expectLocals)).toEqual([]);
  });

  it("redeclare const", async () => {
    expect(await ex.execute(`const x = 3;`)).toBe(true);
    expect(await ex.execute(`const x = 4;`)).toBe(true);
    expect(ex.locals).toEqual({ x: 4 });
  });

  it("class", async () => {
    let ok = await ex.execute(`
    class Person {
      name: string;
      age: number;

      constructor(name: string, age: number) {
        this.name = name;
        this.age = age;
      }

      toString(): string {
        return 'Person(' + this.name + ', ' + this.age + ')';
      }
    }
    let alice = (new Person('alice', 123)).toString();
    `);
    expect(ok).toBe(true);
    expect(ex.locals.alice).toEqual("Person(alice, 123)");
  });

  it("import", async () => {
    let ok = await ex.execute(`
    import * as crypto from "crypto";
    const message = "Hello TypeScript!";
    const hash = crypto.createHash("sha256").update(message).digest("hex");
    `);
    expect(ok).toBe(true);
    const hash = createHash("sha256")
      .update("Hello TypeScript!")
      .digest("hex");
    expect(ex.locals.hash).toEqual(hash);
  });

  it("enum", async () => {
    expect(
      await ex.execute(`
    enum Direction {
      Up = 1,
      Down,
      Left,
      Right,
    }
    `)
    ).toBe(true);
    expect(await ex.execute(`const x = Direction.Down`)).toBe(true);
    expect(await ex.execute(`const y = Direction[2]`)).toBe(true);
    expect(await ex.execute(`let Direction = null;`)).toBe(true);
    expect(ex.locals).toEqual({ x: 2, y: "Down", Direction: null });
  });

  it("exports defineProperty", async () => {
    // Check we can handle defineProperty properly.
    // defineProperty is used by TypeScript compiler to define __esModule.
    expect(
      await ex.execute(
        [
          'Object.defineProperty(exports, "myprop", {value: true});',
          "let prop0 = exports.myprop"
        ].join("\n")
      )
    ).toBe(true);
    expect(
      await ex.execute(
        [
          'Object.defineProperty(exports, "myprop", {value: false});',
          "let prop1 = exports.myprop"
        ].join("\n")
      )
    ).toBe(true);

    expect(ex.locals).toEqual({
      prop0: true,
      prop1: false
    });
  });

  it("exports re-defineProperty", async () => {
    // We can not redefine properties.
    expect(
      await ex.execute(
        [
          'Object.defineProperty(exports, "__esModule", {value: true});',
          'Object.defineProperty(exports, "__esModule", {value: false});'
        ].join("\n")
      )
    ).toBe(false);
    expect(consoleErrorCalls).toEqual([
      [new TypeError("Cannot redefine property: __esModule")]
    ]);
  });

  it("syntax error", async () => {
    expect(await ex.execute(`let x + y;`)).toBe(false);
    expect(consoleErrorCalls).toEqual([
      ["%d:%d - %s", 1, 7, "',' expected."],
      ["%d:%d - %s", 1, 9, "Cannot find name 'y'."]
    ]);
  });

  it("exception", async () => {
    let ok = await ex.execute(`throw new Error('my error');`);
    expect(ok).toBe(false);
    expect(consoleErrorCalls).toEqual([[new Error("my error")]]);
  });

  it("promise resolved", async () => {
    let ok = await ex.execute(`
    new Promise(resolve => {
      resolve('Hello Promise');
    });
    `);
    expect(ok).toBe(true);
    expect(consoleLogCalls).toEqual([["Hello Promise"]]);
    expect(consoleErrorCalls).toEqual([]);
  });

  it("promise resolved", async () => {
    let promise = ex.execute(`
    new Promise(resolve => {
      resolve('Hello Promise');
    });
    `);
    // The promise is not resolved yet.
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);

    expect(await promise).toBe(true);
    expect(consoleLogCalls).toEqual([["Hello Promise"]]);
    expect(consoleErrorCalls).toEqual([]);
  });

  it("promise rejected", async () => {
    let promise = ex.execute(`
    new Promise((_, reject) => {
      reject('Good Bye Promise');
    });
    `);
    // The promise is not resolved yet.
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);

    expect(await promise).toBe(false);
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([["Good Bye Promise"]]);
  });

  it("async resolved", async () => {
    let promise = ex.execute(`
    (async (msg)=>{
      return 'Hello ' + msg;
    })('async');
    `);
    // The promise is not resolved yet.
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);

    expect(await promise).toBe(true);
    expect(consoleLogCalls).toEqual([["Hello async"]]);
    expect(consoleErrorCalls).toEqual([]);
  });

  it("async rejected", async () => {
    let promise = ex.execute(`
    (async (msg)=>{
      throw 'Good Bye async';
    })();
    `);
    // The promise is not resolved yet.
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([]);

    expect(await promise).toBe(false);
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([["Good Bye async"]]);
  });

  it("package tslab", async () => {
    expect(
      await ex.execute(`
    import * as tslab from "tslab";
    let id = tslab.display.newId();
    `)
    ).toBe(true);
    expect(typeof ex.locals.id).toEqual("string");
  });

  it("performance", async () => {
    function naiveFib(n: number): number {
      if (n > 1) {
        return naiveFib(n - 1) + naiveFib(n - 2);
      }
      return 1;
    }
    let start = Date.now();
    let want = naiveFib(35);
    let end = Date.now();
    let t0 = end - start;

    start = Date.now();
    expect(
      await ex.execute(`
      function naiveFib(n: number): number {
        if (n > 1) {
          return naiveFib(n - 1) + naiveFib(n - 2);
        }
        return 1;
      }
      let got = naiveFib(35);
    `)
    ).toBe(true);
    end = Date.now();
    let t1 = end - start;
    expect(ex.locals.got).toBe(want);
    expect(t1 / t0).toBeGreaterThan(0.5);
    expect(t0 / t1).toBeGreaterThan(0.5);
  });
});

describe("interrupt", () => {
  it("interrupt without execute", () => {
    // Confirm it does not cause any problem like "UnhandledPromiseRejection".
    ex.interrupt();
  });

  it("interrupt", async () => {
    // Confirm it does not cause any problem like "UnhandledPromiseRejection".
    let src = "new Promise(resolve => setTimeout(() => resolve('done'), 10));";
    let promise = ex.execute(src);
    expect(await promise).toBe(true);
    expect(consoleLogCalls).toEqual([["done"]]);
    consoleLogCalls = [];

    promise = ex.execute(src);
    ex.interrupt();
    expect(await promise).toBe(false);
    expect(consoleLogCalls).toEqual([]);
    expect(consoleErrorCalls).toEqual([
      [new Error("Interrupted asynchronously")]
    ]);
  });
});
