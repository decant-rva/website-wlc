#!/bin/sh
# Deploys the current commit.  Usage: tools/deploy.sh [staging|production]
set -eu
target="${1:-staging}"
# fly deploy builds the working tree, so refuse one that differs from the commit /health will report.
if [ -n "$(git status --porcelain)" ]; then
  echo "deploy: commit or stash your changes first; the image would not match $(git rev-parse --short HEAD)" >&2
  exit 1
fi
sha="$(git rev-parse --short HEAD)"
case "$target" in
  # PUBLIC_STAGING=1 also writes noindex into every page, on top of the header the server adds.
  staging)    fly deploy --config fly.staging.toml --build-arg BUILD_SHA="$sha" --build-arg PUBLIC_STAGING=1 ;;
  production) fly deploy --config fly.toml --build-arg BUILD_SHA="$sha" ;;
  *) echo "usage: tools/deploy.sh [staging|production]" >&2; exit 2 ;;
esac
