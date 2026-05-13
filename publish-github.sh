#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: GITHUB_TOKEN=... $0 <github-username> <repo-name> [public|private]"
  exit 1
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing command: $cmd"
    exit 1
  fi
}

require_cmd git
require_cmd curl

GITHUB_USERNAME="$1"
REPO_NAME="$2"
VISIBILITY="${3:-public}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Set GITHUB_TOKEN first."
  exit 1
fi

PRIVATE_JSON="false"
if [[ "$VISIBILITY" == "private" ]]; then
  PRIVATE_JSON="true"
fi

API_RESPONSE_CODE="$(curl -sS -o /tmp/teleir-github-create.json -w '%{http_code}' \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "{\"name\":\"${REPO_NAME}\",\"private\":${PRIVATE_JSON},\"description\":\"Tele IR self-hosted private web messenger\"}" \
  https://api.github.com/user/repos)"

if [[ "$API_RESPONSE_CODE" != "201" && "$API_RESPONSE_CODE" != "422" ]]; then
  echo "GitHub API create repo failed with HTTP ${API_RESPONSE_CODE}"
  cat /tmp/teleir-github-create.json
  exit 1
fi

if [[ ! -d .git ]]; then
  git init
fi

git add .
git commit -m "Initial Tele IR release" || true
git branch -M main
git remote remove origin >/dev/null 2>&1 || true
git remote add origin "https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
git push -u origin main

echo "Repository published: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
