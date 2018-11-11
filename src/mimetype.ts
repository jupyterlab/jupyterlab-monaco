// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IEditorMimeTypeService } from "@jupyterlab/codeeditor";

import { nbformat, PathExt } from "@jupyterlab/coreutils";
import { LanguagesManager } from "./languages";

/**
 * The mime type service for Monaco.
 */
export class MonacoMimeTypeService implements IEditorMimeTypeService {
  constructor(manager: LanguagesManager) {
    this._manager = manager;
  }

  /**
   * Returns a mime type for the given language info.
   *
   * #### Notes
   * If a mime type cannot be found returns the defaul mime type `text/plain`, never `null`.
   */
  getMimeTypeByLanguage(info: nbformat.ILanguageInfoMetadata): string {
    let ext = info.file_extension || "";
    return this._manager.findBest(
      (info.codemirror_mode as any) || {
        mimetype: info.mimetype,
        name: info.name,
        ext: [ext.split(".").slice(-1)[0]]
      }
    );
  }

  /**
   * Returns a mime type for the given file path.
   *
   * #### Notes
   * If a mime type cannot be found returns the default mime type `text/plain`, never `null`.
   */
  getMimeTypeByFilePath(path: string): string {
    const ext = PathExt.extname(path);
    if (ext === ".ipy") {
      return "text/x-python";
    }
    let language = this._manager.findLanguageForPath(path);
    return this._manager.findMimeTypeForLanguage(language);
  }

  private _manager: LanguagesManager;
}
