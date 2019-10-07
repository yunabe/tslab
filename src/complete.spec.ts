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

function complete(src: string): ts.CompletionInfo {
  return conv.complete("", src.replace("[cur]", ""), src.indexOf("[cur]"));
}

describe("converter", () => {
  it("members", () => {
    const src = `let v = { abc: "hello", xyz: 10 }; v.[cur]`;
    const info = complete(src);
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

  it("prefixes are ignored with members", () => {
    // The prefix "ab" is not used. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `let v = { abc: "hello", xyz: 10 }; v.ab[cur]`;
    const info = complete(src);
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
    const info = complete(src);
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

  it("missing members in object literal", () => {
    // Used members are not suggested.
    const src = `let v: {alpha: string, beta: number} = {alpha: 'hello', [cur]}`;
    const info = complete(src);
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: true,
      isNewIdentifierLocation: false,
      entries: [
        { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
      ]
    });
  });

  it("prefixes are ignored with object literal", () => {
    // The prefix "al" is not used. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `let v: {alpha: string, beta: number} = {al[cur]}`;
    const info = complete(src);
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
    const info = complete(src);
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
    const info = complete(src);
    expect(info).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.entries = info.entries.filter(e => {
      if (e.name.startsWith("Array")) {
        return true;
      }
      if (e.name === "let") {
        return true;
      }
      return false;
    });
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
        },
        { name: "let", kind: "keyword", kindModifiers: "", sortText: "2" }
      ]
    });
  });

  it("string literal", () => {
    const src = `type version = "cupcake" | "donut" | "eclair" | "froyo"; let v: version = [cur]`;
    const info = complete(src);
    expect(info).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.entries = info.entries.filter(e => {
      if (e.kind === "string") {
        return true;
      }
      return e.name.startsWith("Array");
    });
    // Note that string literals have higher sortText.
    expect(info).toEqual({
      isGlobalCompletion: true,
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

  it("inside string literal", () => {
    const src = `let v = "[cur]"`;
    const info = complete(src);
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: []
    });
  });

  it("inside unclosed string literal", () => {
    const src = `let v = "[cur]`;
    const info = complete(src);
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: []
    });
  });

  it("inside comment", () => {
    // Be careful! complete can return undefined.
    const src = `/* [cur] */"`;
    const info = complete(src);
    expect(info).toBeUndefined();
  });

  it("docstring parameter", () => {
    const src = `/** @param [cur]*/ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: [
        { name: "xyz", kind: "parameter", kindModifiers: "", sortText: "0" },
        { name: "abc", kind: "parameter", kindModifiers: "", sortText: "0" }
      ]
    });
  });

  it("ignore prefiex of docstring keywords", () => {
    // The prefix "par" is not used. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `/** @par[cur] */ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    // Reduce # of entries.
    info.entries = info.entries.slice(0, 5);
    expect(info).toEqual({
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      entries: [
        { name: "abstract", kind: "keyword", kindModifiers: "", sortText: "0" },
        { name: "access", kind: "keyword", kindModifiers: "", sortText: "0" },
        { name: "alias", kind: "keyword", kindModifiers: "", sortText: "0" },
        { name: "argument", kind: "keyword", kindModifiers: "", sortText: "0" },
        { name: "async", kind: "keyword", kindModifiers: "", sortText: "0" }
      ]
    });
  });
});
