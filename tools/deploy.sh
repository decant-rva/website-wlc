#!/bin/sh
# Deploys the current commit.  Usage: tools/deploy.sh [staging|production]
set -eu
target="${1:-staging}"
sha="$(git rev-parse --short HEAD)"
case "$target" in
  staging)    fly deploy --config fly.staging.toml --build-arg BUILD_SHA="$sha" ;;
  production) fly deploy --config fly.toml --build-arg BUILD_SHA="$sha" ;;
  *) echo "usage: tools/deploy.sh [staging|production]" >&2; exit 2 ;;
esac
