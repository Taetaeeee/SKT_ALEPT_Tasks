#!/usr/bin/env bash
set -euo pipefail

# High-confidence secret formats only, to avoid false positives from the
# synthetic 401 fixture and documentation words such as "API key".
pattern='(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})'

found=0

while IFS= read -r commit; do
  matches="$(git grep -I -n -E "$pattern" "$commit" -- T04_exchange_board 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    echo "Potential plaintext secret found in T04 Git history at commit $commit:"
    echo "$matches"
    found=1
  fi
done < <(git rev-list --all)

if [[ "$found" -ne 0 ]]; then
  echo "T04 high-confidence secret history scan FAILED."
  exit 1
fi

echo "T04 high-confidence secret history scan passed."
