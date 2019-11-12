# tslab

[![Build Status](https://travis-ci.org/yunabe/tslab.svg?branch=master)](https://travis-ci.org/yunabe/tslab)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/yunabe/tslab-examples/master?filepath=notebooks%2Fbasics.ipynb)
[![npm version](https://badge.fury.io/js/tslab.svg)](https://badge.fury.io/js/tslab)

## Features

- Interactive JavaScript and TypeScript programming with Jupyter and Node.js.
- The power of types from [TypeScript project](https://www.typescriptlang.org/).
  - Type safety even in JavaScript mode.
  - Rich code completion and code inspection thanks to types.
- Display non-text contents like images, HTML, JavaScript, SVG, etc...
- Interactive machine learning programming ([TensorFlow.js](https://www.tensorflow.org/js/guide/nodejs)) and data exploration with JavaScript.
- JavaScript is [40x faster than Python](https://www.google.com/search?hl=en&q=python3+node.js+performance).
- TypeScript 3.7 support.
  - ["Optional Chaining"](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#optional-chaining) and ["Nullish Coalescing"](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#nullish-coalescing) are supported.
- Top-level [`await`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await) support.

### Screenshots: Code inspection (Shift-Tab) and completion (Tab)

<div><img src="docs/images/inspect.jpg" width="400" height="160"></div>
<div><img src="docs/images/complete.jpg" width="400" height="160"></div>

## Example notebooks

https://nbviewer.jupyter.org/github/yunabe/tslab-examples/tree/master/notebooks/

## Try tslab without installing it

[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/yunabe/tslab-examples/master?filepath=notebooks%2Fbasics.ipynb)

Thanks to [binder (mybinder.org)](https://mybinder.org/), you can try tslab on your browsers without installing it into your system.
Open a temporary Jupyter Notebook from the button above and enjoy interactive JavaScript and TypeScript programming.

## Installing tslab

### Prerequisites

- Install [Node.js](https://nodejs.org/) (LTS or Current)
- Install [Python3.x](https://www.python.org/downloads/)
  - tslab works with Jupyter on Python2.7.
  - But I recommend you to use Jupyter on Python3.x because
    [the latest Jupyter does not support Python2.7](https://ipython.readthedocs.io/en/stable/whatsnew/version6.html)
- Install the latest version of [JupyterLab or Jupyter Notebook](https://jupyter.org/install)

### Installing tslab by npm

```shell
npm install -g tslab
```

Please make sure `tslab` command is available in your terminal.

```
tslab install --version
```

### Registering tslab to Jupyter

```shell
tslab install [--python=python3]
```

By default, tslab is registered with `python3` in unix-like system and `python` in Windows.
If Jupyter is installed with a different Python in your system, please specify the python command with `--python` flag.

### Usage: JupyterLab and Jupyter Notebook

After you register `tslab` to Jupyter, start JupyterLab and Jupyter Notebook as usual. You can now create JavaScript and TypeScript notebooks.

```shell
# JupyterLab
jupyter lab [--port=8888]

# Jupyter Notebook
jupyter notebook [--port=8888]
```

In Jupyter, you can complete code by pressing `Tab` and show tooltips by pressing `Shift + Tab`.

### Usage: REPL console

You can also use tslab and Jupyter as an interactive console (REPL).
To use tslab as REPL, please run `jupyter console` with `--kernel=jslab` (JavaScript) or `--kernel=tslab` (TypeScript).

```shell
jupyter console --kernel=tslab
```

## Clarification

tslab is an interactive JavaScript and TypeScript programming environment on Node.js (aka Server-side JavaScript).
tslab does not support code execution on browsers (aka Client-side JavaScript) at this moment.

## Read more

- [Advanced topics](docs/advanced.md)
- [Internal design](docs/internal.md)
