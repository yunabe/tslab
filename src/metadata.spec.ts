import { getCodeMetadata } from "./metadata";

describe("getCodeMetadata", () => {
  it("module", () => {
    const ret = getCodeMetadata(`/**
   * hello
   * @module mylib
   */`);
    expect(ret).toEqual({ module: "mylib" });
  });

  it("browser", () => {
    const ret = getCodeMetadata(`/**
   * @jsx @browser
   */`);
    expect(ret).toEqual({ mode: "browser", jsx: true });
  });
});
