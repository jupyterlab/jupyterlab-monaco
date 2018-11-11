// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IEditorServices } from "@jupyterlab/codeeditor";

import { MonacoEditorFactory } from "./factory";

import { MonacoMimeTypeService } from "./mimetype";

import "../style/index.css";

export * from "./editor";
export * from "./factory";
export * from "./mimetype";

import { Menu } from "@phosphor/widgets";

import { JupyterLab, JupyterLabPlugin } from "@jupyterlab/application";

import { IMainMenu, IEditMenu } from "@jupyterlab/mainmenu";

import { ISettingRegistry } from "@jupyterlab/coreutils";

import { IDocumentWidget } from "@jupyterlab/docregistry";

import { IEditorTracker, FileEditor } from "@jupyterlab/fileeditor";
import { LanguagesManager } from "./languages";
import { MonacoEditor } from "./editor";
import { JSONObject } from "@phosphor/coreutils";

/**
 * The command IDs used by the monaco plugin.
 */
namespace CommandIDs {
  export const changeTheme = "monaco:change-theme";

  export const changeMode = "monaco:change-mode";

  export const find = "monaco:find";

  export const findAndReplace = "monaco:find-and-replace";
}

/**
 * The default language manager
 */
const manager = new LanguagesManager();

/**
 * The editor services.
 */
const services: JupyterLabPlugin<IEditorServices> = {
  id: 'monaco-extension:services',
  provides: IEditorServices,
  activate: activateEditorServices
};

/**
 * The editor commands.
 */
const commands: JupyterLabPlugin<void> = {
  id: 'monaco-extension:commands',
  requires: [IEditorTracker, IMainMenu, ISettingRegistry],
  activate: activateEditorCommands,
  autoStart: true
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [commands, services];
export default plugins;

/**
 * The plugin ID used as the key in the setting registry.
 */
const id = commands.id;

/**
 * Set up the editor services.
 */
function activateEditorServices(app: JupyterLab): IEditorServices {  
  // TODO
  // monaco.prototype.save = () => {
  //   app.commands.execute('docmanager:save');
  // };

  /**
   * The default editor services.
   */
  const editorServices: IEditorServices = {
    factoryService: new MonacoEditorFactory(manager),
    mimeTypeService: new MonacoMimeTypeService(manager)
  };

  return editorServices;
}

/**
 * Set up the editor widget menu, commands and services.
 */
function activateEditorCommands(
  app: JupyterLab,
  tracker: IEditorTracker,
  mainMenu: IMainMenu,
  settingRegistry: ISettingRegistry
): void {
  const { commands, restored } = app;
  let { theme } = MonacoEditor.defaultConfig;
  let servers = {};

  /**
   * Update the setting values.
   */
  function updateSettings(settings: ISettingRegistry.ISettings): void {
    theme = (settings.get("theme").composite as string | null) || theme;
    servers = (settings.get("servers").composite as JSONObject | null) || servers;
    manager.languageServers = servers;
  }

  /**
   * Update the settings of the current tracker instances.
   */
  function updateTracker(): void {
    tracker.forEach(widget => {
      if (widget.content.editor instanceof MonacoEditor) {
        monaco.editor.setTheme(theme);
      }
    });
  }

  // Fetch the initial state of the settings.
  Promise.all([settingRegistry.load(id), restored])
    .then(([settings]) => {
      updateSettings(settings);
      updateTracker();
      settings.changed.connect(() => {
        updateSettings(settings);
        updateTracker();
      });
    })
    .catch((reason: Error) => {
      console.error(reason.message);
      updateTracker();
    });

  /**
   * Handle the settings of new widgets.
   */
  tracker.widgetAdded.connect((sender, widget) => {
    if (widget.content.editor instanceof MonacoEditor) {
      monaco.editor.setTheme(theme);
    }
  });

  /**
   * A test for whether the tracker has an active widget.
   */
  function isEnabled(): boolean {
    return (
      tracker.currentWidget !== null &&
      tracker.currentWidget === app.shell.currentWidget
    );
  }

  /**
   * Create a menu for the editor.
   */
  const themeMenu = new Menu({ commands });
  const modeMenu = new Menu({ commands });

  themeMenu.title.label = "Text Editor Theme";
  modeMenu.title.label = "Text Editor Syntax Highlighting";

  commands.addCommand(CommandIDs.changeTheme, {
    label: args => args["theme"] as string,
    execute: args => {
      const key = "theme";
      const value = (theme = (args["theme"] as string) || theme);

      updateTracker();
      return settingRegistry.set(id, key, value).catch((reason: Error) => {
        console.error(`Failed to set ${id}:${key} - ${reason.message}`);
      });
    },
    isToggled: args => args["theme"] === theme
  });

  commands.addCommand(CommandIDs.find, {
    label: "Find...",
    execute: () => {
      let widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      // TODO
      // let editor = widget.content.editor as MonacoEditor;
      // editor.execCommand('find');
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.findAndReplace, {
    label: "Find and Replace...",
    execute: () => {
      let widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      // TODO
      // let editor = widget.content.editor as MonacoEditor;
      // editor.execCommand('replace');
    },
    isEnabled
  });

  commands.addCommand(CommandIDs.changeMode, {
    label: args => args["id"] as string,
    execute: args => {
      let name = args["id"] as string;
      let widget = tracker.currentWidget;
      if (name && widget) {
        let mime = manager.findMimeTypeForLanguage(name);
        if (mime) {
          widget.content.model.mimeType = mime;
        }
      }
    },
    isEnabled,
    isToggled: args => {
      let widget = tracker.currentWidget;
      if (!widget) {
        return false;
      }
      let mime = widget.content.model.mimeType;
      let id = manager.findLanguageForMimeType(mime)
      return args["name"] === id;
    }
  });

  monaco.languages
    .getLanguages()
    .sort((a, b) => {
      let aName = a.id || "";
      let bName = b.id || "";
      return aName.localeCompare(bName);
    })
    .forEach(language => {
      modeMenu.addItem({
        command: CommandIDs.changeMode,
        args: {
          id: language.id
        }
      });
    });

  ["vs", "vs-dark", "hc-black"].forEach(name =>
    themeMenu.addItem({
      command: CommandIDs.changeTheme,
      args: { theme: name }
    })
  );

  // Add some of the editor settings to the settings menu.
  mainMenu.settingsMenu.addGroup(
    [{ type: "submenu" as Menu.ItemType, submenu: themeMenu }],
    10
  );

  // Add the syntax highlighting submenu to the `View` menu.
  mainMenu.viewMenu.addGroup([{ type: "submenu", submenu: modeMenu }], 40);

  // Add find-replace capabilities to the edit menu.
  mainMenu.editMenu.findReplacers.add({
    tracker,
    find: (widget: IDocumentWidget<FileEditor>) => {
      // TODO
      // let editor = widget.content.editor as MonacoEditor;
      // editor.execCommand('find');
    },
    findAndReplace: (widget: IDocumentWidget<FileEditor>) => {
      // TODO
      // let editor = widget.content.editor as MonacoEditor;
      // editor.execCommand('replace');
    }
  } as IEditMenu.IFindReplacer<IDocumentWidget<FileEditor>>);
}
