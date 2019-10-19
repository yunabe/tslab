# tslab

[![Build Status](https://travis-ci.org/yunabe/tslab.svg?branch=master)](https://travis-ci.org/yunabe/tslab)

## Development

### Dependencies

tslab depends on a branched version of TypeScript ([`@yunabe/typescript-for-tslab`](https://www.npmjs.com/package/@yunabe/typescript-for-tslab)) to use unexported APIs of TypeScript compiler.
See README of the branched version for details of modifications.
At the same time, tslab also dev-depends on the mainline TypeScript to compile src code and run tests with `ts-jest`.

Also, `tslab` has `@types/node` as `dependencies`, not `devDependencies`. This is intentional to fix #10.