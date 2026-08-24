#!/bin/bash
# Wrapper: runs dsh with a specific working directory
# Usage: ./run-dsh.sh <profile> <workdir> <prompt>
PROFILE="$1"
WORKDIR="$2"
shift 2
PROMPT="$*"

cd "$WORKDIR"
exec pnpm --dir /Users/xh/project/deepseek-harness exec dsh --profile "$PROFILE" "$PROMPT"
