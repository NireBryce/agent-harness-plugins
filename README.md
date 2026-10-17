# agent-harness-plugins

Plugins (mods) for Claude Code's function-hooks plugin API.

## Plugins

### file-browser

A side pane that browses the files in the session's working directory.

- `/files` opens the pane.
- Tap a folder to go into it, **↑ Up** to go back (never above the working directory).
- Tap a file to preview it with syntax highlighting; **← Back** returns to the listing.
  Binary files and files over 4 MiB show a note instead; long files show their first 60,000 characters.
- `.git` is never listed; dotfiles are hidden until **Show dotfiles**.
- The listing redraws after Write, Edit and Bash tool calls, and on **Refresh**.

Draws only elements every surface has, so it works in the mobile app as well as the
desktop app and the terminal.

## Install

At the prompt of a terminal session:

```
/plugin install file-browser --marketplace NireBryce/agent-harness-plugins
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install file-browser --marketplace NireBryce/agent-harness-plugins
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then
Plugins, Add marketplace with `NireBryce/agent-harness-plugins`, then Add plugin.

## Developing

```
claude plugin validate plugins/file-browser
claude plugin test plugins/file-browser
```
