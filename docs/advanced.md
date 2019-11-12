# Advanced topics of tslab

## Upgrading tslab

```shell
npm install -g tslab@latest
```

## Display non-text contents

```typescript
import * as tslab from "tslab";
tslab.display.html("Hello <b>tslab!</b>");
```

## Global vs Local installtaion

We [recommend to install tslab globally](https://github.com/yunabe/tslab/blob/master/README.md#installing-tslab) by `npm install -g tslab` because you need to register `tslab` command to Jupyter in your environment.

If you want to use the specific version of tslab in your npm projects, please install tslab locally too.
tslab detects locally-installed tslab in npm projects of notebook files and use it automatically instead of globally-installed tslab.

```shell
# Make package.json in an ancestor directory of .ipynb files.
npm init
# Install tslab locally.
npm install tslab
```
