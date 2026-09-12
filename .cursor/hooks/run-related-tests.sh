#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.file_path // empty')

if [[ -z "$file_path" ]]; then
  exit 0
fi

AI_AGENT=1 npx vitest related "$file_path" --run
