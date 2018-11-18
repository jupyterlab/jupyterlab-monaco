import { ServerConnection } from "@jupyterlab/services";

import { listen, MessageConnection } from "vscode-ws-jsonrpc";
import {
  CloseAction,
  ErrorAction,
  MonacoLanguageClient,
  MonacoServices,
  createConnection
} from "monaco-languageclient";

const ReconnectingWebSocket = require("reconnecting-websocket");

export const DEFAULTLANGUAGEID = "plaintext";

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

export namespace Languages {
  /**
   * The interface of a monaco language spec.
   */
  export interface ISpec {
    ext?: string[];
    name?: string;
    mode: string;
    mime: string;
  }

  export interface ILanguageServers {
    readonly [languageId: string]: string;
  }
}

/**
 * Language client manager
 *
 * A unique language client (and associated server) must be opened per programming language used
 * whatever the number of widget containing an editor.
 *
 * This simple manager
 */
export class LanguagesManager {
  protected readonly clients = new Set<string>();
  private _mimeTypesToLanguage = new Map<string, string>();
  private _lservers: Languages.ILanguageServers = {};

  set languageServers(servers: Languages.ILanguageServers){
      this._lservers = servers;
  }

  startLanguageClient(
    languageId: string,
    editor: monaco.editor.IStandaloneCodeEditor
  ): MonacoLanguageClient {
    if (this.clients.has(languageId)) {
      return; // Bail early
    }

    function createLanguageClient(
      connection: MessageConnection
    ): MonacoLanguageClient {
      return new MonacoLanguageClient({
        name: languageId + " Language Client",
        clientOptions: {
          // use a language id as a document selector
          documentSelector: [languageId],
          // disable the default error handler
          errorHandler: {
            error: () => ErrorAction.Continue,
            closed: () => CloseAction.DoNotRestart
          }
        },
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
    if (this._lservers.hasOwnProperty(languageId)) {
      wsurl = this._lservers[languageId];
    }
    
    MonacoServices.install(editor);

    // create the web socket
    const webSocket = createWebSocket(wsurl);
    this.clients.add(languageId);
    let manager = this;
    // listen when the web socket is opened
    listen({
      webSocket,
      onConnection: connection => {
        // create and start the language client
        const languageClient = createLanguageClient(connection);
        const disposable = languageClient.start();
        connection.onClose(() => {
          disposable.dispose();
          manager.clients.delete(languageId);
        });
      }
    });
  }

  findBest(mode: string | Languages.ISpec): string {
      let language = DEFAULTLANGUAGEID;
      if(typeof mode === "string"){
        language = this.findLanguageById(mode).id;
      } else {
        language = this.findLanguageById(mode.mode).id;
        if(language === null){
            language = this.findLanguageForMimeType(mode.mime);

            if(language === DEFAULTLANGUAGEID && mode.ext !== undefined){
                for(const ext of mode.ext){
                    language = this.findLanguageForExtension(ext);
                    if(language !== DEFAULTLANGUAGEID){
                        break;
                    }
                }
            }
        }
      }
      return this.findMimeTypeForLanguage(language);
  }

  findLanguageById(
    id: string | null
  ): monaco.languages.ILanguageExtensionPoint | null {
    const result = monaco.languages
      .getLanguages()
      .filter(language => language.id === id)[0];
    return result ? result : null;
  }

  findMimeTypeForLanguage(languageId: string | null): string {
    const language = this.findLanguageById(languageId);
    if (language){
      if(language.mimetypes && language.mimetypes.length > 0) {
        return language.mimetypes[0];
      } else {
        // FIXME Most languages in https://github.com/Microsoft/monaco-languages
        // do not define a mime type
        return "text/x-" + language.id.toLowerCase();
      }
    }    
    return this.findLanguageById(DEFAULTLANGUAGEID)!.mimetypes[0];
  }

  findLanguageForMimeType(mimeType: string): string {
    let cacheResult = this._mimeTypesToLanguage.get(mimeType);

    if (cacheResult === undefined) {
      cacheResult = DEFAULTLANGUAGEID;
      for (const language of monaco.languages.getLanguages()) {
        if (language.mimetypes){
          if (language.mimetypes.indexOf(mimeType) !== -1) {
            cacheResult = language.id;
            break;
          }
        } else {
          // FIXME Most languages in https://github.com/Microsoft/monaco-languages
          // do not define a mime type
          if ("text/x-" + language.id.toLowerCase() === mimeType) {
            cacheResult = language.id;
            break;
          }
        }
      }

      this._mimeTypesToLanguage.set(mimeType, cacheResult);
    }

    return cacheResult;
  }

  findLanguageForPath(path: string): string {
    const uri = monaco.Uri.parse(path);
    const model = monaco.editor.createModel("", undefined, uri);
    let languageId = model.getModeId();
    model.dispose();
    return languageId;
  }

  findLanguageForExtension(extension: string): string {
    for (const language of monaco.languages.getLanguages()) {
      if (
        language.extensions &&
        language.extensions.indexOf(extension) !== -1
      ) {
        return language.id;
      }
    }
    return DEFAULTLANGUAGEID;
  }
}
