#!/usr/bin/env bash
# Cloud environment setup script for Symphony.
#
# Paste this into the "Setup script" field of your Claude Code cloud environment.
# It runs BEFORE Claude Code starts, on new sessions only.
#
# What it does:
#   1. Installs mise to ~/.local/bin via https://mise.run
#   2. Uses mise to install Erlang 28 + Elixir 1.19.5-otp-28 (matches elixir/mise.toml)
#   3. Persists the mise shims PATH to /etc/environment (root) or ~/.bashrc + ~/.profile (non-root)
#   4. Runs `make setup` (mix setup) so deps are ready on first session start
#
# Network requirements: github.com + builds.hex.pm must be reachable.
# The default "Trusted" network level in Claude cloud environments satisfies this.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ELIXIR_DIR="$REPO_ROOT/elixir"

echo "==> Installing mise..."
curl -fsSL https://mise.run | sh
export PATH="$HOME/.local/bin:$PATH"

echo "==> mise $(mise --version) installed"

echo "==> Installing Erlang + Elixir via mise (reads elixir/mise.toml)..."
cd "$ELIXIR_DIR"
mise trust --yes
mise install

# Activate mise shims for this script
eval "$(mise activate bash --shims)"

# Persist the shims PATH so Claude's Bash tool sessions can find elixir/mix.
# Try /etc/environment first (works when running as root); fall back to user profile files.
MISE_SHIMS="$HOME/.local/share/mise/shims"
MISE_BIN="$HOME/.local/bin"
PATH_LINE="export PATH=\"$MISE_BIN:$MISE_SHIMS:\$PATH\""
if [ -w /etc/environment ] || [ "$(id -u)" = "0" ]; then
  echo "PATH=\"$MISE_BIN:$MISE_SHIMS:$(printenv PATH)\"" >> /etc/environment
else
  for rc in "$HOME/.bashrc" "$HOME/.profile"; do
    grep -qxF "$PATH_LINE" "$rc" 2>/dev/null || echo "$PATH_LINE" >> "$rc"
  done
fi

echo "==> Elixir $(elixir --version 2>&1 | head -1) ready"

echo "==> Fetching Mix dependencies..."
# The sandbox proxies HTTPS via TLS inspection; point Erlang/Hex at the system
# CA bundle (which trusts the proxy CA) so mix deps.get can reach hex.pm.
export HEX_CACERTS_PATH="/etc/ssl/certs/ca-certificates.crt"
make setup

echo "==> Cloud setup complete. Run 'make all' to validate CI."
