import {
  JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  ICommandPalette
} from '@jupyterlab/apputils';

import {
  uuid
} from '@jupyterlab/coreutils';

import {
  Widget
} from '@phosphor/widgets';

import * as monaco from 'monaco-editor';

import '../style/index.css';

import * as monacoCSS from '../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-css.worker.bundle.js';
import * as monacoEditor from '../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-editor.worker.bundle.js';
import * as monacoHTML from '../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-html.worker.bundle.js';
import * as monacoJSON from '../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-json.worker.bundle.js';
import * as monacoTS from '../lib/JUPYTERLAB_FILE_LOADER_jupyterlab-monaco-ts.worker.bundle.js';

let URLS: {[key: string]: string} = {
  json: monacoJSON,
  css: monacoCSS,
  html: monacoHTML,
  typescript: monacoTS,
  javascript: monacoTS,
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
class MonacoWidget extends Widget {
  /**
   * Construct a new xkcd widget.
   */
  constructor() {
    super();
    this.id = uuid();
    this.title.label = 'Monaco Editor';
    this.title.closable = true;

    this.editor = monaco.editor.create(this.node, {
        value: [
            'function x() {',
            '\tconsole.log("Hello world!");',
            '}'
        ].join('\n'),
        language: 'javascript'
    });
  }

  onResize() {
    this.editor.layout();
  }

  onAfterShow() {
    this.editor.layout();
  }

  editor: monaco.editor.IStandaloneCodeEditor;
}


/**
 * Initialization data for the jupyterlab-monaco extension.
 */
const extension: JupyterLabPlugin<void> = {
  id: 'jupyterlab-monaco',
  autoStart: true,
  requires: [ICommandPalette],
  activate: (app: JupyterLab, palette: ICommandPalette) => {

    // Add an application command
    const command: string = 'monaco:open';
    app.commands.addCommand(command, {
      label: 'Monaco Editor',
      execute: () => {
        let widget = new MonacoWidget();
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
