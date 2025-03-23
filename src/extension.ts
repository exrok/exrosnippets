import * as vscode from "vscode";
import { spawn } from "child_process";

const WRAP_SNIPPETS: Record<string, Record<string, [string, string]>> = {
  rust: {
    for: ["for $0 {\n", "\n}"],
    if: ["if $0 {\n", "\n}"],
    closure: ["let $0 = || {\n", "\n};"],
  },
  typescript: {
    for: ["for ($0) {\n", "\n}"],
    if: ["if ($0) {\n", "\n}"],
    try: ["try {\n", "\n} catch (e) {\t$0\n}"],
    element: ["<$1>\n", "\n<$1/>"],
    closure: ["const $0 = () => {\n", "\n}"],
  },
};
const SNIPPETS: Record<string, Record<string, string>> = {
  rust: {
    paf: "pub async fn ${1:name}($0) {\n}\n",
    afn: "async fn ${1:name}($0) {\n}\n",
    f: "for $0 {\n}",
    "@f": "@for $0 {\n}",
    "@i": "@if $0 {\n}",
    l: 'println!("{}", $0);',
    md: "impl Default for $1 {\nfn default() -> $1 {\n$0\n}\n}",
    mn: "impl $1 {\nfn new($0) -> $1 {\n}\n}",
    m: "match $1 {\n}",
    im: "impl $1 {\nfn $2($0) {\n}\n}",
    s: "struct $1 {\n}",
    i: "if $1 {\n}",
    il: "if let $1 = $2 {\n}",
    "}": "} else {\n\t$0\n}",
    "}i": "} else if $1 {\n}",
    fn: "fn ${1:name}($0) {\n}\n",
    pf: "pub fn ${1:name}($0) {\n}\n",
    ps: "pub struct ${1:name} {\n}\n",
  },
  typescript: {
    fi: "for (let ${1:i} = 0; $1 < $0; $1++) {\n}",
    fo: "for (const ${1:value} of $0) {\n}",
    l: "console.log($0);",
    i: "if ($0) {\n}",
    m: "switch ($1) {\n\tcase $0:\n}",
    s: "interface $0 {\n}",
    ps: "export interface $0 {\n}",
    fn: "const $1 = ($0) => {\n}",
    af: "const $1 = async ($0) => {\n}",
    pf: "export const $1 = ($0) => {\n}",
    paf: "export const $1 = async ($0) => {\n}",
    "}": "} else {\n\t$0\n}",
    "}i": "} else if ($1) {\n}",
  },
  css: {
    bg: "background: $0;",
    fdc: "flex-direction: column;",
    dib: "display: inline-block;",
    di: "display: inline;",
    db: "display: block;",
    c: "color: $0;",
    bgi: "background-image: $0;",
    l: "left: $0;",
    r: "right: $0;",
    u: "up: $0;",
    d: "down: $0;",
    pa: "position: absolute;",
    pf: "position: fixed;",
    pr: "position: relative;",
    df: "display: flex;",
    f: "flex: $0;",
    ft: "font: $0;",
    fts: "font-size: $0;",
    fs: "font-style: $0;",
    fsi: "font-style: italic;",
    fwb: "font-style: bold;",
    fdr: "flex-direction: row;",
    mh: "min-height: $0;",
    mh0: "min-height: 0;",
    mw0: "min-width: 0;",
    mw: "min-width: $0;",
    xh: "max-height: $0;",
    xh0: "max-height: 0;",
    xw0: "max-width: 0;",
    xw: "max-width: $0;",
    mt: "margin-top: $0;",
    mb: "margin-bottom: $0;",
    ml: "margin-left: $0;",
    mr: "margin-right: $0;",
    pt: "padding-top: $0;",
    pb: "padding-bottom: $0;",
    pl: "padding-left: $0;",
    bsb: "box-sizing: border-box;",
    jc: "justify-content: $0;",
    jcc: "justify-content: center;",
    aic: "align-items: center;",
    ai: "align-items: $0;",
    tdn: "text-decoration: none;",
    p: "padding: $0;",
    p0: "padding: 0;",
    m0: "margin: 0;",
    m: "margin: $0;",
    w: "width: $0;",
    h: "height: $0;",
    w1: "width: 100%;",
    h1: "height: 100%;",
  },
};

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
  if (prefix.length > 3) {
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

export function activate(context: vscode.ExtensionContext) {
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
export function deactivate() {}
