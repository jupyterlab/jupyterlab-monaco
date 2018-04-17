# JupyterLab Monaco Editor Extension

A JupyterLab extension providing the [Monaco](https://github.com/Microsoft/monaco-editor/) editor.

## Prerequisites

* JupyterLab 0.32

## Installation

```bash
jupyter labextension install jupyterlab-monaco
```

## Development

For a development install, do the following in the repository directory:

```bash
yarn install
yarn run build
jupyter labextension link .
```

To rebuild the package and the JupyterLab app:

```bash
yarn run build
jupyter lab build
```

