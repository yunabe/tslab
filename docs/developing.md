# Developing tslab

## Repository

```shell
git clone https://github.com/yunabe/tslab.git
```

## How to get started

- Read [internal.md](internal.md)

## Registering tslab to Jupyter

```shell
./bin/tslab install --binary=$(pwd)/bin/tslab [--python=python3]
```

## Building

```shell
npm run build [-- --watch]
```

To build tslab incrementally, pass `--watch` to `npm run build`.

## Testing

Before you run `npm run jest`, run `npm run build` one time because some tests depend on files in `dist` directory.

```shell
npm run jest [-- --watch]
```

### Frequently used commands

- `npm run jest -- converter.spec.ts --watch`
  - Run tests in `converter.spec.ts` in watch mode.
- `npm run jest -- -t nameoftest --watch`
  - Run specific tests in watch mode.

## Release

- Increment `"version"` in `package.json`.
- `npm run test && npm publish`.
- Set git tag: `git tag -a v1.0.3 -m 'Release version 1.0.3'`
- `git push --tags`

## Related repositories

- https://github.com/yunabe/TypeScriptForTslab - A branch of TypeScript used in tslab.
- https://github.com/yunabe/tslab-examples - Example notebooks of tslab.
