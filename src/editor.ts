// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/**
 * TODO:
 *
 * - Hook up as an abstract editor? Or at least as another default editor
 * - Websocket connection is not secured (to check)
 * - Better theme integration with JLab
 * - Add ability to open a console link to the file (like the classical editor)
 *
 */

require("monaco-editor-core");

// import { JSONExt, UUID } from "@phosphor/coreutils";
import { UUID } from "@phosphor/coreutils";

import { ArrayExt } from "@phosphor/algorithm";

import { IDisposable, DisposableDelegate } from "@phosphor/disposable";

import { Signal } from "@phosphor/signaling";

import { showDialog } from "@jupyterlab/apputils";

import { CodeEditor } from "@jupyterlab/codeeditor";

import {
  IObservableMap,
  IObservableString
  // ICollaborator
} from "@jupyterlab/observables";

import * as Monaco from "file-loader!../lib/editor.worker.bundle.js";

(self as any).MonacoEnvironment = {
  getWorkerUrl: function(moduleId: string, label: string): string {
    return Monaco;
  }
};

// Load highlighting and grammar rules for supported languages - TODO json is not part of it.
import "monaco-languages/release/esm/monaco.contribution.js";
import { LanguagesManager } from "./languages";

/**
 * The class name added to MonacoWidget instances.
 */
const EDITOR_CLASS = "jp-MonacoEditor";

/**
 * The class name added to read only cell editor widgets.
 */
// const READ_ONLY_CLASS = "jp-mod-readOnly";

/**
 * The class name for the hover box for collaborator cursors.
 */
// const COLLABORATOR_CURSOR_CLASS = "jp-CollaboratorCursor";

/**
 * The class name for the hover box for collaborator cursors.
 */
// const COLLABORATOR_HOVER_CLASS = "jp-CollaboratorCursor-hover";

/**
 * The key code for the up arrow key.
 */
// const UP_ARROW = 38;

/**
 * The key code for the down arrow key.
 */
// const DOWN_ARROW = 40;

/**
 * The time that a collaborator name hover persists.
 */
// const HOVER_TIMEOUT = 1000;

/**
 * Monaco editor.
 */
export class MonacoEditor implements CodeEditor.IEditor {
  /**
   * Construct a Monaco editor.
   */
  constructor(manager: LanguagesManager, options: MonacoEditor.IOptions) {
    this._manager = manager;
    let host = (this.host = options.host);
    host.classList.add(EDITOR_CLASS);
    host.classList.add("jp-Editor");
    host.addEventListener("focus", this, true);
    host.addEventListener("blur", this, true);
    host.addEventListener("scroll", this, true);

    this._uuid = options.uuid || UUID.uuid4();

    // Handle selection style.
    let style = options.selectionStyle || {};
    this._selectionStyle = {
      ...CodeEditor.defaultSelectionStyle,
      ...(style as CodeEditor.ISelectionStyle)
    };

    let model = (this._model = options.model);
    let config = options.config || {};
    let fullConfig = (this._config = {
      ...MonacoEditor.defaultConfig,
      ...config
    });
    // TODO the text from the model is not directly available ?! Why?
    let content = model.value.text;
    let monacoModel = monaco.editor.createModel(content);
    let editor = (this._editor = Private.createEditor(
      host,
      monacoModel,
      fullConfig
    ));

    // FIXME - see previous TODO
    let doc = editor.getModel();
    // Handle initial values for text, mimetype, and selections.
    window.setTimeout(() => {
      doc.setValue(model.value.text);
    }, 500);

    this.clearHistory();
    this._onMimeTypeChanged();
    this._onCursorActivity();
    this._timer = window.setInterval(() => {
      this._checkSync();
    }, 3000);

    // Connect to changes.
    model.value.changed.connect(
      this._onValueChanged,
      this
    );
    model.mimeTypeChanged.connect(
      this._onMimeTypeChanged,
      this
    );
    model.selections.changed.connect(
      this._onSelectionsChanged,
      this
    );

    // Monaco.on(editor, 'keydown', (editor: Monaco.Editor, event) => {
    //   let index = ArrayExt.findFirstIndex(this._keydownHandlers, handler => {
    //     if (handler(this, event) === true) {
    //       event.preventDefault();
    //       return true;
    //     }
    //     return false;
    //   });
    //   if (index === -1) {
    //     this.onKeydown(event);
    //   }
    // });
    // Monaco.on(editor, 'cursorActivity', () => this._onCursorActivity());
    // Monaco.on(editor.getDoc(), 'beforeChange', (instance, change) => {
    //   this._beforeDocChanged(instance, change);
    // });
    // Monaco.on(editor.getDoc(), 'change', (instance, change) => {
    //   // Manually refresh after setValue to make sure editor is properly sized.
    //   if (change.origin === 'setValue' && this.hasFocus()) {
    //     this.refresh();
    //   }
    //   this._lastChange = change;
    // });

    // Manually refresh on paste to make sure editor is properly sized.
    editor.getDomNode().addEventListener("paste", () => {
      if (this.hasFocus()) {
        this.refresh();
      }
    });
  }

  /**
   * A signal emitted when either the top or bottom edge is requested.
   */
  readonly edgeRequested = new Signal<this, CodeEditor.EdgeLocation>(this);

  /**
   * The DOM node that hosts the editor.
   */
  readonly host: HTMLElement;

  /**
   * The uuid of this editor;
   */
  get uuid(): string {
    return this._uuid;
  }
  set uuid(value: string) {
    this._uuid = value;
  }

  /**
   * The selection style of this editor.
   */
  get selectionStyle(): CodeEditor.ISelectionStyle {
    return this._selectionStyle;
  }
  set selectionStyle(value: CodeEditor.ISelectionStyle) {
    this._selectionStyle = value;
  }

  /**
   * Get the Monaco editor wrapped by the editor.
   */
  get editor(): monaco.editor.IStandaloneCodeEditor {
    return this._editor;
  }

  /**
   * Get the Monaco doc wrapped by the widget.
   */
  get doc(): monaco.editor.ITextModel {
    return this._editor.getModel();
  }

  /**
   * Get the number of lines in the editor.
   */
  get lineCount(): number {
    return this.doc.getLineCount();
  }

  /**
   * Returns a model for this editor.
   */
  get model(): CodeEditor.IModel {
    return this._model;
  }

  /**
   * The height of a line in the editor in pixels.
   */
  get lineHeight(): number {
    return this._editor.getConfiguration().fontInfo.lineHeight;
  }

  /**
   * The widget of a character in the editor in pixels.
   */
  get charWidth(): number {
    // TODO unsure
    return this._editor.getConfiguration().fontInfo.fontSize;
  }

  /**
   * Tests whether the editor is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this.host.removeEventListener("focus", this, true);
    this.host.removeEventListener("blur", this, true);
    this.host.removeEventListener("scroll", this, true);
    this._keydownHandlers.length = 0;
    window.clearInterval(this._timer);
    Signal.clearData(this);
    this._editor.dispose();
  }

  /**
   * Get a config option for the editor.
   */
  getOption<K extends keyof MonacoEditor.IConfig>(
    option: K
  ): MonacoEditor.IConfig[K] {
    return this._config[option];
  }

  /**
   * Set a config option for the editor.
   */
  setOption<K extends keyof MonacoEditor.IConfig>(
    option: K,
    value: MonacoEditor.IConfig[K]
  ): void {
    // Don't bother setting the option if it is already the same.
    if (this._config[option] !== value) {
      this._config[option] = value;
      Private.setOption(this.editor, option, value, this._config);
    }
  }

  /**
   * Returns the content for the given line number.
   */
  getLine(line: number): string | undefined {
    // Monaco is one-based editor when CodeEditor is zero-based
    if(line < this.doc.getLineCount()){
      return this.doc.getLineContent(line + 1);
    }
    return "";
  }

  /**
   * Find an offset for the given position.
   */
  getOffsetAt(position: CodeEditor.IPosition): number {
    return this.doc.getOffsetAt(this._toMonacoPosition(position));
  }

  /**
   * Find a position for the given offset.
   */
  getPositionAt(offset: number): CodeEditor.IPosition {
    return this._toPosition(this.doc.getPositionAt(offset));
  }

  /**
   * Undo one edit (if any undo events are stored).
   */
  undo(): void {
    // TODO this.doc.undo();
  }

  /**
   * Redo one undone edit.
   */
  redo(): void {
    // TODO this.doc.redo();
  }

  /**
   * Clear the undo history.
   */
  clearHistory(): void {
    // TODO this.doc.clearHistory();
  }

  /**
   * Brings browser focus to this editor text.
   */
  focus(): void {
    this._editor.focus();
  }

  /**
   * Test whether the editor has keyboard focus.
   */
  hasFocus(): boolean {
    return this._editor.hasTextFocus();
  }

  /**
   * Explicitly blur the editor.
   */
  blur(): void {
    // TODO this._editor.;
  }

  /**
   * Repaint editor.
   */
  refresh(): void {
    this._editor.render();
    this._needsRefresh = false;
  }

  /**
   * Refresh the editor if it is focused;
   * otherwise postpone refreshing till focusing.
   */
  resizeToFit(): void {
    if (this.hasFocus()) {
      this.refresh();
    } else {
      this._needsRefresh = true;
    }
    this._clearHover();
  }

  /**
   * Add a keydown handler to the editor.
   *
   * @param handler - A keydown handler.
   *
   * @returns A disposable that can be used to remove the handler.
   */
  addKeydownHandler(handler: CodeEditor.KeydownHandler): IDisposable {
    this._keydownHandlers.push(handler);
    return new DisposableDelegate(() => {
      ArrayExt.removeAllWhere(this._keydownHandlers, val => val === handler);
    });
  }

  /**
   * Set the size of the editor in pixels.
   */
  setSize(dimension: CodeEditor.IDimension | null): void {
    if (dimension) {
      this._editor.layout(dimension);
    } else {
      this._editor.layout();
    }
    this._needsRefresh = false;
  }

  /**
   * Reveal the given position in the editor.
   */
  revealPosition(position: CodeEditor.IPosition): void {
    const cmPosition = this._toMonacoPosition(position);
    this._editor.revealPosition(cmPosition);
  }

  /**
   * Reveal the given selection in the editor.
   */
  revealSelection(selection: CodeEditor.IRange): void {
    const range = this._toMonacoRange(selection);
    this._editor.revealRange(range);
  }

  /**
   * Get the window coordinates given a cursor position.
   */
  getCoordinateForPosition(
    position: CodeEditor.IPosition
  ): CodeEditor.ICoordinate {
    // TODO
    // const pos = this._toMonacoPosition(position);
    // const rect = this.editor.charCoords(pos, "page");
    // return rect as CodeEditor.ICoordinate;
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0
    };
  }

  /**
   * Get the cursor position given window coordinates.
   *
   * @param coordinate - The desired coordinate.
   *
   * @returns The position of the coordinates, or null if not
   *   contained in the editor.
   */
  getPositionForCoordinate(
    coordinate: CodeEditor.ICoordinate
  ): CodeEditor.IPosition | null {
    // TODO return this._toPosition(this.editor.coordsChar(coordinate)) || null;
    return null;
  }

  /**
   * Returns the primary position of the cursor, never `null`.
   */
  getCursorPosition(): CodeEditor.IPosition {
    const cursor = this.editor.getPosition();
    return this._toPosition(cursor);
  }

  /**
   * Set the primary position of the cursor.
   *
   * #### Notes
   * This will remove any secondary cursors.
   */
  setCursorPosition(position: CodeEditor.IPosition): void {
    const cursor = this._toMonacoPosition(position);
    this.editor.setPosition(cursor);
    // If the editor does not have focus, this cursor change
    // will get screened out in _onCursorsChanged(). Make an
    // exception for this method.
    if (!this.editor.hasTextFocus()) {
      this.model.selections.set(this.uuid, this.getSelections());
    }
  }

  /**
   * Returns the primary selection, never `null`.
   */
  getSelection(): CodeEditor.ITextSelection {
    return this._toSelection(this.editor.getSelection());
  }

  /**
   * Set the primary selection. This will remove any secondary cursors.
   */
  setSelection(selection: CodeEditor.IRange): void {
    this.editor.setSelection(this._toMonacoSelection(selection));
  }

  /**
   * Gets the selections for all the cursors, never `null` or empty.
   */
  getSelections(): CodeEditor.ITextSelection[] {
    const selections = this.editor.getSelections();
    if (selections.length > 0) {
      return selections.map(selection => this._toSelection(selection));
    }
    const cursor = this.getCursorPosition();
    const selection: CodeEditor.ITextSelection = {
      uuid: this.uuid,
      start: cursor,
      end: cursor,
      style: this.selectionStyle
    };
    return [selection];
  }

  /**
   * Sets the selections for all the cursors, should not be empty.
   * Cursors will be removed or added, as necessary.
   * Passing an empty array resets a cursor position to the start of a document.
   */
  setSelections(selections: CodeEditor.IRange[]): void {
    const cmSelections = this._toMonacoSelections(selections);
    this.editor.setSelections(cmSelections);
  }

  /**
   * Get a list of tokens for the current editor text content.
   */
  getTokens(): CodeEditor.IToken[] {
    let tokens: CodeEditor.IToken[] = [];
    // TODO
    // for (let i = 0; i < this.lineCount; ++i) {
    //   const lineTokens = this.editor.getLineTokens(i).map(t => ({
    //     offset: this.getOffsetAt({ column: t.start, line: i }),
    //     value: t.string,
    //     type: t.type || ""
    //   }));
    //   tokens = tokens.concat(lineTokens);
    // }
    return tokens;
  }

  /**
   * Get the token at a given editor position.
   */
  getTokenForPosition(position: CodeEditor.IPosition): CodeEditor.IToken {
    const cursor = this._toMonacoPosition(position);
    const token = this.doc.getWordUntilPosition(cursor);
    return {
      offset: this.getOffsetAt({
        column: token.startColumn,
        line: cursor.lineNumber
      }),
      value: token.word
    };
  }

  /**
   * Insert a new indented line at the current cursor position.
   */
  newIndentedLine(): void {
    // TODO
    // this.execCommand("newlineAndIndent");
  }

  /**
   * Execute a Monaco command on the editor.
   *
   * @param command - The name of the command to execute.
   */
  // TODO
  // execCommand(command: string): void {
  //   this._editor.execCommand(command);
  // }

  /**
   * Handle keydown events from the editor.
   */
  // TODO
  // protected onKeydown(event: KeyboardEvent): boolean {
  //   let position = this.getCursorPosition();
  //   let { line, column } = position;

  //   if (line === 0 && column === 0 && event.keyCode === UP_ARROW) {
  //     if (!event.shiftKey) {
  //       this.edgeRequested.emit("top");
  //     }
  //     return false;
  //   }

  //   let lastLine = this.lineCount - 1;
  //   let lastCh = this.getLine(lastLine)!.length;
  //   if (
  //     line === lastLine &&
  //     column === lastCh &&
  //     event.keyCode === DOWN_ARROW
  //   ) {
  //     if (!event.shiftKey) {
  //       this.edgeRequested.emit("bottom");
  //     }
  //     return false;
  //   }
  //   return false;
  // }

  /**
   * Converts selections to monaco selections.
   */
  private _toMonacoSelections(
    selections: CodeEditor.IRange[]
  ): monaco.ISelection[] {
    if (selections.length > 0) {
      return selections.map(selection => this._toMonacoSelection(selection));
    }
    return [new monaco.Selection(0, 0, 0, 0)];
  }

  /**
   * Handles a mime type change.
   */
  private _onMimeTypeChanged(): void {
    const mime = this._model.mimeType;
    let manager = this._manager;
    let id = manager.findLanguageForMimeType(mime);
    manager.startLanguageClient(id, this.editor);
    
    monaco.editor.setModelLanguage(this.doc, id);
    
    // TODO
    // let extraKeys = editor.getOption("extraKeys") || {};
    // const isCode = mime !== "text/plain" && mime !== "text/x-ipythongfm";
    // if (isCode) {
    //   extraKeys["Backspace"] = "delSpaceToPrevTabStop";
    // } else {
    //   delete extraKeys["Backspace"];
    // }
    // editor.setOption("extraKeys", extraKeys);
  }

  /**
   * Handles a selections change.
   */
  private _onSelectionsChanged(
    selections: IObservableMap<CodeEditor.ITextSelection[]>,
    args: IObservableMap.IChangedArgs<CodeEditor.ITextSelection[]>
  ): void {
    const uuid = args.key;
    if (uuid !== this.uuid) {
      this._cleanSelections(uuid);
      if (args.type !== "remove" && args.newValue) {
        this._markSelections(uuid, args.newValue);
      }
    }
  }

  /**
   * Clean selections for the given uuid.
   */
  private _cleanSelections(uuid: string) {
    // const markers = this.selectionMarkers[uuid];
    // if (markers) {
    //   markers.forEach(marker => {
    //     marker.clear();
    //   });
    // }
    // delete this.selectionMarkers[uuid];
  }

  /**
   * Marks selections.
   */
  private _markSelections(
    uuid: string,
    selections: CodeEditor.ITextSelection[]
  ) {
    // const markers: Monaco.TextMarker[] = [];
    // // If we are marking selections corresponding to an active hover,
    // // remove it.
    // if (uuid === this._hoverId) {
    //   this._clearHover();
    // }
    // // If we can id the selection to a specific collaborator,
    // // use that information.
    // let collaborator: ICollaborator | undefined;
    // if (this._model.modelDB.collaborators) {
    //   collaborator = this._model.modelDB.collaborators.get(uuid);
    // }
    // // Style each selection for the uuid.
    // selections.forEach(selection => {
    //   // Only render selections if the start is not equal to the end.
    //   // In that case, we don't need to render the cursor.
    //   if (!JSONExt.deepEqual(selection.start, selection.end)) {
    //     const { anchor, head } = this._toMonacoSelection(selection);
    //     let markerOptions: Monaco.TextMarkerOptions;
    //     if (collaborator) {
    //       markerOptions = this._toTextMarkerOptions({
    //         ...selection.style,
    //         color: collaborator.color
    //       });
    //     } else {
    //       markerOptions = this._toTextMarkerOptions(selection.style);
    //     }
    //     markers.push(this.doc.markText(anchor, head, markerOptions));
    //   } else if (collaborator) {
    //     let caret = this._getCaret(collaborator);
    //     markers.push(
    //       this.doc.setBookmark(this._toMonacoPosition(selection.end), {
    //         widget: caret
    //       })
    //     );
    //   }
    // });
    // this.selectionMarkers[uuid] = markers;
  }

  /**
   * Handles a cursor activity event.
   */
  private _onCursorActivity(): void {
    // Only add selections if the editor has focus. This avoids unwanted
    // triggering of cursor activity due to collaborator actions.
    if (this._editor.hasTextFocus()) {
      const selections = this.getSelections();
      this.model.selections.set(this.uuid, selections);
    }
  }

  /**
   * Converts a monacoselection to an editor selection.
   */
  private _toSelection(
    selection: monaco.ISelection
  ): CodeEditor.ITextSelection {
    return {
      uuid: this.uuid,
      start: {
        line: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn
      },
      end: {
        line: selection.positionLineNumber,
        column: selection.positionColumn
      },
      style: this.selectionStyle
    };
  }

  /**
   * Converts the selection style to a text marker options.
   */
  // private _toTextMarkerOptions(
  //   style: CodeEditor.ISelectionStyle
  // ): monaco.editor.IModelDecorationOptions {
  //   // TODO styling in monaco only through class name
  //   // let r = parseInt(style.color.slice(1, 3), 16);
  //   // let g = parseInt(style.color.slice(3, 5), 16);
  //   // let b = parseInt(style.color.slice(5, 7), 16);
  //   // let css = `background-color: rgba( ${r}, ${g}, ${b}, 0.15)`;
  //   return {
  //     className: style.className,
  //     hoverMessage: {value: style.displayName},
  //     // css
  //   };
  // }

  /**
   * Converts an editor selection to a monaco selection.
   */
  private _toMonacoSelection(selection: CodeEditor.IRange): monaco.ISelection {
    // Selections only appear to render correctly if the anchor
    // is before the head in the document. That is, reverse selections
    // do not appear as intended.
    return new monaco.Selection(
      selection.start.line,
      selection.start.column,
      selection.end.line,
      selection.end.column
    );
  }

  /**
   * Converts an editor selection to a monacoselection.
   */
  private _toMonacoRange(range: CodeEditor.IRange): monaco.IRange {
    const start = this._toMonacoPosition(range.start);
    const end = this._toMonacoPosition(range.end);
    return {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column
    };
  }

  /**
   * Convert a monacoposition to an editor position.
   */
  private _toPosition(position: monaco.IPosition): CodeEditor.IPosition {
    return {
      line: position.lineNumber - 1,
      column: position.column - 1
    };
  }

  /**
   * Convert an editor position to a monacoposition.
   */
  private _toMonacoPosition(position: CodeEditor.IPosition): monaco.IPosition {
    return {
      lineNumber: position.line + 1,
      column: position.column + 1
    };
  }

  /**
   * Handle model value changes.
   */
  private _onValueChanged(
    value: IObservableString,
    args: IObservableString.IChangedArgs
  ): void {
    if (this._changeGuard) {
      return;
    }
    this._changeGuard = true;
    // TODO to be handle through ITextModel.applyEdits
    // let doc = this.doc;
    // switch (args.type) {
    //   case "insert":
    //     let pos = doc.posFromIndex(args.start);
    //     doc.replaceRange(args.value, pos, pos);
    //     break;
    //   case "remove":
    //     let from = doc.posFromIndex(args.start);
    //     let to = doc.posFromIndex(args.end);
    //     doc.replaceRange("", from, to);
    //     break;
    //   case "set":
    //     doc.setValue(args.value);
    //     break;
    //   default:
    //     break;
    // }
    this._changeGuard = false;
  }

  /**
   * Handles document changes.
   */
  // TODO
  // private _beforeDocChanged(doc: monaco.editor.ITextModel, change: monaco.editor.IChange) {
  //   if (this._changeGuard) {
  //     return;
  //   }
  //   this._changeGuard = true;
  //   let value = this._model.value;
  //   let start = doc.indexFromPos(change.from);
  //   let end = doc.indexFromPos(change.to);
  //   let inserted = change.text.join("\n");

  //   if (end !== start) {
  //     value.remove(start, end);
  //   }
  //   if (inserted) {
  //     value.insert(start, inserted);
  //   }
  //   this._changeGuard = false;
  // }

  /**
   * Handle the DOM events for the editor.
   *
   * @param event - The DOM event sent to the editor.
   *
   * #### Notes
   * This method implements the DOM `EventListener` interface and is
   * called in response to events on the editor's DOM node. It should
   * not be called directly by user code.
   */
  handleEvent(event: Event): void {
    switch (event.type) {
      case "focus":
        this._evtFocus(event as FocusEvent);
        break;
      case "blur":
        this._evtBlur(event as FocusEvent);
        break;
      case "scroll":
        this._evtScroll();
        break;
      default:
        break;
    }
  }

  /**
   * Handle `focus` events for the editor.
   */
  private _evtFocus(event: FocusEvent): void {
    if (this._needsRefresh) {
      this.refresh();
    }
    this.host.classList.add("jp-mod-focused");

    // Update the selections on editor gaining focus because
    // the onCursorActivity function filters usual cursor events
    // based on the editor's focus.
    this._onCursorActivity();
  }

  /**
   * Handle `blur` events for the editor.
   */
  private _evtBlur(event: FocusEvent): void {
    this.host.classList.remove("jp-mod-focused");
  }

  /**
   * Handle `scroll` events for the editor.
   */
  private _evtScroll(): void {
    // Remove any active hover.
    this._clearHover();
  }

  /**
   * Clear the hover for a caret, due to things like
   * scrolling, resizing, deactivation, etc, where
   * the position is no longer valid.
   */
  private _clearHover(): void {
    if (this._caretHover) {
      window.clearTimeout(this._hoverTimeout);
      document.body.removeChild(this._caretHover);
      this._caretHover = null;
    }
  }

  /**
   * Construct a caret element representing the position
   * of a collaborator's cursor.
   */
  // private _getCaret(collaborator: ICollaborator): HTMLElement {
  //   let name = collaborator ? collaborator.displayName : "Anonymous";
  //   let color = collaborator ? collaborator.color : this._selectionStyle.color;
  //   let caret: HTMLElement = document.createElement("span");
  //   caret.className = COLLABORATOR_CURSOR_CLASS;
  //   caret.style.borderBottomColor = color;
  //   caret.onmouseenter = () => {
  //     this._clearHover();
  //     this._hoverId = collaborator.sessionId;
  //     let rect = caret.getBoundingClientRect();
  //     // Construct and place the hover box.
  //     let hover = document.createElement("div");
  //     hover.className = COLLABORATOR_HOVER_CLASS;
  //     hover.style.left = String(rect.left) + "px";
  //     hover.style.top = String(rect.bottom) + "px";
  //     hover.textContent = name;
  //     hover.style.backgroundColor = color;

  //     // If the user mouses over the hover, take over the timer.
  //     hover.onmouseenter = () => {
  //       window.clearTimeout(this._hoverTimeout);
  //     };
  //     hover.onmouseleave = () => {
  //       this._hoverTimeout = window.setTimeout(() => {
  //         this._clearHover();
  //       }, HOVER_TIMEOUT);
  //     };
  //     this._caretHover = hover;
  //     document.body.appendChild(hover);
  //   };
  //   caret.onmouseleave = () => {
  //     this._hoverTimeout = window.setTimeout(() => {
  //       this._clearHover();
  //     }, HOVER_TIMEOUT);
  //   };
  //   return caret;
  // }

  /**
   * Check for an out of sync editor.
   */
  private _checkSync(): void {
    let change = this._lastChange;
    if (!change) {
      return;
    }
    this._lastChange = null;
    let editor = this._editor;
    let doc = editor.getModel();
    if (doc.getValue() === this._model.value.text) {
      return;
    }

    showDialog({
      title: "Code Editor out of Sync",
      body:
        "Please open your browser JavaScript console for bug report instructions"
    });
    console.log(
      "Please paste the following to https://github.com/jupyterlab/jupyterlab/issues/2951"
    );
    console.log(
      JSON.stringify({
        model: this._model.value.text,
        view: doc.getValue(),
        selections: this.getSelections(),
        cursor: this.getCursorPosition(),
        // TODO
        // lineSep: editor.getOption("lineSeparator"),
        // mode: editor.getOption("mode"),
        change
      })
    );
  }

  private _manager: LanguagesManager;
  private _model: CodeEditor.IModel;
  private _editor: monaco.editor.IStandaloneCodeEditor;
  protected selectionMarkers: {
    [key: string]: monaco.editor.IModelDecoration[] | undefined;
  } = {};
  private _caretHover: HTMLElement | null;
  private readonly _config: MonacoEditor.IConfig;
  private _hoverTimeout: number;
  // private _hoverId: string;
  private _keydownHandlers = new Array<CodeEditor.KeydownHandler>();
  private _changeGuard = false;
  private _selectionStyle: CodeEditor.ISelectionStyle;
  private _uuid = "";
  private _needsRefresh = false;
  private _isDisposed = false;
  private _lastChange: monaco.editor.IChange | null = null;
  private _timer = -1;
}

/**
 * The namespace for `MonacoEditor` statics.
 */
export namespace MonacoEditor {
  /**
   * The options used to initialize a monacoeditor.
   */
  export interface IOptions extends CodeEditor.IOptions {
    /**
     * The configuration options for the editor.
     */
    config?: Partial<IConfig>;
  }

  /**
   * The configuration options for a Monaco editor.
   */
  export interface IConfig extends CodeEditor.IConfig {
    /**
     * The mode to use.
     */
    mode?: string; // | Mode.IMode;

    /**
     * The theme to style the editor with.
     * You must make sure the CSS file defining the corresponding
     * .cm-s-[name] styles is loaded.
     */
    theme?: string;

    /**
     * Whether to use the context-sensitive indentation that the mode provides
     * (or just indent the same as the line before).
     */
    smartIndent?: boolean;

    /**
     * Configures whether the editor should re-indent the current line when a
     * character is typed that might change its proper indentation
     * (only works if the mode supports indentation).
     */
    electricChars?: boolean;

    /**
     * Configures the keymap to use. The default is "default", which is the
     * only keymap defined in Monaco.js itself.
     * Extra keymaps are found in the Monaco keymap directory.
     */
    keyMap?: string;

    /**
     * Can be used to specify extra keybindings for the editor, alongside the
     * ones defined by keyMap. Should be either null, or a valid keymap value.
     */
    extraKeys?: any;

    /**
     * Can be used to add extra gutters (beyond or instead of the line number
     * gutter).
     * Should be an array of CSS class names, each of which defines a width
     * (and optionally a background),
     * and which will be used to draw the background of the gutters.
     * May include the Monaco-linenumbers class, in order to explicitly
     * set the position of the line number gutter
     * (it will default to be to the right of all other gutters).
     * These class names are the keys passed to setGutterMarker.
     */
    gutters?: string[];

    /**
     * Determines whether the gutter scrolls along with the content
     * horizontally (false)
     * or whether it stays fixed during horizontal scrolling (true,
     * the default).
     */
    fixedGutter?: boolean;

    /**
     * Whether the cursor should be drawn when a selection is active.
     */
    showCursorWhenSelecting?: boolean;

    /**
     * When fixedGutter is on, and there is a horizontal scrollbar, by default
     * the gutter will be visible to the left of this scrollbar. If this
     * option is set to true, it will be covered by an element with class
     * Monaco-gutter-filler.
     */
    coverGutterNextToScrollbar?: boolean;

    /**
     * Controls whether drag-and-drop is enabled.
     */
    dragDrop?: boolean;

    /**
     * Explicitly set the line separator for the editor.
     * By default (value null), the document will be split on CRLFs as well as
     * lone CRs and LFs, and a single LF will be used as line separator in all
     * output (such as getValue). When a specific string is given, lines will
     * only be split on that string, and output will, by default, use that
     * same separator.
     */
    lineSeparator?: string | null;

    /**
     * Chooses a scrollbar implementation. The default is "native", showing
     * native scrollbars. The core library also provides the "null" style,
     * which completely hides the scrollbars. Addons can implement additional
     * scrollbar models.
     */
    scrollbarStyle?: string;

    /**
     * When enabled, which is the default, doing copy or cut when there is no
     * selection will copy or cut the whole lines that have cursors on them.
     */
    lineWiseCopyCut?: boolean;

    /**
     * Whether to scroll past the end of the buffer.
     */
    scrollPastEnd?: boolean;
  }

  /**
   * The default configuration options for an editor.
   */
  export let defaultConfig: IConfig = {
    ...CodeEditor.defaultConfig,
    mode: "null",
    theme: "vs", // can also be vs-dark or hc-black
    smartIndent: true,
    electricChars: true,
    extraKeys: null,
    gutters: [],
    fixedGutter: true,
    showCursorWhenSelecting: false,
    coverGutterNextToScrollbar: false,
    dragDrop: true,
    lineSeparator: null,
    scrollbarStyle: "native",
    lineWiseCopyCut: true,
    scrollPastEnd: false
  };

  /**
   * Add a command to Monaco.
   *
   * @param name - The name of the command to add.
   *
   * @param command - The command function.
   */
  // export function addCommand(
  //   name: string,
  //   command: (cm: Monaco.Editor) => void
  // ) {
  //   Monaco.commands[name] = command;
  // }
}

/**
 * The namespace for module private data.
 */
namespace Private {
  export function createEditor(
    host: HTMLElement,
    model: monaco.editor.ITextModel,
    config: MonacoEditor.IConfig
  ): monaco.editor.IStandaloneCodeEditor {
    // let {
    //   autoClosingBrackets,
    //   fontFamily,
    //   fontSize,
    //   insertSpaces,
    //   lineHeight,
    //   lineWrap,
    //   wordWrapColumn,
    //   tabSize,
    //   readOnly,
    //   ...otherOptions
    // } = config;
    // let bareConfig = {
    //   autoCloseBrackets: autoClosingBrackets,
    //   indentUnit: tabSize,
    //   indentWithTabs: !insertSpaces,
    //   lineWrapping: lineWrap === 'off' ? false : true,
    //   readOnly,
    //   ...otherOptions
    // };

    return monaco.editor.create(host, { model });

    // return Monaco(el => {
    //   if (fontFamily) {
    //     el.style.fontFamily = fontFamily;
    //   }
    //   if (fontSize) {
    //     el.style.fontSize = fontSize + 'px';
    //   }
    //   if (lineHeight) {
    //     el.style.lineHeight = lineHeight.toString();
    //   }
    //   if (readOnly) {
    //     el.classList.add(READ_ONLY_CLASS);
    //   }
    //   if (lineWrap === 'wordWrapColumn') {
    //     const lines = el.querySelector('.Monaco-lines') as HTMLDivElement;
    //     lines.style.width = `${wordWrapColumn}ch`;
    //   }
    //   if (lineWrap === 'bounded') {
    //     const lines = el.querySelector('.Monaco-lines') as HTMLDivElement;
    //     lines.style.maxWidth = `${wordWrapColumn}ch`;
    //   }
    //   host.appendChild(el);
    // }, bareConfig);
  }

  // /**
  //  * Indent or insert a tab as appropriate.
  //  */
  // export function indentMoreOrinsertTab(cm: Monaco.Editor): void {
  //   let doc = cm.getDoc();
  //   let from = doc.getCursor('from');
  //   let to = doc.getCursor('to');
  //   let sel = !posEq(from, to);
  //   if (sel) {
  //     Monaco.commands['indentMore'](cm);
  //     return;
  //   }
  //   // Check for start of line.
  //   let line = doc.getLine(from.line);
  //   let before = line.slice(0, from.ch);
  //   if (/^\s*$/.test(before)) {
  //     Monaco.commands['indentMore'](cm);
  //   } else {
  //     if (cm.getOption('indentWithTabs')) {
  //       Monaco.commands['insertTab'](cm);
  //     } else {
  //       Monaco.commands['insertSoftTab'](cm);
  //     }
  //   }
  // }

  // /**
  //  * Delete spaces to the previous tab stob in a Monaco editor.
  //  */
  // export function delSpaceToPrevTabStop(cm: Monaco.Editor): void {
  //   let doc = cm.getDoc();
  //   let from = doc.getCursor('from');
  //   let to = doc.getCursor('to');
  //   let sel = !posEq(from, to);
  //   if (sel) {
  //     let ranges = doc.listSelections();
  //     for (let i = ranges.length - 1; i >= 0; i--) {
  //       let head = ranges[i].head;
  //       let anchor = ranges[i].anchor;
  //       doc.replaceRange(
  //         '',
  //         Monaco.Pos(head.line, head.ch),
  //         Monaco.Pos(anchor.line, anchor.ch)
  //       );
  //     }
  //     return;
  //   }
  //   let cur = doc.getCursor();
  //   let tabsize = cm.getOption('tabSize');
  //   let chToPrevTabStop = cur.ch - (Math.ceil(cur.ch / tabsize) - 1) * tabsize;
  //   from = { ch: cur.ch - chToPrevTabStop, line: cur.line };
  //   let select = doc.getRange(from, cur);
  //   if (select.match(/^\ +$/) !== null) {
  //     doc.replaceRange('', from, cur);
  //   } else {
  //     Monaco.commands['delCharBefore'](cm);
  //   }
  // }

  // /**
  //  * Test whether two Monaco positions are equal.
  //  */
  // export function posEq(
  //   a: Monaco.Position,
  //   b: Monaco.Position
  // ): boolean {
  //   return a.line === b.line && a.ch === b.ch;
  // }

  /**
   * Set a config option for the editor.
   */
  export function setOption<K extends keyof MonacoEditor.IConfig>(
    editor: monaco.editor.IStandaloneCodeEditor,
    option: K,
    value: MonacoEditor.IConfig[K],
    config: MonacoEditor.IConfig
  ): void {
    //   let el = editor.getWrapperElement();
    //   switch (option) {
    //     case 'lineWrap':
    //       const lineWrapping = value === 'off' ? false : true;
    //       const lines = el.querySelector('.Monaco-lines') as HTMLDivElement;
    //       const maxWidth =
    //         value === 'bounded' ? `${config.wordWrapColumn}ch` : null;
    //       const width =
    //         value === 'wordWrapColumn' ? `${config.wordWrapColumn}ch` : null;
    //       lines.style.maxWidth = maxWidth;
    //       lines.style.width = width;
    //       editor.setOption('lineWrapping', lineWrapping);
    //       break;
    //     case 'wordWrapColumn':
    //       const { lineWrap } = config;
    //       if (lineWrap === 'wordWrapColumn' || lineWrap === 'bounded') {
    //         const lines = el.querySelector('.Monaco-lines') as HTMLDivElement;
    //         const prop = lineWrap === 'wordWrapColumn' ? 'width' : 'maxWidth';
    //         lines.style[prop] = `${value}ch`;
    //       }
    //       break;
    //     case 'tabSize':
    //       editor.setOption('indentUnit', value);
    //       break;
    //     case 'insertSpaces':
    //       editor.setOption('indentWithTabs', !value);
    //       break;
    //     case 'autoClosingBrackets':
    //       editor.setOption('autoCloseBrackets', value);
    //       break;
    //     case 'readOnly':
    //       el.classList.toggle(READ_ONLY_CLASS, value);
    //       editor.setOption(option, value);
    //       break;
    //     case 'fontFamily':
    //       el.style.fontFamily = value;
    //       break;
    //     case 'fontSize':
    //       el.style.fontSize = value ? value + 'px' : null;
    //       break;
    //     case 'lineHeight':
    //       el.style.lineHeight = value ? value.toString() : null;
    //       break;
    //     default:
    //       editor.setOption(option, value);
    //       break;
    //   }
  }
}

// /**
//  * Add a Monaco command to delete until previous non blanking space
//  * character or first multiple of tabsize tabstop.
//  */
// MonacoEditor.addCommand(
//   'delSpaceToPrevTabStop',
//   Private.delSpaceToPrevTabStop
// );

// /**
//  * Add a Monaco command to indent or insert a tab as appropriate.
//  */
// MonacoEditor.addCommand(
//   'indentMoreOrinsertTab',
//   Private.indentMoreOrinsertTab
// );
