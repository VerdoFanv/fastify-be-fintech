#!/bin/sh
set -e
# Prefer local prisma CLI (kept in image after prune); avoid npx pulling prisma@latest
if [ -f ./node_modules/prisma/build/index.js ]; then
  node ./node_modules/prisma/build/index.js migrate deploy
else
  echo "WARN: prisma CLI missing in image; skipping migrate deploy"
fi
exec node dist/server.js
