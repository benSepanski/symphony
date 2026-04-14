#!/usr/bin/env bash
# SessionStart hook — runs every time Claude Code starts or resumes a session.
#
# Ensures the Elixir toolchain is on PATH, Mix deps are current, and the
# project is compiled — so the agent can run CI commands immediately.

set -euo pipefail

# Only run in cloud environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ELIXIR_DIR="$CLAUDE_PROJECT_DIR/elixir"

# Put mise bin + shims on PATH so elixir/mix/erl are reachable
MISE_BIN="$HOME/.local/bin"
MISE_SHIMS="$HOME/.local/share/mise/shims"
export PATH="$MISE_BIN:$MISE_SHIMS:$PATH"

# The sandbox uses TLS inspection; point Erlang/Hex at the system CA bundle
# so that mix deps.get / mix tasks can reach hex.pm and hex-mirror.
export HEX_CACERTS_PATH="/etc/ssl/certs/ca-certificates.crt"

# Persist both for all subsequent Bash tool calls in this session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$MISE_BIN:$MISE_SHIMS:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  echo "export HEX_CACERTS_PATH=\"/etc/ssl/certs/ca-certificates.crt\"" >> "$CLAUDE_ENV_FILE"
fi

# Run from elixir/ so mise resolves the correct Erlang/Elixir versions
cd "$ELIXIR_DIR"

# Fetch deps (idempotent — skips if already up to date)
make setup

# Compile the project so the agent can run linter/tests without waiting
make build
