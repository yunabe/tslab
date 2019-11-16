# Internal design

## TypeScript compiler

tslab depends on a branched version of TypeScript ([`@tslab/typescript-for-tslab`](https://www.npmjs.com/package/@tslab/typescript-for-tslab)) to use unexported APIs of TypeScript compiler.
See README of the branched version for details of modifications.
At the same time, tslab also dev-depends on the mainline TypeScript to compile src code and run tests with `ts-jest`.

Also, `tslab` has `@types/node` as `dependencies`, not `devDependencies`. This is intentional to fix #10.

## Code executor

### runInContext vs. runInThisContext

tslab uses runInContext, not runInThisContext, internally to share variables among cells as global variables.

tslab converts the original input like:

```ts
/* == cell0 == */
let x = 1;
/* == cell1 == */
x = 2 * x;
```

into the converted JavaScript like:

```ts
/* == cell0 == */
let x = 1;
exports.x = x;
/* == cell1 == */
x = 2 * x;
```

As you can see, the variable `x` is referred as a global variable in `cell1`.
To execute them correctly, we need to run them with `runInContext` with a custom `vm` context.

### exports

- `exports` is defined as a [`Proxy`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
- It forwards assigned variables to `locals` to share exported variables among cells.
- We don't expose `locals` as `exports` directly because inversible operations (e.g. `Object.defineProperty(exports, "__esModule", { value: true });`) can be applied to `exports` but we don't want to share the results of inverted operations among cells.

## Registeration to Jupyter

`tslab install` registers `tslab` command to Jupyter environment.
This behavior requires users to install `tslab` in a directory in `PATH` environment variable.
Initially, `tslab install` registered the absolute path of `bin/tslab` to Jupyter.
But I simplified it to support Windows ([commit](https://github.com/yunabe/tslab/commit/3e829add5e9b54a6414a5102ab33731872468492)).
