# Internal design

## TypeScript compiler

tslab depends on a branched version of TypeScript ([`@yunabe/typescript-for-tslab`](https://www.npmjs.com/package/@yunabe/typescript-for-tslab)) to use unexported APIs of TypeScript compiler.
See README of the branched version for details of modifications.
At the same time, tslab also dev-depends on the mainline TypeScript to compile src code and run tests with `ts-jest`.

Also, `tslab` has `@types/node` as `dependencies`, not `devDependencies`. This is intentional to fix #10.

## Code executor

### runInContext vs. runInThisContext

tslab uses runInContext, not runInThisContext, internally to share variables amoung cells as global variables.

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
