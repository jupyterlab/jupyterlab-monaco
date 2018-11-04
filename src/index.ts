// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/**
 * TODO:
 *
 * - Hook up as an abstract editor? Or at least as another default editor
 * - Websocket connection is not secured (to check)
 * - socket connection is never closed - even when the file editor is closed
 *    But a new websocket is created each time a file is (re)opened
 *    => we multiply the number of server instance (for the Python LS example)
 *    & => reopening a previously opened file results in an unusable editor
 *   Note: Can we get inspiration from the terminal code?
 * - Better theme integration with JLab
 * - Add ability to open a console link to the file (like the classical editor)
 *
 */

require("monaco-editor-core");

import { JupyterLab, JupyterLabPlugin } from "@jupyterlab/application";

import { ICommandPalette } from "@jupyterlab/apputils";

import { PathExt, ISettingRegistry } from "@jupyterlab/coreutils";

import {
  ABCWidgetFactory,
  DocumentRegistry,
  IDocumentWidget,
  DocumentWidget
} from "@jupyterlab/docregistry";

import { IEditorTracker } from "@jupyterlab/fileeditor";

import { ServerConnection } from "@jupyterlab/services";

import { UUID, PromiseDelegate } from "@phosphor/coreutils";

import { Widget } from "@phosphor/widgets";

import "../style/index.css";

import * as monacoEditor from "file-loader!../lib/editor.worker.bundle.js";

(self as any).MonacoEnvironment = {
  getWorkerUrl: function(moduleId: string, label: string): string {
    return monacoEditor;
  }
};

// Load highlighting and grammar rules for supported languages - TODO json is not part of it.
import "monaco-languages/release/esm/monaco.contribution.js";

import { listen, MessageConnection } from "vscode-ws-jsonrpc";
import {
  BaseLanguageClient,
  CloseAction,
  ErrorAction,
  createMonacoServices,
  createConnection
} from "monaco-languageclient";

const ReconnectingWebSocket = require("reconnecting-websocket");

function createWebSocket(url: string): WebSocket {
  const socketOptions = {
    maxReconnectionDelay: 10000,
    minReconnectionDelay: 1000,
    reconnectionDelayGrowFactor: 1.3,
    connectionTimeout: 10000,
    maxRetries: Infinity,
    debug: false
  };
  return new ReconnectingWebSocket(url, undefined, socketOptions);
}

export interface ILanguageServers {
  readonly [languageId: string]: string;
}

/**
 * An monaco widget.
 */
export class MonacoWidget extends Widget {
  /**
   * Construct a new Monaco widget.
   */
  constructor(
    context: DocumentRegistry.CodeContext,
    lservers: ILanguageServers
  ) {
    super();
    this.id = UUID.uuid4();
    this.title.label = PathExt.basename(context.localPath);
    this.title.closable = true;
    this.context = context;

    let content = context.model.toString();
    let uri = monaco.Uri.parse(context.path);

    let monaco_model = undefined;
    if (monaco.editor.getModel(uri)) {
      monaco_model = monaco.editor.getModel(uri);
    } else {
      // Editor picks up the language according to the uri
      monaco_model = monaco.editor.createModel(content, null, uri);
    }
    // Get the Monaco Language Id guessed from the uri
    const languageId = monaco_model.getModeId();

    this.editor = monaco.editor.create(this.node, {
      model: monaco_model,
      glyphMargin: true,
      lightbulb: {
        enabled: true
      }
    });

    var mm = this.editor.getModel();
    mm.onDidChangeContent(event => {
      this.context.model.value.text = this.editor.getValue();
    });

    context.ready.then(() => {
      this._onContextReady();
    });

    const services = createMonacoServices(this.editor);
    function createLanguageClient(
      connection: MessageConnection
    ): BaseLanguageClient {
      return new BaseLanguageClient({
        name: "Sample Language Client",
        clientOptions: {
          // use a language id as a document selector
          documentSelector: [languageId],
          // disable the default error handler
          errorHandler: {
            error: () => ErrorAction.Continue,
            closed: () => CloseAction.DoNotRestart
          }
        },
        services,
        // create a language client connection from the JSON RPC connection on demand
        connectionProvider: {
          get: (errorHandler, closeHandler) => {
            return Promise.resolve(
              createConnection(connection, errorHandler, closeHandler)
            );
          }
        }
      });
    }

    let settings = ServerConnection.makeSettings();
    // Default address for language server is JLab_wsUrl + "lsp/" + languageId
    let wsurl = settings.wsUrl + "lsp/" + languageId;
    if (lservers.hasOwnProperty(languageId)) {
      wsurl = lservers[languageId];
    }

    // create the web socket
    const webSocket = createWebSocket(wsurl);
    // listen when the web socket is opened
    listen({
      webSocket,
      onConnection: connection => {
        // create and start the language client
        const languageClient = createLanguageClient(connection);
        const disposable = languageClient.start();
        connection.onClose(() => disposable.dispose());
      }
    });
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
    contextModel.contentChanged.connect(
      this._onContentChanged,
      this
    );

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

/**
 * A widget factory for editors.
 */
export class MonacoEditorFactory extends ABCWidgetFactory<
  IDocumentWidget<MonacoWidget>,
  DocumentRegistry.ICodeModel
> {
  private lservers: ILanguageServers;

  constructor(a: any, b: ILanguageServers) {
    super(a);
    this.lservers = b;
  }

  /**
   * Create a new widget given a context.
   */
  protected createNewWidget(
    context: DocumentRegistry.CodeContext
  ): IDocumentWidget<MonacoWidget> {
    const content = new MonacoWidget(context, this.lservers);
    const widget = new DocumentWidget({ content, context });
    return widget;
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
  id: "jupyterlab-monaco:plugin",
  autoStart: true,
  requires: [ISettingRegistry, ICommandPalette, IEditorTracker],
  activate: async (
    app: JupyterLab,
    registry: ISettingRegistry,
    palette: ICommandPalette,
    editorTracker: IEditorTracker
  ) => {
    const settings = await registry.load(extension.id);
    const servers = settings.composite["servers"] as ILanguageServers;
    console.log("starting " + extension.id);

    const factory = new MonacoEditorFactory(
      {
        name: "Monaco Editor",
        fileTypes: ["*"],
        defaultFor: ["*"]
      },
      servers
    );
    app.docRegistry.addWidgetFactory(factory);

    // Add an application command
    const command: string = "monaco:open";
    app.commands.addCommand(command, {
      label: "Monaco Editor",
      execute: () => {
        let widget = new Widget();
        widget.node.innerHTML = "Creating new files coming...";
        //let widget = new MonacoWidget();
        app.shell.addToMainArea(widget);

        // Activate the widget
        app.shell.activateById(widget.id);
      }
    });

    // Add the command to the palette.
    palette.addItem({ command, category: "Monaco" });
  }
};

export default extension;
