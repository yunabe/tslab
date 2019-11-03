/**
 * Checks the spec of libraries tslab depends on.
 * @file
 */

import vm from "vm";

describe("vm", () => {
  it("basics", () => {
    const sandbox = {};
    vm.createContext(sandbox);
    // Top level var is a global variable.
    vm.runInContext(`var x = 3;`, sandbox);
    expect(sandbox).toEqual({ x: 3 });
    vm.runInContext(
      `(function() {
            x = x + 4;
      })()`,
      sandbox
    );
    expect(sandbox).toEqual({ x: 7 });
    vm.runInContext(
      `(function(exports) {
          x = x * x;
          let y = x * 2;
          exports.y = y;
      })(this)`,
      sandbox
    );
    expect(sandbox).toEqual({ x: 49, y: 98 });
  });

  it("async and Promise", async () => {
    // Promise is available if ctx does not contains it.
    let sandbox = {};
    vm.createContext(sandbox);
    let p = vm.runInContext(`(async () => {})()`, sandbox);
    let cls = vm.runInContext(`Promise`, sandbox);
    expect(p instanceof cls).toBe(true);

    // async function uses a hidden Promise, not Promise in sandbox.
    sandbox = { Promise };
    vm.createContext(sandbox);
    cls = vm.runInContext(`Promise`, sandbox);
    let p0 = vm.runInContext(`(async () => {})()`, sandbox);
    expect(p0 instanceof cls).toBe(false);
    let p1 = vm.runInContext(`(async (x) => x * x)(4)`, sandbox);
    expect(p1 instanceof cls).toBe(false);
    expect(p0.constructor).toBe(p1.constructor);
    expect(await p1).toEqual(16);
  });

  it("contexify performance", () => {
    // createContext takes less than 10[ms].
    let rep = 100;
    const start = process.hrtime();
    for (let i = 0; i < rep; i++) {
      const sandbox = {};
      vm.createContext(sandbox);
      vm.runInContext(`var x = ${i};`, sandbox);
      expect(sandbox).toEqual({ x: i });
    }
    const diff = process.hrtime(start);
    expect(diff[0]).toEqual(0);
  });
});

describe("Proxy", () => {
  it("set", () => {
    function objStr(obj: any): string {
      if (obj === undefined) {
        return "undefined";
      }
      if (obj === null) {
        return "null";
      }
      switch (obj) {
        case obj0:
          return "obj0";
        case obj1:
          return "obj1";
        case proxy0:
          return "proxy0";
        default:
          return "unknown";
      }
    }
    let messages: string[] = [];
    let obj0: { [key: string]: any } = {};
    let proxy0 = new Proxy(obj0, {
      set: (target, prop, value, receiver) => {
        messages.push(
          `target = ${objStr(target)}, prop = ${JSON.stringify(
            prop
          )}, value = ${JSON.stringify(value)}, receiver = ${objStr(receiver)}`
        );
        return true;
      }
    });
    let obj1: { [key: string]: any } = {};
    Object.setPrototypeOf(obj1, proxy0);

    obj1.abc = "hello";

    expect(messages).toEqual([
      'target = obj0, prop = "abc", value = "hello", receiver = obj1'
    ]);
  });
});
