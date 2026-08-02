#!/usr/bin/env bash
# Build back + front et package le tout dans un zip pret a deployer sur Windows :
# node_modules de prod installe ici (Mac), a decompresser tel quel sur la machine cible —
# aucun npm/node install requis cote Windows, juste `node dist\main.js`.
#
# Met a jour back/package.json ("version") avant le build : c'est la valeur exposee par
# /api/version et affichee dans le front (cf. src/config.ts, src/infra/http/controllers/
# version.controller.ts).
#
# Usage: ./scripts/release.sh [version]
#   version : semver explicite (ex. 1.2.0), sinon patch bump automatique sur back/package.json

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ROOT="$ROOT_DIR/release"

echo "== Version =="
if [ "${1:-}" != "" ]; then
  VERSION=$(cd "$ROOT_DIR/back" && npm version "$1" --no-git-tag-version --allow-same-version | tr -d 'v')
else
  VERSION=$(cd "$ROOT_DIR/back" && npm version patch --no-git-tag-version | tr -d 'v')
fi
echo "back/package.json -> $VERSION"

RELEASE_NAME="lead_tracker-v$VERSION"
RELEASE_DIR="$RELEASE_ROOT/$RELEASE_NAME"

echo "== Build back =="
(cd "$ROOT_DIR/back" && npm run build)

echo "== Build front =="
(cd "$ROOT_DIR/front" && npm run build)

echo "== Staging $RELEASE_DIR =="
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/back/dist" "$RELEASE_DIR/front"

cp "$ROOT_DIR/back/dist/main.js" "$RELEASE_DIR/back/dist/main.js"
cp "$ROOT_DIR/back/package.json" "$RELEASE_DIR/back/package.json"
cp "$ROOT_DIR/back/package-lock.json" "$RELEASE_DIR/back/package-lock.json"
cp "$ROOT_DIR/back/start.bat.example" "$RELEASE_DIR/back/start.bat"
cp -R "$ROOT_DIR/front/dist/." "$RELEASE_DIR/front/dist/"

echo "== Install dependances de prod (isole du node_modules de dev) =="
(cd "$RELEASE_DIR/back" && npm ci --omit=dev)

echo "== Zip =="
(cd "$RELEASE_ROOT" && rm -f "$RELEASE_NAME.zip" && zip -rq "$RELEASE_NAME.zip" "$RELEASE_NAME")

echo ""
echo "Package pret : release/$RELEASE_NAME.zip (v$VERSION)"
echo "Sur Windows : decompresser, adapter release/back/start.bat (chemin DISTRIBUTORS_DIR), double-clic sur start.bat."
