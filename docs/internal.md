# Internal design

## TypeScript compiler

tslab depends on a branched version of TypeScript ([`@tslab/typescript-for-tslab`](https://www.npmjs.com/package/@tslab/typescript-for-tslab)) to use unexported APIs of TypeScript compiler.
See README of the branched version for details of modifications.
At the same time, tslab also dev-depends on the mainline TypeScript to compile src code and run tests with `ts-jest`.

Also, `tslab` has `@types/node` as `dependencies`, not `devDependencies`. This is intentional to fix #10.

## Code executor

### runInThisContext and how to share variables amoung cells

To share variables among code cells, `tslab` converts references to variables defined in previous cells (e.g. `x + y`) to references to properties of `exports` (e.g. `exports.x + exports.y`) before running code in `vm.runInThisContext`.

- `getCustomTransformers` in `src/converter.ts`
- `vm.runInThisContext` in `src/executor.ts`

Previously, `tslab` used `vm.runInContext` with a customized context which hooks accesses to variables defined in previous cells.
But `tslab` switched to the current approach with `vm.runInThisContext` to avoid problems like [#32](https://github.com/yunabe/tslab/issues/32).

### exports

- `exports` is defined as a [`Proxy`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
- It forwards assigned variables to `locals` to share exported variables among cells.
- We don't expose `locals` as `exports` directly because irreversible operations (e.g. `Object.defineProperty(exports, "__esModule", { value: true });`) can be applied to `exports` but we don't want to share the results of irreversible operations among cells.

## Registeration to Jupyter

`tslab install` registers `tslab` command to Jupyter environment.
This behavior requires users to install `tslab` in a directory in `PATH` environment variable.
Initially, `tslab install` registered the absolute path of `bin/tslab` to Jupyter.
But I simplified it to support Windows ([commit](https://github.com/yunabe/tslab/commit/3e829add5e9b54a6414a5102ab33731872468492)).
