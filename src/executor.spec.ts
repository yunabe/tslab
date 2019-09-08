import * as executor from "./executor";
import { createConverter, Converter } from "./converter";

let ex: executor.Executor;
let conv: Converter;

beforeAll(() => {
  conv = createConverter();
  ex = executor.createExecutor(conv);
});
afterAll(() => {
  if (conv) {
    conv.close();
  }
});

beforeEach(() => {
  ex.reset();
});

describe("executor", () => {
  it("calculate numbers", () => {
    ex.execute(`let x = 3, y = 4;`);
    ex.execute(`let z = x * y; z -= 2;`);
    ex.execute(`y = x * z;`);
    expect(ex.locals).toEqual({ x: 3, y: 30, z: 10 });
    ex.execute(`x = Math.max(z, y)`);
    expect(ex.locals).toEqual({ x: 30, y: 30, z: 10 });
  });

  it("recursion", () => {
    ex.execute(
      `function naiveFib(n: number) {
        if (n > 1) {
          return naiveFib(n - 1) + naiveFib(n - 2);
        }
        return 1;
    }
    let fib20 = naiveFib(20);`
    );
    expect(ex.locals.fib20).toEqual(10946);
  });

  it("node globals", () => {
    ex.execute(`
    let myglobal = global;
    let myprocess = process;
    let myconsole = console;
    let MyArray = Array;`);
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

  it("redeclare const", () => {
    ex.execute(`const x = 3;`);
    ex.execute(`const x = 4;`);
    expect(ex.locals).toEqual({ x: 4 });
  });
});
