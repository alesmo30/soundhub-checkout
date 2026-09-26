#!/usr/bin/env bash
set -euo pipefail

branch_name="${1:-}"

if [[ -z "$branch_name" ]]; then
  echo "Usage: pnpm worktree:new <branch-name>" >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
worktree_path="$(dirname "$repo_root")/hc-${branch_name}"

if [[ -e "$worktree_path" ]]; then
  echo "Error: $worktree_path already exists." >&2
  exit 1
fi

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/${branch_name}"; then
  git -C "$repo_root" worktree add "$worktree_path" "$branch_name"
else
  git -C "$repo_root" worktree add -b "$branch_name" "$worktree_path" main
fi

ln -s "$repo_root/.env" "$worktree_path/.env"

(cd "$worktree_path" && pnpm install)

echo "Worktree ready at $worktree_path"
