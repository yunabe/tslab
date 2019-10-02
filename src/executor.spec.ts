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
  ex = executor.createExecutor(conv, exconsole);
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

describe("executor", () => {
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
});
