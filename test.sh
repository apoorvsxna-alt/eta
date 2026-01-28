#!/bin/bash
set -e

case "$1" in
  base)
    pnpm vitest run test/compile-string.spec.ts test/compile.spec.ts test/config.spec.ts test/err.spec.ts test/file-handling.spec.ts test/parse.spec.ts test/plugins.spec.ts test/render.spec.ts test/storage.spec.ts test/utils.spec.ts
    ;;
  new)
    pnpm vitest run test/inline-includes.spec.ts
    ;;
  *)
    echo "Usage: ./test.sh {base|new}"
    exit 1
    ;;
esac