import * as ts from "typescript";
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

describe("converter", () => {
  it("members", () => {
    const src = `let v = { abc: "hello", xyz: 10 }; v.[cur]`;
    const info = conv.complete("", src, src.indexOf(`[cur]`));
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: true,
      isNewIdentifierLocation: false,
      entries: [
        { name: "abc", kind: "property", kindModifiers: "", sortText: "0" },
        { name: "xyz", kind: "property", kindModifiers: "", sortText: "0" }
      ]
    });
  });

  it("members in object literal", () => {
    const src = `let v: {alpha: string, beta: number} = {[cur]};`;
    const info = conv.complete("", src, src.indexOf(`[cur]`));
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: true,
      isNewIdentifierLocation: false,
      entries: [
        { name: "alpha", kind: "property", kindModifiers: "", sortText: "0" },
        { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
      ]
    });
  });

  it("imported module members", () => {
    const src = `import * as vm from "vm"; vm.[cur]`;
    const info = conv.complete("", src, src.indexOf(`[cur]`));
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: true,
      isNewIdentifierLocation: false,
      entries: [
        {
          name: "createContext",
          kind: "function",
          kindModifiers: "declare",
          sortText: "0"
        },
        {
          name: "isContext",
          kind: "function",
          kindModifiers: "declare",
          sortText: "0"
        },
        {
          name: "runInContext",
          kind: "function",
          kindModifiers: "declare",
          sortText: "0"
        },
        {
          name: "runInNewContext",
          kind: "function",
          kindModifiers: "declare",
          sortText: "0"
        },
        {
          name: "runInThisContext",
          kind: "function",
          kindModifiers: "declare",
          sortText: "0"
        },
        {
          name: "compileFunction",
          kind: "function",
          kindModifiers: "declare",
          sortText: "0"
        },
        {
          name: "Script",
          kind: "class",
          kindModifiers: "declare",
          sortText: "0"
        }
      ]
    });
  });

  it("globals", () => {
    const src = `[cur]`;
    const info = conv.complete("", src, src.indexOf(`[cur]`));
    expect(info).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.entries = info.entries.filter(e => e.name.startsWith("Array"));
    expect(info).toEqual({
      isGlobalCompletion: true,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: [
        { name: "Array", kind: "var", kindModifiers: "declare", sortText: "2" },
        {
          name: "ArrayBuffer",
          kind: "var",
          kindModifiers: "declare",
          sortText: "2"
        }
      ]
    });
  });

  it("string literal", () => {
    const src = `type version = "cupcake" | "donut" | "eclair" | "froyo"; let v: version = [cur]`;
    const info = conv.complete("", src, src.indexOf(`[cur]`));
    expect(info).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.entries = info.entries.filter(e => {
      if (e.kind === "string") {
        return true;
      }
      return e.name.startsWith("Array");
    });
    // string literals have higher sortText.
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: true,
      entries: [
        { name: "Array", kind: "var", kindModifiers: "declare", sortText: "2" },
        {
          name: "ArrayBuffer",
          kind: "var",
          kindModifiers: "declare",
          sortText: "2"
        },
        { name: '"cupcake"', kind: "string", kindModifiers: "", sortText: "0" },
        { name: '"donut"', kind: "string", kindModifiers: "", sortText: "0" },
        { name: '"eclair"', kind: "string", kindModifiers: "", sortText: "0" },
        { name: '"froyo"', kind: "string", kindModifiers: "", sortText: "0" }
      ]
    });
  });
});
