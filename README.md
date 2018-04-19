# JupyterLab Monaco Editor Extension

A JupyterLab extension providing the [Monaco](https://github.com/Microsoft/monaco-editor/) editor.

## Prerequisites

* JupyterLab 0.32

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

If you have an node error like `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`, you can increase the memory available to node by creating an environment variable:

```sh
export NODE_OPTIONS=--max-old-space-size=4096
```

## Development notes

The tricky thing about this repo is that we webpack up Monaco as part of the build process and publish those JavaScript files as part of the package. Because Monaco likes to use web workers to start up parts of the application, we must have standalone js files and a way to get the URL for those files in the final JupyterLab build. We get the URL in the extension by using the webpack file loader in the JupyterLab build for the Monaco js files (JLab knows to use the file loader because we prefix the filename with `JUPYTERLAB_FILE_LOADER_`).

