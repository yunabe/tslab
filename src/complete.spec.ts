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

function completeWithPrev(
  prevDecl: string,
  src: string
): converter.CompletionInfo {
  return conv.complete(
    prevDecl,
    src.replace("[cur]", ""),
    src.indexOf("[cur]")
  );
}

function complete(src: string): converter.CompletionInfo {
  return completeWithPrev("", src);
}

describe("converter", () => {
  it("members", () => {
    const src = `let v = { abc: "hello", xyz: 10 }; v.[cur]`;
    const info = complete(src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start,
      candidates: ["abc", "xyz"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "abc", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "xyz", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members with prefix", () => {
    // The prefix "ab" is ignored by TS compiler. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `let v = { abc: "hello", xyz: 10 }; v.ab[cur]`;
    const info = complete(src);
    const end = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start: end - 2,
      end,
      candidates: ["abc"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "abc", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "xyz", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members with suffix", () => {
    // The suffix "ab" is ignored by TS compiler. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `let v = { abc: "hello", xyz: 10 }; v.[cur]ab`;
    const info = complete(src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start + 2,
      candidates: ["abc"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "abc", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "xyz", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members with surrounding id", () => {
    // The suffix "ab" is ignored by TS compiler. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `let v = { abc: "hello", xyz: 10 }; v.a[cur]b`;
    const info = complete(src);
    const pos = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start: pos - 1,
      end: pos + 1,
      candidates: ["abc"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "abc", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "xyz", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members in object literal", () => {
    const src = `let v: {alpha: string, beta: number} = {[cur]};`;
    const info = complete(src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start,
      candidates: ["alpha", "beta"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "alpha", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("missing members in object literal", () => {
    // Used members are not suggested.
    const src = `let v: {alpha: string, beta: number} = {alpha: 'hello', [cur]}`;
    const info = complete(src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start,
      candidates: ["beta"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members in object literal with prefix", () => {
    // The prefix "al" is ignored by TS compiler.
    const src = `let v: {alpha: string, beta: number} = {al[cur]}`;
    const info = complete(src);
    const end = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start: end - 2,
      end,
      candidates: ["alpha"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "alpha", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members in object literal with suffix", () => {
    // The prefix "al" is ignored by TS compiler.
    const src = `let v: {alpha: string, beta: number} = {[cur]al}`;
    const info = complete(src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start + 2,
      candidates: ["alpha"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "alpha", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("members in object literal with surrounding", () => {
    // The prefix "al" is ignored by TS compiler.
    const src = `let v: {alpha: string, beta: number} = {a[cur]l}`;
    const info = complete(src);
    const middle = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start: middle - 1,
      end: middle + 1,
      candidates: ["alpha"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [
          { name: "alpha", kind: "property", kindModifiers: "", sortText: "0" },
          { name: "beta", kind: "property", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("imported module members", () => {
    const src = `import * as vm from "vm"; vm.[cur]`;
    const info = complete(src);
    const start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start,
      candidates: [
        "compileFunction",
        "createContext",
        "isContext",
        "runInContext",
        "runInNewContext",
        "runInThisContext",
        "Script"
      ],
      original: {
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
      }
    });
  });

  it("globals", () => {
    const src = `[cur]`;
    const info = complete(src);
    expect(info.original).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 5);
    info.original.entries = info.original.entries.filter(e => {
      if (e.name.startsWith("Array")) {
        return true;
      }
      if (e.name === "let") {
        return true;
      }
      return false;
    });
    expect(info).toEqual({
      start: 0,
      end: 0,
      candidates: [
        "__dirname",
        "__filename",
        "AbortController",
        "AbortSignal",
        "AbstractRange"
      ],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "Array",
            kind: "var",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "ArrayBuffer",
            kind: "var",
            kindModifiers: "declare",
            sortText: "2"
          },
          { name: "let", kind: "keyword", kindModifiers: "", sortText: "2" }
        ]
      }
    });
  });

  it("globals with prev", () => {
    const src = `[cur]`;
    const prev = `declare let myval: number;`;
    const info = completeWithPrev(prev, src);
    expect(info.original).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 5);
    info.original.entries = info.original.entries.filter(e => {
      if (e.name.startsWith("Array")) {
        return true;
      }
      if (e.name === "let") {
        return true;
      }
      if (e.name == "myval") {
        return true;
      }
      return false;
    });
    // TODO: Prioritize `mylab` in entries and show it at the top of candidates.
    expect(info).toEqual({
      start: 0,
      end: 0,
      candidates: [
        "__dirname",
        "__filename",
        "AbortController",
        "AbortSignal",
        "AbstractRange"
      ],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "myval",
            kind: "let",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "Array",
            kind: "var",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "ArrayBuffer",
            kind: "var",
            kindModifiers: "declare",
            sortText: "2"
          },
          { name: "let", kind: "keyword", kindModifiers: "", sortText: "2" }
        ]
      }
    });
  });

  it("globals with prefix", () => {
    const src = `setT[cur]`;
    const info = complete(src);
    info.original.entries = info.original.entries.slice(0, 5);
    expect(info).toEqual({
      start: 0,
      end: 4,
      candidates: ["setTimeout", "DOMSettableTokenList"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "globalThis",
            kind: "module",
            kindModifiers: "",
            sortText: "2"
          },
          {
            name: "eval",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "parseInt",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "parseFloat",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "isNaN",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          }
        ]
      }
    });
  });

  it("globals with suffix", () => {
    const src = `[cur]setT`;
    const info = complete(src);
    info.original.entries = info.original.entries.slice(0, 5);
    expect(info).toEqual({
      start: 0,
      end: 4,
      candidates: ["setTimeout", "DOMSettableTokenList"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "globalThis",
            kind: "module",
            kindModifiers: "",
            sortText: "2"
          },
          {
            name: "eval",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "parseInt",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "parseFloat",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "isNaN",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          }
        ]
      }
    });
  });

  it("globals with surrounding", () => {
    const src = `set[cur]I`;
    const info = complete(src);
    info.original.entries = info.original.entries.slice(0, 5);
    expect(info).toEqual({
      start: 0,
      end: 4,
      candidates: ["setInterval", "setImmediate"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "globalThis",
            kind: "module",
            kindModifiers: "",
            sortText: "2"
          },
          {
            name: "eval",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "parseInt",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "parseFloat",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "isNaN",
            kind: "function",
            kindModifiers: "declare",
            sortText: "2"
          }
        ]
      }
    });
  });

  it("string literal", () => {
    const src = `type version = "cupcake" | "donut" | "eclair" | "froyo"; let v: version = [cur]`;
    const info = complete(src);
    expect(info).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 5);
    info.original.entries = info.original.entries.filter(e => {
      if (e.kind === "string") {
        return true;
      }
      return e.name.startsWith("Array");
    });
    const start = src.indexOf("[cur]");
    // Note that string literals have higher sortText.
    expect(info).toEqual({
      start,
      end: start,
      candidates: [
        "__dirname",
        "__filename",
        '"cupcake"',
        '"donut"',
        '"eclair"'
      ],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: true,
        entries: [
          {
            name: "Array",
            kind: "var",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: "ArrayBuffer",
            kind: "var",
            kindModifiers: "declare",
            sortText: "2"
          },
          {
            name: '"cupcake"',
            kind: "string",
            kindModifiers: "",
            sortText: "0"
          },
          { name: '"donut"', kind: "string", kindModifiers: "", sortText: "0" },
          {
            name: '"eclair"',
            kind: "string",
            kindModifiers: "",
            sortText: "0"
          },
          { name: '"froyo"', kind: "string", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("inside string literal", () => {
    const src = `let v = "[cur]"`;
    const info = complete(src);
    const start = src.indexOf("[cur]");
    expect(info).toEqual({
      start,
      end: start,
      candidates: [],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: []
      }
    });
  });

  it("inside unclosed string literal", () => {
    const src = `let v = "[cur]`;
    const info = complete(src);
    const start = src.indexOf("[cur]");
    expect(info).toEqual({
      start,
      end: start,
      candidates: [],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: []
      }
    });
  });

  it("inside comment", () => {
    // Be careful! complete can return undefined.
    const src = `/* [cur] */"`;
    const info = complete(src);
    const start = src.indexOf("[cur]");
    expect(info).toEqual({
      start,
      end: start,
      candidates: [],
      original: undefined
    });
  });

  it("docstring attributes", () => {
    const src = `/** [cur]*/ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    const start = src.indexOf("[cur]");
    info.candidates = info.candidates.slice(0, 5);
    info.original.entries = info.original.entries.slice(0, 5);
    expect(info).toEqual({
      start: 4,
      end: 4,
      candidates: ["@abstract", "@access", "@alias", "@argument", "@async"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "@abstract",
            kind: "keyword",
            kindModifiers: "",
            sortText: "0"
          },
          {
            name: "@access",
            kind: "keyword",
            kindModifiers: "",
            sortText: "0"
          },
          { name: "@alias", kind: "keyword", kindModifiers: "", sortText: "0" },
          {
            name: "@argument",
            kind: "keyword",
            kindModifiers: "",
            sortText: "0"
          },
          { name: "@async", kind: "keyword", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("docstring attributes with prefix", () => {
    // The prefix "par" is not used. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `/** @par[cur] */ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    const end = src.indexOf("[cur]");
    // Reduce # of entries.
    info.original.entries = info.original.entries.slice(0, 5);
    expect(info).toEqual({
      start: end - 3,
      end,
      candidates: ["param"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          {
            name: "abstract",
            kind: "keyword",
            kindModifiers: "",
            sortText: "0"
          },
          { name: "access", kind: "keyword", kindModifiers: "", sortText: "0" },
          { name: "alias", kind: "keyword", kindModifiers: "", sortText: "0" },
          {
            name: "argument",
            kind: "keyword",
            kindModifiers: "",
            sortText: "0"
          },
          { name: "async", kind: "keyword", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });

  it("docstring parameter", () => {
    const src = `/** @param [cur]*/ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    const start = src.indexOf("[cur]");
    expect(info).toEqual({
      start,
      end: start,
      candidates: ["abc", "xyz"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [
          { name: "xyz", kind: "parameter", kindModifiers: "", sortText: "0" },
          { name: "abc", kind: "parameter", kindModifiers: "", sortText: "0" }
        ]
      }
    });
  });
});
