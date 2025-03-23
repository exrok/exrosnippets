import * as vscode from "vscode";
import { spawn } from "child_process";

let WRAP_SNIPPETS: Record<string, Record<string, [string, string]>> = {};
let SNIPPETS: Record<string, Record<string, string>> = {}
let MAX_SNIPPET: number = 0
let CSS_IN_TS: boolean = false;

function cssPropertyCount(inx: string): number {
  const s = inx.toString(); //JIT optimization
  let i = 0,
    count = 0;
  while ((i = s.indexOf(":", i)) >= 0) {
    i++;
    if ((i = s.indexOf(";", i)) >= 0) {
      i++;
    } else {
      break;
    }
    if ((i = s.indexOf("\n", i)) >= 0) {
      count++;
      i++;
    } else {
      break;
    }
  }
  return count;
}
function equalCount(inx: string): number {
  const s = inx.toString(); //JIT optimization
  let i = 0,
    count = 0;
  while ((i = s.indexOf("= ", i)) >= 0) {
    i++;
  }
  return count;
}

function inCSS(editor: vscode.TextEditor): boolean {
  // Disable the inCSS check because jank
  if (!CSS_IN_TS) {
    return false;
  }

  const cursorPosition = editor.selection.active; // a vscode.Position
  const line_start = cursorPosition.line < 100 ? 0 : cursorPosition.line - 100;
  const text_before = editor.document.getText(
    new vscode.Range(
      line_start,
      0,
      cursorPosition.line,
      cursorPosition.character
    )
  );
  let start = text_before.lastIndexOf("`");
  if (start !== -1) {
    let v = text_before.lastIndexOf("styled", start - 1);
    if (v !== -1) {
      if (v - start > 15) {
        return false;
      }
      if (text_before.indexOf("`", v + 6) !== start) {
        // ` Hack not to detect CSS file.
        return false;
      }
      return true;
    }
    return false;
  }

  if (line_start === 0) {
    return false;
  }

  if (equalCount(text_before) > 2) {
    return false;
  }

  return cssPropertyCount(text_before) > 45;
}
function tryExpandSnippet(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return false;
  }
  const cursorPosition = editor.selection.active; // a vscode.Position

  const text_before = editor.document.getText(
    new vscode.Range(
      cursorPosition.line,
      0,
      cursorPosition.line,
      cursorPosition.character
    )
  );
  const prefix = text_before.trimStart();
  if (prefix.length > MAX_SNIPPET) {
    return false;
  }
  /// get current programming language
  let lang = editor.document.languageId;
  if (lang === "typescript") {
    if (inCSS(editor)) {
      lang = "css";
    }
  }
  if (lang === "typescriptreact") {
    lang = "typescript";
  }

  const snippets = SNIPPETS[lang];
  if (snippets === undefined) {
    vscode.commands.executeCommand("editor.action.triggerSuggest");
    return false;
  }
  const snippet = snippets[prefix];
  if (snippet === undefined) {
    vscode.commands.executeCommand("editor.action.triggerSuggest");
    return false;
  }
  editor
    .edit(
      (editBuilder) => {
        editBuilder.delete(
          new vscode.Range(
            cursorPosition.line,
            cursorPosition.character - prefix.length,
            cursorPosition.line,
            cursorPosition.character
          )
        );
      },
      { undoStopAfter: false, undoStopBefore: false }
    )
    .then(() => {
      vscode.commands.executeCommand(
        "editor.action.insertSnippet",
        {
          snippet,
        },
        { undoStopAfter: false, undoStopBefore: false }
      );
    });

  return true;
}

function setGlobalSnippets(snippets: Record<string, Record<string, string>>) {
  SNIPPETS = snippets;
  MAX_SNIPPET = 0;
  for (const lang in snippets) {
    const snippetSet = snippets[lang];
    for (const key in snippetSet) {
      if (MAX_SNIPPET < key.length) {
        MAX_SNIPPET = key.length;
      }
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('exrosnippets');
  setGlobalSnippets(config.get('snippets') as any)
  WRAP_SNIPPETS = config.get('wrap_snippets') as any;

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('exrosnippets.snippets')) {
      const config = vscode.workspace.getConfiguration('exrosnippets');
      SNIPPETS = config.get('snippets') as any;
      setGlobalSnippets(config.get('snippets') as any);
    }
    if (e.affectsConfiguration('exrosnippets.wrap_snippets')) {
      const config = vscode.workspace.getConfiguration('exrosnippets');
      WRAP_SNIPPETS = config.get('wrap_snippets') as any;
    }
    CSS_IN_TS = config.get('css_in_ts') as boolean;
  });

  let openTerminal = vscode.commands.registerCommand(
    "exrosnippets.term",
    () => {
      // get file path of current file
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const filePath = editor.document.fileName;

      const parentDir = filePath.split("/").slice(0, -1).join("/");

      editor.document.save().then(() => {
        spawn("urxvtc", ["-cd", parentDir, "-e", "fish"]);
      });
    }
  );
  let tcmdEdit = vscode.commands.registerCommand(
    "exrosnippets.tcmdEdit",
    () => {
      // get file path of current file
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const filePath = editor.document.fileName;

      const proc = spawn("tcmd", ["--from", filePath, "get", "path"]);
      let tcmdPath = "";
      proc.stdout.on("data", (data) => {
        tcmdPath += data;
      });

      proc.on("exit", (code) => {
        if (code === 0) {
          vscode.workspace.openTextDocument(tcmdPath.trim()).then((doc) => {
            vscode.window.showTextDocument(doc);
          });
        }
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!folder) {
          vscode.window.showErrorMessage(
            "Unable to find tcmd file nor workspace root"
          );
          return;
        }
        vscode.window.showInformationMessage(
          "No tcmd file found creating new one."
        );
        const joinedPath = vscode.Uri.joinPath(folder.uri, "./tcmd.sh");
        const wsedit = new vscode.WorkspaceEdit();
        wsedit.createFile(joinedPath, {
          ignoreIfExists: true,
          contents: Buffer.from("#!/bin/sh\n\n##> run\n"),
        });
        vscode.workspace.applyEdit(wsedit).then(() => {
          vscode.workspace.openTextDocument(joinedPath).then((doc) => {
            vscode.window.showTextDocument(doc);
          });
        });
      });
    }
  );
  let tcmd = vscode.commands.registerCommand("exrosnippets.tcmd", () => {
    // get file path of current file
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const filePath = editor.document.fileName;
    // save file
    editor.document.save().then(() => {
      spawn("tcmd", ["--from", filePath, "do", "--tmux"]);
    });
  });
  let tcmdOpen = vscode.commands.registerCommand(
    "exrosnippets.tcmdOpen",
    () => {
      // get file path of current file
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const filePath = editor.document.fileName;
      // save file
      editor.document.save().then(() => {
        spawn("tcmd", ["--from", filePath, "view"]);
      });
    }
  );

  let smartComplete2 = vscode.commands.registerCommand(
    "exrosnippets.acceptSelectedSuggestionOrSnippet",
    () => {
      if (tryExpandSnippet()) {
        return;
      } else {
        vscode.commands.executeCommand("acceptSelectedSuggestion");
      }
    }
  );

  let smartComplete = vscode.commands.registerCommand(
    "exrosnippets.triggerSuggestOrSnippet",
    () => {
      if (tryExpandSnippet()) {
        return;
      } else {
        vscode.commands.executeCommand("editor.action.triggerSuggest");
      }
    }
  );
  let surround_with = vscode.commands.registerCommand(
    "exrosnippets.surroundWith",
    (context) => {
      const snippet = context["snippet"] ?? "if";
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      let lang = editor.document.languageId;
      if (lang === "typescriptreact") {
        lang = "typescript";
      }
      const parts = WRAP_SNIPPETS[lang][snippet];
      const selection = editor.selection;
      if (selection && !selection.isEmpty) {
        const selectionRange = new vscode.Range(
          selection.start.line,
          selection.start.character,
          selection.end.line,
          selection.end.character
        );
        const line = editor.document.lineAt(selection.start.line);
        const initial_indent = line.text.match(/^\s*/)?.[0] ?? "";

        const highlighted = editor.document.getText(selectionRange);

        let collection = "";
        for (const line of highlighted.split("\n")) {
          if (line.startsWith(initial_indent)) {
            collection += "\t" + line.slice(initial_indent.length) + "\n";
          } else {
            collection += line + "\n";
          }
        }
        collection = collection.trimEnd();

        vscode.commands
          .executeCommand("vim.remap", { after: ["esc", "i"] })
          .then(() => {
            setTimeout(() => {
              editor
                .edit((editBuilder) => {
                  editBuilder.delete(selectionRange);
                  editBuilder.insert(selection.start, initial_indent);
                })
                .then(() => {
                  vscode.commands
                    .executeCommand("editor.action.insertSnippet", {
                      snippet:
                        parts[0] + collection.replaceAll("$", "\\$") + parts[1],
                    })
                    .then(() => {
                      // vscode.commands.executeCommand("editor.action.format");
                    });
                });
            }, 8);
          });
      }
    }
  );

  context.subscriptions.push(surround_with);
  context.subscriptions.push(openTerminal);
  context.subscriptions.push(tcmd);
  context.subscriptions.push(tcmdOpen);
  context.subscriptions.push(tcmdEdit);
  context.subscriptions.push(smartComplete);
  context.subscriptions.push(smartComplete2);
}

// This method is called when your extension is deactivated
export function deactivate() { }
