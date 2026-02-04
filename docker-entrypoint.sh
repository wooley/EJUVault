#!/bin/sh
set -e

INDEX_PATH="content/index/question_index.json"

if [ ! -f "$INDEX_PATH" ]; then
  echo "Content index missing. Generating..."
  node scripts/content_indexer.js
fi

exec "$@"
