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
  const ret = conv.complete(
    prevDecl,
    src.replace("[cur]", ""),
    src.indexOf("[cur]")
  );
  if (ret.original) {
    // Original candidates can change easily by updating TypeScript version and
    // they do not convery much information in unit tests.
    ret.original.entries = [];
  }
  return ret;
}

function complete(src: string): converter.CompletionInfo {
  return completeWithPrev("", src);
}

describe("complete", () => {
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
        entries: [],
      },
    });
  });

  it("members with prefix", () => {
    // The prefix "ab" is ignored by TS compiler. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `let v = { abc: "hello", xyz: 10 }; v.ab[cur]`;
    const info = complete(src);
    const end = src.indexOf(`[cur]`);
    const start = end - 2;
    expect(info).toEqual({
      start,
      end,
      candidates: ["abc"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start, length: 2 },
        entries: [],
      },
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
        optionalReplacementSpan: { start, length: 2 },
        entries: [],
      },
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
        optionalReplacementSpan: { start: pos - 1, length: 2 },
        entries: [],
      },
    });
  });

  it("members mismatch", () => {
    const src = `let v = { abc: "hello", xyz: 10 }; v.qwerty[cur]`;
    const info = complete(src);
    const end = src.indexOf(`[cur]`);
    const start = end - "querty".length;
    expect(info).toEqual({
      start,
      end,
      candidates: [],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start: start, length: end - start },
        entries: [],
      },
    });
  });

  it("members of any", () => {
    let src = `let x: any = 10; x.[cur]`;
    let info = complete(src);
    let start = src.indexOf(`[cur]`);
    expect(info).toEqual({
      start,
      end: start,
      candidates: [],
      original: undefined,
    });

    // https://github.com/yunabe/tslab/issues/13
    src = `let x: any = 10; x.abc[cur]`;
    info = complete(src);
    let end = src.indexOf(`[cur]`);
    start = end - 3;
    expect(info).toEqual({ start, end, candidates: [], original: undefined });
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
        entries: [],
      },
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
        entries: [],
      },
    });
  });

  it("members in object literal with prefix", () => {
    // The prefix "al" is ignored by TS compiler.
    const src = `let v: {alpha: string, beta: number} = {al[cur]}`;
    const info = complete(src);
    const end = src.indexOf(`[cur]`);
    const start = end - 2;
    expect(info).toEqual({
      start,
      end,
      candidates: ["alpha"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start, length: end - start },
        entries: [],
      },
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
        optionalReplacementSpan: { start, length: 2 },
        entries: [],
      },
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
        optionalReplacementSpan: { start: middle - 1, length: 2 },
        entries: [],
      },
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
        "measureMemory",
        "runInContext",
        "runInNewContext",
        "runInThisContext",
        "Script",
      ],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries: [],
      },
    });
  });

  it("sort candidates", () => {
    const src = `let v = { bxy: true, axy: "hello", cxy: 3.4, dXY: false, xyz: 10, XYZ: 30 }; v.XY[cur]`;
    const info = complete(src);
    const end = src.indexOf(`[cur]`);
    const start = end - 2;
    expect(info).toEqual({
      start,
      end,
      candidates: ["XYZ", "xyz", "axy", "bxy", "cxy", "dXY"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start, length: 2 },
        entries: [],
      },
    });
  });

  it("globals", () => {
    const src = `[cur]`;
    const info = complete(src);
    expect(info.original).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 5);
    expect(info).toEqual({
      start: 0,
      end: 0,
      candidates: [
        "__dirname",
        "__filename",
        "AbortController",
        "AbortSignal",
        "abstract",
      ],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      },
    });
  });

  it("globals with prev", () => {
    const src = `let newval = 10; [cur]`;
    const prev = `declare let oldval: number;`;
    const info = completeWithPrev(prev, src);
    expect(info.original).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 5);
    info.original.entries = info.original.entries.slice(0, 5);
    // TODO: Prioritize `oldval` and `newval` in entries and show it at the top of candidates.
    const start = src.indexOf("[cur]");
    expect(info).toEqual({
      start,
      end: start,
      candidates: [
        "__dirname",
        "__filename",
        "AbortController",
        "AbortSignal",
        "abstract",
      ],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      },
    });
  });

  it("globals with prefix", () => {
    const src = `setT[cur]`;
    const info = complete(src);
    expect(info).toEqual({
      start: 0,
      end: 4,
      candidates: ["setTimeout"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start: 0, length: 4 },
        entries: [],
      },
    });
  });

  it("globals with suffix", () => {
    const src = `[cur]setT`;
    const info = complete(src);
    expect(info).toEqual({
      start: 0,
      end: 4,
      candidates: ["setTimeout"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start: 0, length: 4 },
        entries: [],
      },
    });
  });

  it("globals with surrounding", () => {
    const src = `set[cur]I`;
    const info = complete(src);
    info.original.entries = info.original.entries.slice(0, 5);
    expect(info).toEqual({
      start: 0,
      end: 4,
      candidates: ["setImmediate", "setInterval"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: { start: 0, length: 4 },
        entries: [],
      },
    });
  });

  it("string literal", () => {
    const src = `type version = "cupcake" | "donut" | "eclair" | "froyo"; let v: version = [cur]`;
    const info = complete(src);
    expect(info).not.toBeUndefined();
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 6);
    const start = src.indexOf("[cur]");
    // Note that string literals have higher sortText.
    expect(info).toEqual({
      start,
      end: start,
      candidates: [
        '"cupcake"',
        '"donut"',
        '"eclair"',
        '"froyo"',
        "v",
        "__dirname",
      ],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: true,
        entries: [],
      },
    });
  });

  it("locals", () => {
    const src = `function fn(abc: number, xyz: string) { [cur] }`;
    const info = complete(src);
    // Filter entries to keep this test short.
    info.candidates = info.candidates.slice(0, 5);
    const start = src.indexOf("[cur]");
    expect(info).toEqual({
      start,
      end: start,
      candidates: ["abc", "arguments", "fn", "xyz", "__dirname"],
      original: {
        isGlobalCompletion: true,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      },
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
        optionalReplacementSpan: { start: start, length: 0 },
        entries: [],
      },
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
        entries: [],
      },
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
      original: undefined,
    });
  });

  it("docstring attributes", () => {
    const src = `/** [cur]*/ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    const start = src.indexOf("[cur]");
    info.candidates = info.candidates.slice(0, 5);
    expect(info).toEqual({
      start: 4,
      end: 4,
      candidates: ["@abstract", "@access", "@alias", "@argument", "@async"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      },
    });
  });

  it("docstring attributes with prefix", () => {
    // The prefix "par" is not used. This is an intended behavior:
    // https://github.com/microsoft/TypeScript/issues/32916
    const src = `/** @par[cur] */ function f(xyz: number, abc: string): void {}`;
    const info = complete(src);
    const end = src.indexOf("[cur]");
    // Reduce # of entries.
    expect(info).toEqual({
      start: end - 3,
      end,
      candidates: ["param"],
      original: {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      },
    });
  });

  it("docstring parameter", () => {
    const src = `/** @param [cur] */ function f(xyz: number, abc: string): void {}`;
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
        entries: [],
      },
    });
  });
});
