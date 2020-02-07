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

  it("lexical sandbox scope", () => {
    const ctx0 = { x: 123 };
    const ctx1 = { x: "abc" };
    vm.createContext(ctx0);
    vm.createContext(ctx1);
    const fn0 = vm.runInContext(`(function(){return x})`, ctx0);
    const fn1 = vm.runInContext(`(function(){return x})`, ctx1);
    expect(fn0()).toEqual(123);
    expect(fn1()).toEqual("abc");
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

  it("breakOnSigint", async () => {
    if (process.platform === "win32") {
      // process.kill is not properly implemented on Windows.
      return;
    }
    const { Worker } = await import("worker_threads");
    new Worker(
      `setTimeout(() =>{
      process.kill(process.pid, "SIGINT");
    }, 0);`,
      {
        eval: true
      }
    );
    try {
      vm.runInNewContext(`while (true) {}`, undefined, { breakOnSigint: true });
    } catch (e) {
      expect(e.toString()).toContain("interrupted");
    }
  });

  it("breakOnSigint indirect", async () => {
    if (process.platform === "win32") {
      // process.kill is not properly implemented on Windows.
      return;
    }
    // Confirm breakOnSigint can exit an infinite loop defined outside of the code.
    const { Worker } = await import("worker_threads");
    new Worker(
      `setTimeout(() =>{
      process.kill(process.pid, "SIGINT");
    }, 0);`,
      {
        eval: true
      }
    );
    const sandbox = {
      loop: () => {
        while (true) {}
      }
    };
    try {
      vm.runInNewContext(`loop()`, sandbox, { breakOnSigint: true });
    } catch (e) {
      expect(e.toString()).toContain("interrupted");
    }
  });
});

describe("promise", () => {
  it("async and promise", () => {
    let p = (async function() {})();
    // The result of async is an instance of Promise outside of vm.
    // TODO: Why this is not the case in vm?
    expect(p.constructor).toBe(Promise);
    expect(p instanceof Promise).toBe(true);
  });

  it("order", async () => {
    function range(n: number) {
      let out = [];
      for (let i = 0; i < n; i++) {
        out.push(i);
      }
      return out;
    }

    let out: number[] = [];
    let p = new Promise(done => {
      out.push(0);
      done("abc");
    }).then(v => {
      out.push(2);
      expect(v).toEqual("abc");
    });
    out.push(1);
    await p;
    expect(out).toEqual(range(3));

    out = [];
    p = (async function() {
      out.push(0);
      await null;
      out.push(2);
    })();
    out.push(1);
    await p;
    expect(out).toEqual(range(3));

    out = [];
    p = Promise.resolve().then(() => {
      out.push(1);
    });
    out.push(0);
    await p;
    expect(out).toEqual(range(2));

    // Advanced. `done('xyz') does not invoke the callback immediately.
    out = [];
    p = Promise.resolve({
      then: done => {
        out.push(1);
        done("xyz");
        out.push(2);
      }
    }).then(x => {
      expect(x).toEqual("xyz");
      out.push(3);
    });
    out.push(0);
    await p;
    expect(out).toEqual(range(4));

    // This is very tricky.
    // The order of operations changes between target = ES2017 and ES2015.
    // When target is ES2015, the order is [0, 2, 4, 3, 1].
    out = [];
    p = (async function() {
      out.push(0);
      let x = await ({
        then: done => {
          out.push(2);
          done("xyz");
          out.push(3);
        }
      } as any);
      expect(x).toEqual("xyz");
      out.push(4);
    })();
    out.push(1);
    await p;
    expect(out).toEqual(range(5));

    class CustomPromise<T> extends Promise<T> {
      then(done): any {
        out.push(2);
        done("xyz");
        out.push(3);
      }
    }
    out = [];
    p = (async function() {
      out.push(0);
      let cp = new CustomPromise(done => {
        done("abc");
      });
      expect(cp).toBeInstanceOf(Promise);
      let x = await (cp as any);
      expect(x).toEqual("xyz");
      out.push(4);
    })();
    out.push(1);
    await p;
    expect(out).toEqual(range(5));
  });
});
