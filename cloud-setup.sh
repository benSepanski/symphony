#!/usr/bin/env bash
# Cloud environment setup script for Symphony.
#
# Paste this into the "Setup script" field of your Claude Code cloud environment.
# It runs BEFORE Claude Code starts, on new sessions only.
#
# What it does:
#   1. Installs mise prereqs
#   2. Installs mise (PPA on Ubuntu 26.04+, GitHub binary otherwise)
#   3. Uses mise to install Node 22 (matches mise.toml at repo root)
#   4. Enables corepack so `pnpm` resolves to the version pinned in package.json
#   5. Persists the mise shims PATH for non-interactive shells
#
# Network requirements: github.com must be reachable.

set -euo pipefail

SUDO=""
if [ "$(id -u)" != "0" ]; then SUDO="sudo"; fi

export PATH="$HOME/.local/bin:$PATH"

echo "==> Installing system packages..."
$SUDO apt-get update
$SUDO apt-get install -y \
  gpg curl ca-certificates \
  unzip python3-apt locales

# apt_pkg is compiled for cpython-312; force python3 -> 3.12 so
# add-apt-repository works.
if /usr/bin/python3.12 --version &>/dev/null; then
  $SUDO update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 100
  $SUDO update-alternatives --set python3 /usr/bin/python3.12
fi

$SUDO locale-gen en_US.UTF-8
$SUDO update-locale LANG=en_US.UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "==> Installing mise..."
UBUNTU_VERSION=$(. /etc/os-release && echo "${VERSION_ID}")
UBUNTU_MAJOR=$(echo "$UBUNTU_VERSION" | cut -d. -f1)

if [ "$UBUNTU_MAJOR" -ge 26 ]; then
  echo "==> Ubuntu ${UBUNTU_VERSION}: using PPA..."
  $SUDO add-apt-repository -y ppa:jdxcode/mise
  $SUDO apt-get update -y
  $SUDO apt-get install -y mise
else
  echo "==> Ubuntu ${UBUNTU_VERSION}: downloading mise binary from GitHub..."
  MISE_VERSION=$(curl -fsSL "https://api.github.com/repos/jdx/mise/releases/latest" \
    | grep -o '"tag_name": *"[^"]*"' | grep -o 'v[^"]*')
  curl -fsSL -o /tmp/mise.tar.gz \
    "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-x64.tar.gz"
  tar -xzf /tmp/mise.tar.gz -C /tmp
  $SUDO install -m 755 /tmp/mise/bin/mise /usr/local/bin/mise
  rm -rf /tmp/mise.tar.gz /tmp/mise
fi

echo "==> mise $(mise --version) installed"

echo "==> Installing Node 22..."
mise use --global node@22

eval "$(mise activate bash --shims)"

MISE_SHIMS="$HOME/.local/share/mise/shims"
MISE_BIN="$HOME/.local/bin"
PATH_LINE="export PATH=\"$MISE_BIN:$MISE_SHIMS:\$PATH\""

for rc in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.bash_env"; do
  grep -qxF "$PATH_LINE" "$rc" 2>/dev/null || echo "$PATH_LINE" >> "$rc"
done

if [ "$(id -u)" = "0" ]; then
  echo "PATH=\"$MISE_BIN:$MISE_SHIMS:$(printenv PATH)\"" >> /etc/environment
  echo "BASH_ENV=$HOME/.bash_env" >> /etc/environment
fi

# corepack ships with Node 22 and resolves the pnpm version pinned in package.json.
corepack enable

echo "==> Node $(node --version) ready (pnpm via corepack)"
