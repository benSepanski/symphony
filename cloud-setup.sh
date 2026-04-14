#!/usr/bin/env bash
# Cloud environment setup script for Symphony.
#
# Paste this into the "Setup script" field of your Claude Code cloud environment.
# It runs BEFORE Claude Code starts, on new sessions only.
#
# What it does:
#   1. Downloads mise from GitHub and installs it to /usr/local/bin
#   2. Uses mise to install Erlang 28 + Elixir 1.19.5-otp-28 (matches elixir/mise.toml)
#   3. Runs `make setup` (mix deps.get) so deps are ready on first session start
#
# Network requirements: github.com + builds.hex.pm must be reachable.
# The default "Trusted" network level in Claude cloud environments satisfies this.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
ELIXIR_DIR="$REPO_ROOT/elixir"

echo "==> Installing mise..."
MISE_VERSION="$(curl -fsSL https://api.github.com/repos/jdx/mise/releases/latest \
  | grep '"tag_name"' | cut -d'"' -f4)"
curl -fsSLo /usr/local/bin/mise \
  "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-x64"
chmod +x /usr/local/bin/mise

# Make mise available in PATH for this script and subshells
export PATH="/usr/local/bin:$PATH"
echo 'export PATH="/usr/local/bin:$PATH"' >> /etc/environment

echo "==> mise $(mise --version) installed"

echo "==> Installing Erlang + Elixir via mise (reads elixir/mise.toml)..."
cd "$ELIXIR_DIR"
mise trust
mise install

# mise installs tools to ~/.local/share/mise/shims by default; activate shims
eval "$(mise activate bash --shims)"
# Persist the shims path so Claude's Bash tool can find elixir/mix
SHIMS_DIR="$(mise where erlang 2>/dev/null | head -1 || true)"
MISE_SHIMS="$HOME/.local/share/mise/shims"
if [ -d "$MISE_SHIMS" ]; then
  echo "export PATH=\"$MISE_SHIMS:\$PATH\"" >> /etc/environment
fi

echo "==> Elixir $(elixir --version 2>&1 | head -1) ready"

echo "==> Fetching Mix dependencies..."
make setup

echo "==> Cloud setup complete. Run 'make all' to validate CI."
