// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/**
 * TODO:
 *
 * - Hook up as an abstract editor? Or at least as another default editor
 * - `monaco.languages.getLanguages()` contains all of the highlighting modes -
 *
 */

import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette
} from '@jupyterlab/apputils';

import {
  uuid, PathExt
} from '@jupyterlab/coreutils';

import {
  IEditorTracker
} from '@jupyterlab/fileeditor';

import {
  PromiseDelegate
} from '@phosphor/coreutils';

import {
  Widget
} from '@phosphor/widgets';

import * as monaco from 'monaco-editor';

import '../style/index.css';

import * as monacoCSS from 'file-loader!../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-css.worker.bundle.js';
import * as monacoEditor from 'file-loader!../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-editor.worker.bundle.js';
import * as monacoHTML from 'file-loader!../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-html.worker.bundle.js';
import * as monacoJSON from 'file-loader!../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-json.worker.bundle.js';
import * as monacoTS from 'file-loader!../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-ts.worker.bundle.js';


let URLS: {[key: string]: string} = {
  css: monacoCSS,
  html: monacoHTML,
  javascript: monacoTS,
  json: monacoJSON,
  typescript: monacoTS
};

(self as any).MonacoEnvironment = {
  getWorkerUrl: function (moduleId: string, label: string): string {
    let url = URLS[label] || monacoEditor;
    return url;
  }
}

/**
* An monaco widget.
*/
export
class MonacoWidget extends Widget implements DocumentRegistry.IReadyWidget {
  /**
   * Construct a new Monaco widget.
   */
  constructor(context: DocumentRegistry.CodeContext) {
    super();
    this.id = uuid();
    this.title.label = PathExt.basename(context.localPath);
    this.title.closable = true;
    this.context = context;

    let content = context.model.toString();
    let uri = monaco.Uri.parse(context.path);

    let monaco_model = undefined;
    if(monaco.editor.getModel(uri)) {
      monaco_model = monaco.editor.getModel(uri);
    } else {
      monaco_model = monaco.editor.createModel(content, undefined, uri);
    }

    this.editor = monaco.editor.create(this.node, {
      model: monaco_model
    });

    monaco_model.onDidChangeContent((event) => {
      this.context.model.value.text = this.editor.getValue();
    });

    context.ready.then(() => { this._onContextReady(); });
  }

  /**
   * Handle actions that should be taken when the context is ready.
   */
  private _onContextReady(): void {
    if (this.isDisposed) {
      return;
    }
    const contextModel = this.context.model;

    // Set the editor model value.
    this.editor.setValue(contextModel.toString());

    // Wire signal connections.
    contextModel.contentChanged.connect(this._onContentChanged, this);

    // Resolve the ready promise.
    this._ready.resolve(undefined);
  }

  /**
   * A promise that resolves when the file editor is ready.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Handle a change in context model content.
   */
  private _onContentChanged(): void {
    const oldValue = this.editor.getValue();
    const newValue = this.context.model.toString();

    if (oldValue !== newValue) {
      this.editor.setValue(newValue);
    }
  }

  onResize() {
    this.editor.layout();
  }

  onAfterShow() {
    this.editor.layout();
  }

  context: DocumentRegistry.CodeContext;
  private _ready = new PromiseDelegate<void>();
  editor: monaco.editor.IStandaloneCodeEditor;
}

import {
  ABCWidgetFactory, DocumentRegistry
} from '@jupyterlab/docregistry';


/**
 * A widget factory for editors.
 */
export
class MonacoEditorFactory extends ABCWidgetFactory<MonacoWidget, DocumentRegistry.ICodeModel> {

  /**
   * Create a new widget given a context.
   */
  protected createNewWidget(context: DocumentRegistry.CodeContext): MonacoWidget {
    return new MonacoWidget(context);
  }
}

/**
 * Initialization data for the jupyterlab-monaco extension.
 *
 * #### Notes
 * The only reason we depend on the IEditorTracker is so that our docregistry
 * 'defaultFor' runs *after* the file editors defaultFor.
 */
const extension: JupyterLabPlugin<void> = {
  id: 'jupyterlab-monaco',
  autoStart: true,
  requires: [ICommandPalette, IEditorTracker],
  activate: (app: JupyterLab, palette: ICommandPalette, editorTracker: IEditorTracker) => {

    const factory = new MonacoEditorFactory({
      name: 'Monaco Editor',
      fileTypes: ['*'],
      defaultFor: ['*']
    });
    app.docRegistry.addWidgetFactory(factory);

    // Add an application command
    const command: string = 'monaco:open';
    app.commands.addCommand(command, {
      label: 'Monaco Editor',
      execute: () => {
        let widget = new Widget();
        widget.node.innerHTML = 'Creating new files coming...'
        //let widget = new MonacoWidget();
        app.shell.addToMainArea(widget);

        // Activate the widget
        app.shell.activateById(widget.id);
      }
    });

    // Add the command to the palette.
    palette.addItem({ command, category: 'Monaco' });
  }
};

export default extension;
