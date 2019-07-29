import * as converter from "./converter";

export declare let hoge: string;

describe("converter diagnostics", () => {
  it("syntax error", () => {
    const conv = converter.createConverter();
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
  /*
  it("a", () => {
    const conv = converter.createConverter();
    conv.convert(
      "",
      `
    export let zz = "***";
    export module __tslab__ {
      let zz = 10;
      let zx = "...";
      type x = number | string;
      declare let hoge: string;
      class Xyz {
        mymethod(x: number): string {
          return String(x);
        }
      }
      interface IXyz {
        imethod(): void;
      }
      type Combined = number | Xyz | IXyz;
    }`
    );
  });
  */
});
