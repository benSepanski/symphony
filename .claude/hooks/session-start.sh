#!/usr/bin/env bash
# SessionStart hook — runs every time Claude Code starts or resumes a session.
#
# Ensures the Elixir toolchain is on PATH and Mix deps are current.

set -euo pipefail

# Only run in cloud environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ELIXIR_DIR="$CLAUDE_PROJECT_DIR/elixir"

# Activate mise shims so mix/elixir/erl are on PATH
MISE_SHIMS="$HOME/.local/share/mise/shims"
if [ -d "$MISE_SHIMS" ]; then
  export PATH="$MISE_SHIMS:$PATH"
fi

# Persist PATH for all subsequent Bash tool calls in this session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$MISE_SHIMS:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

cd "$ELIXIR_DIR"

# Ensure deps are fresh (idempotent — only fetches if needed)
make setup
