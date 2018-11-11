// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { CodeEditor, IEditorFactoryService } from "@jupyterlab/codeeditor";

import { MonacoEditor } from "./editor";
import { LanguagesManager } from "./languages";

/**
 * Monaco editor factory.
 */
export class MonacoEditorFactory implements IEditorFactoryService {
  /**
   * Construct an IEditorFactoryService for MonacoEditors.
   */
  constructor(
    mangager: LanguagesManager,
    defaults: Partial<MonacoEditor.IConfig> = {}
  ) {
    this._manager = mangager;

    this.inlineMonacoConfig = {
      ...MonacoEditor.defaultConfig,
      // extraKeys: {
      //   'Cmd-Right': 'goLineRight',
      //   End: 'goLineRight',
      //   'Cmd-Left': 'goLineLeft',
      //   Tab: 'indentMoreOrinsertTab',
      //   'Shift-Tab': 'indentLess',
      //   'Cmd-/': 'toggleComment',
      //   'Ctrl-/': 'toggleComment'
      // },
      ...defaults
    };
    this.documentMonacoConfig = {
      ...MonacoEditor.defaultConfig,
      // extraKeys: {
      //   Tab: 'indentMoreOrinsertTab',
      //   'Shift-Tab': 'indentLess',
      //   'Cmd-/': 'toggleComment',
      //   'Ctrl-/': 'toggleComment',
      //   'Shift-Enter': () => {
      //     /* no-op */
      //   }
      // },
      lineNumbers: true,
      scrollPastEnd: true,
      ...defaults
    };
  }

  /**
   * Create a new editor for inline code.
   */
  newInlineEditor = (options: CodeEditor.IOptions) => {
    options.host.dataset.type = "inline";
    const editor = new MonacoEditor(this._manager, {
      ...options,
      config: { ...this.inlineMonacoConfig, ...(options.config || {}) }
    });
    return editor;
  };

  /**
   * Create a new editor for a full document.
   */
  newDocumentEditor = (options: CodeEditor.IOptions) => {
    options.host.dataset.type = "document";
    const editor = new MonacoEditor(this._manager, {
      ...options,
      config: { ...this.documentMonacoConfig, ...(options.config || {}) }
    });
    return editor;
  };

  protected inlineMonacoConfig: Partial<MonacoEditor.IConfig>;
  protected documentMonacoConfig: Partial<MonacoEditor.IConfig>;
  private _manager: LanguagesManager;
}
