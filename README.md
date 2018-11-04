# JupyterLab Monaco Editor Extension

A JupyterLab extension providing the [Monaco](https://github.com/Microsoft/monaco-editor/) editor.

The current state of this extension is merely a 'proof-of-concept' implementation and nowhere near production status. All functionality and interaction with the 'abstract editor interface' that JupyterLab provides is still missing.

Also, the Codemirror themes, Codemirror syntax highlighting and Codemirror keymaps won't work with Monaco. That would have to be managed separately.

As for the VS Code extensions: Monaco is the editor that powers VS Code. Or to put it otherwise: Monaco is merely a part of the whole VS Code application, packaged to work on the web (limited capabilities compared to desktop). An extension for VS Code therefore is not guaranteed to work on Monaco, as it probably uses a whole lot more of VS Code than merely the Monaco parts. The other way around is much more probable.

Feel free to head over to Monaco's repo and website to see what is and isn't possible. Their [FAQ](https://github.com/Microsoft/monaco-editor#faq) explains a lot.

| ![intellisense](./screenshots/intellisense.png) | ![minimap](./screenshots/minimap.png) |
| ----------------------------------------------- | ------------------------------------- |

The actual extension don't use the full monaco editor. But it rather builds on [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient) to be easily extended through [Language Server](https://microsoft.github.io/language-server-protocol/). For example you can install the following package `jupyter_python_languageserver` through `pip` to connect to a local [Python Language Server](https://github.com/palantir/python-language-server).

Note: Colorization and configuration for bracketing, indent, comment and folding are provided through the [monaco-languages](https://github.com/Microsoft/monaco-languages) package. One notably missing language is `JSON`.

## Prerequisites

* JupyterLab 0.34

## Installation

To test it with the Python Language Server:

```bash
yarn install
yarn run build
jupyter labextension install .
pip install jupyter_python_languageserver
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

If you have an node error like `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory`, you can increase the memory available to node by creating an environment variable:

```sh
export NODE_OPTIONS=--max-old-space-size=4096
```

## Development notes

The tricky thing about this repo is that we webpack up Monaco as part of the build process and publish those JavaScript files as part of the package. Because Monaco likes to use web workers to start up parts of the application, we must have standalone js files and a way to get the URL for those files in the final JupyterLab build. We get the URL in the extension by using the webpack file loader (triggered by prefixing an import with `file-loader!`) in the final JupyterLab build for the Monaco js files. Since we depend on the webpack file-loader npm package, we know that the JupyterLab build will have that loader available.

###  TODO:

- [ ] Hook up as an abstract editor? Or at least as another default editor
- [ ] Websocket connection is not secured (to check)
- [ ] socket connection is never closed - even when the file editor is closed  
   But a new websocket is created each time a file is (re)opened  
   => we multiply the number of server instance (for the Python LS example)  
   & => reopening a previously opened file results in an unusable editor  
  Note: Can we get inspiration from the terminal code?
- [ ] Better theme integration with JLab
- [ ] Add ability to open a console link to the file (like the classical editor)

### Language server development

A list of available language server implementation is available [there](https://microsoft.github.io/language-server-protocol/implementors/servers/). 
Feel free to take a look at the [Python example](https://github.com/fcollonval/jupyter_python_languageserver) to code your own notebook server extension.

The important point is the default endpoint. The editor will open by default a websocket
to the following address: `jupyterlabWsUrl + "lsp/" + MonacoLanguageId`. For example for
python and in on a standard PC installation, `ws://localhost:8888/lsp/python`.

Note: the websocket url can be overwritten in the extension settings. For example:

```javascript
{
    "servers": {
        // Language Id : URL
        "python": "ws://localhost:3000/python"
    }
}
```
