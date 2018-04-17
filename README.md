# JupyterLab Monaco Editor Extension

A JupyterLab extension providing the [Monaco](https://github.com/Microsoft/monaco-editor/) editor.

## Prerequisites

* JupyterLab 0.32
* The modifications at https://github.com/jupyterlab/jupyterlab/issues/4406 must be applied to the JupyterLab webpack config (usually in the `site-packages/jupyterlab/staging/webpack.config.js`)

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
