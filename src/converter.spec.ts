import * as converter from "./converter";
import { numberLiteralTypeAnnotation } from "@babel/types";

describe("converter diagnostics", () => {
  const conv = converter.createConverter();

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

describe("converter convert", () => {
  const conv = converter.createConverter();

  it("let", () => {
    const out = conv.convert("", `let x = 3; const y = 4.5; var z = "zz";`);
    expect(out.diagnostics).toEqual([]);
    expect(out.declOutput).toBe(
      "let x: number;\nconst y = 4.5;\nvar z: string;\n"
    );
  });
});
