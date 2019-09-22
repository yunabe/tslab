import * as executor from "./executor";
import { createConverter, Converter } from "./converter";
import { createHash } from "crypto";

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
      `
      function naiveFib(n: number) {
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

  it("class", () => {
    ex.execute(`
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
    expect(ex.locals.alice).toEqual("Person(alice, 123)");
  });

  it("import", () => {
    ex.execute(`
    import * as crypto from "crypto";
    const message = "Hello TypeScript!";
    const hash = crypto.createHash("sha256").update(message).digest("hex");
    `);
    const hash = createHash("sha256")
      .update("Hello TypeScript!")
      .digest("hex");
    expect(ex.locals.hash).toEqual(hash);
  });

  it("enum", () => {
    ex.execute(`
    enum Direction {
      Up = 1,
      Down,
      Left,
      Right,
    }
    `);
    ex.execute(`const x = Direction.Down`);
    ex.execute(`const y = Direction[2]`);
    ex.execute(`let Direction = null;`);
    expect(ex.locals).toEqual({ x: 2, y: "Down", Direction: null });
  });
});
