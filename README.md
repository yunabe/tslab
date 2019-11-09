# tslab

[![Build Status](https://travis-ci.org/yunabe/tslab.svg?branch=master)](https://travis-ci.org/yunabe/tslab)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/yunabe/tslab-examples/master?filepath=notebooks%2Fbasics.ipynb)

## Example notebooks

https://nbviewer.jupyter.org/github/yunabe/tslab-examples/tree/master/notebooks/

## Installing tslab

### Prerequisites

- Install [Node.js](https://nodejs.org/)
- Install [Jupyter](https://jupyter.org/install)

### Installing tslab by npm

```shell
npm install -g tslab
```

Then, make sure `tslab` command is available.

```
tslab install --version
```

### Registering tslab to Jupyter

```shell
tslab install [--python=python3]
```

By default, tslab uses Python3 to install TypeScript and JavaScript kernel.
To use other versions of Python, set `--python` flag.

## Read more

- [Internal design](docs/internal.md)
