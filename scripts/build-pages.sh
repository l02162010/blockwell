#!/usr/bin/env bash
# Builds the GitHub Pages site: the landing page at BASE, the docs at BASE/docs/ and the playground at BASE/playground/.
set -euo pipefail
BASE="${BASE:-/blockwell/}"
cd "$(dirname "$0")/.."
BASE="$BASE" pnpm --filter ./apps/site build
BASE="${BASE}playground/" pnpm --filter ./apps/playground build
BASE="${BASE}docs/" pnpm --filter ./apps/docs build
rm -rf site-dist
cp -r apps/site/dist site-dist
cp -r apps/playground/dist site-dist/playground
cp -r apps/docs/.vitepress/dist site-dist/docs
touch site-dist/.nojekyll
echo "Built site-dist/ for base $BASE"
