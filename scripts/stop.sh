#!/usr/bin/env bash
set -euo pipefail
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:8000 | xargs -r kill
else
  echo "lsof is not available; skipping stop"
fi
