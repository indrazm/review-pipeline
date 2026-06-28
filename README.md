# review-pipeline

`review-pipeline` is a local terminal UI for running review workflows from the
current project directory. The CLI is installed as `rp`.

The app is built with pnpm, TypeScript, React, Ink, Anvia, Lexa-aware review
instructions, and node-pty.

## Current Behavior

When you run `rp`, it opens a full-screen terminal app with three modes:

- Review
- Review and Fix
- Full pipeline

After choosing a mode, choose the diff scope:

- Current changes
- Current branch against main
- Staged changes

Selecting a scope opens a pipeline screen. The current pipeline implementation:

1. Loads the selected git diff scope for the directory where `rp` was started.
2. Shows a `Loading Diff` state.
3. Skips review when the selected scope has no changes.
4. Passes non-empty git diffs to the review agent.
5. Instructs the agent to use Lexa for codebase context when available.
6. Shows a `Reviewing ...` state while the agent runs.
7. Shows raw review output for the `Review` mode.
8. Runs a fixing agent for `Review and Fix` and `Full pipeline` when review
   findings need fixes.
9. Runs lint, typecheck, tests, and build through a lint agent for
   `Full pipeline`.
10. Runs a PR agent for `Full pipeline` when lint verification passes.
11. Gives agents two PTY tools: `execCommand` and `writeStdin`.
12. Marks the run as `Completed.`

The diff line-count summary and review result summary are logged after the
terminal UI exits.

## Environment

Create a local `.env` file:

```sh
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="http://localhost:20128/v1"
OPENAI_MODEL="cx/gpt-5.5"
```

The CLI defaults to `cx/gpt-5.5` when `OPENAI_MODEL` is not set.

The `.env` file is ignored by git.

## Requirements

- Node.js 22 or newer
- pnpm 11
- git
- Lexa, optional but recommended for richer review context

## Install

Install dependencies and link the CLI globally:

```sh
./install.sh
```

The installer runs `pnpm install`, builds the app, and symlinks `rp` into a user
bin directory. It prefers `~/.local/bin` or `~/bin` when either directory is on
your `PATH`.

To choose the install location:

```sh
INSTALL_BIN_DIR="$HOME/bin" ./install.sh
```

Then run:

```sh
rp
```

## Development

Install dependencies:

```sh
pnpm install
```

Run the CLI from source through a build:

```sh
pnpm dev
```

Build:

```sh
pnpm build
```

Typecheck:

```sh
pnpm typecheck
```

Run the compiled CLI:

```sh
pnpm start
```

## Project Structure

```text
src/
  app/                    App shell and global key handling
  components/             Shared Ink UI components
  features/agent/         Anvia review agent and node-pty tools
  features/diff-scope/    Diff scope choices
  features/git-diff/      Git diff loading and stats parsing
  features/main-menu/     Main menu UI and navigation
  features/pipeline/      Pipeline runner and pipeline screen
  lib/                    Shared terminal and logging utilities
```

## Keyboard

On the menu screen:

- `Up` / `Down` or `k` / `j` moves selection
- `1`, `2`, `3` chooses a mode directly
- `Enter` starts the selected mode
- `q`, `Esc`, or `Ctrl-C` exits

On the pipeline screen:

- `q`, `Esc`, or `Ctrl-C` exits
