import * as converter from "./converter";

let conv: converter.Converter;
beforeAll(() => {
  conv = converter.createConverter();
});
afterAll(() => {
  conv.close();
});

describe("converter valid", () => {
  it("variables", () => {
    const out = conv.convert(
      "",
      `let x = 123;
const y = 'foo';
var z = true;`
    );
    expect(out.diagnostics).toEqual([]);
    expect(out.output).toEqual(
      `Object.defineProperty(exports, \"__esModule\", { value: true });
let x = 123;
const y = 'foo';
var z = true;
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
      `Object.defineProperty(exports, \"__esModule\", { value: true });
function sum(x, y) {
    return x + y;
}
function* xrange(n) {
    for (let i = 0; i < n; i++) {
        yield i;
    }
}
async function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
`
    );
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
});
