# Developing tslab

## How to get started

- Read [internal.md](internal.md)

## Registering tslab to Jupyter

```shell
./bin/tslab install --binary=$(pwd)/bin/tslab [--python=python3]
```

## Building

```shell
yarn build [--watch]
```

To build tslab incrementally, pass `--watch` to `yarn build`.

## Testing

Before you run `yarn jest`, run `yarn build` one time because some tests depend on files in `dist` directory.

```shell
yarn jest [--watch]
```

### Frequently used commands

- `yarn jest converter.spec.ts --watch`
  - Run tests in `converter.spec.ts` in watch mode.
- `yarn jest -t nameoftest --watch`
  - Run specific tests in watch mode.

## Release

- Increment `"version"` in `package.json`.
- `yarn test && npm publish`.
- Set git tag: `git tag -a v1.0.3 -m 'Release version 1.0.3'`
- `git push --tags`
