import * as vm from "vm";

describe("vmspec", () => {
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
