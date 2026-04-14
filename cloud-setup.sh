#!/usr/bin/env bash
# Cloud environment setup script for Symphony.
#
# Paste this into the "Setup script" field of your Claude Code cloud environment.
# It runs BEFORE Claude Code starts, on new sessions only.
#
# What it does:
#   1. Installs build deps for Erlang + mise prereqs
#   2. Installs mise (via PPA on Ubuntu 26.04+, GitHub binary on older versions)
#   3. Uses mise to install Erlang 28 + Elixir 1.19.5-otp-28
#   4. Persists the mise shims PATH for non-interactive shells
#
# Network requirements: github.com must be reachable.

set -euo pipefail

SUDO=""
if [ "$(id -u)" != "0" ]; then SUDO="sudo"; fi

export PATH="$HOME/.local/bin:$PATH"

# 1. Install build deps for Erlang + mise prereqs
echo "==> Installing system packages..."
$SUDO apt-get update
$SUDO apt-get install -y \
  gpg curl ca-certificates \
  build-essential autoconf m4 \
  libssl-dev libncurses-dev \
  unzip python3-apt locales

# Fix: apt_pkg is compiled for cpython-312, but python3 may default to an older
# version, breaking add-apt-repository. Force python3 -> 3.12.
if /usr/bin/python3.12 --version &>/dev/null; then
  $SUDO update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 100
  $SUDO update-alternatives --set python3 /usr/bin/python3.12
fi

# Fix: Erlang VM warns and may malfunction if locale is not UTF-8.
$SUDO locale-gen en_US.UTF-8
$SUDO update-locale LANG=en_US.UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 2. Install mise
# The PPA (ppa:jdxcode/mise) only works on Ubuntu 26.04+. For older versions,
# download the binary directly from GitHub.
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

# 3. Install Erlang + Elixir
# MISE_ELIXIR_GITHUB_RELEASES=true bypasses builds.hex.pm, which intermittently
# returns 503. GitHub releases are the reliable fallback.
echo "==> Installing Erlang 28 + Elixir 1.19.5-otp-28 (this takes a while)..."
mise use --global erlang@28
MISE_ELIXIR_GITHUB_RELEASES=true mise use --global elixir@1.19.5-otp-28

eval "$(mise activate bash --shims)"

# 4. Persist PATH for non-interactive shells
MISE_SHIMS="$HOME/.local/share/mise/shims"
MISE_BIN="$HOME/.local/bin"
PATH_LINE="export PATH=\"$MISE_BIN:$MISE_SHIMS:\$PATH\""

# .bashrc for interactive shells; .bash_env for non-interactive bash -c calls
# (sourced via BASH_ENV).
for rc in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.bash_env"; do
  grep -qxF "$PATH_LINE" "$rc" 2>/dev/null || echo "$PATH_LINE" >> "$rc"
done

if [ "$(id -u)" = "0" ]; then
  echo "PATH=\"$MISE_BIN:$MISE_SHIMS:$(printenv PATH)\"" >> /etc/environment
  echo "BASH_ENV=$HOME/.bash_env" >> /etc/environment
fi

echo "==> Elixir $(elixir --version 2>&1 | tail -1) ready"
