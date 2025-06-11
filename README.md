# Custom VSCode Extension for My Workflow

## Features

- Deterministic Snippets with auto complete overload
- Open External Terminal in Current Directory
- Autocmd Integration

## Build and Install

### Build

```sh
npm install
npx vsce package 0.4.3
```

### Install

```sh
code --install-extension exrosnippets-0.4.3.vsix
```

### Using

Inside Keybinds JSON

```json
[
  {
    "key": "ctrl+l",
    "command": "exrosnippets.acceptSelectedSuggestionOrSnippet",
    "when": "editorFocus && suggestWidgetVisible"
  },
  {
    "key": "ctrl+l",
    "command": "exrosnippets.triggerSuggestOrSnippet",
    "when": "editorHasCompletionItemProvider && textInputFocus && !editorReadonly && !suggestWidgetVisible"
  }
]
```
