#!/usr/bin/env sh
set -eu

COMMAND_NAME="${COMMAND_NAME:-rp}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TARGET="$ROOT_DIR/dist/cli.js"

path_has_dir() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

pick_bin_dir() {
  if [ -n "${INSTALL_BIN_DIR:-}" ]; then
    printf '%s\n' "$INSTALL_BIN_DIR"
    return
  fi

  if path_has_dir "$HOME/.local/bin"; then
    printf '%s\n' "$HOME/.local/bin"
    return
  fi

  if path_has_dir "$HOME/bin"; then
    printf '%s\n' "$HOME/bin"
    return
  fi

  printf '%s\n' "$HOME/.local/bin"
}

if ! command -v pnpm >/dev/null 2>&1; then
  printf 'pnpm is required but was not found on PATH.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"
pnpm install
pnpm run postinstall
pnpm build

BIN_DIR="$(pick_bin_dir)"
mkdir -p "$BIN_DIR"
ln -sf "$TARGET" "$BIN_DIR/$COMMAND_NAME"

if ! path_has_dir "$BIN_DIR"; then
  printf 'Installed %s to %s, but that directory is not on PATH.\n' "$COMMAND_NAME" "$BIN_DIR"
  printf 'Add this to your shell profile: export PATH="%s:$PATH"\n' "$BIN_DIR"
else
  printf 'Installed %s to %s/%s\n' "$COMMAND_NAME" "$BIN_DIR" "$COMMAND_NAME"
fi
