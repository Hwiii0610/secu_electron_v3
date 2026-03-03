#!/usr/bin/env bash
# Hook: Grep → hashline_grep.sh 리다이렉트 (.hashline/ 존재 시)
source "$(dirname "$0")/check_external_path.sh"

FILE_PATH=$(echo "$TOOL_INPUT" | grep -o '"path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

if [ -z "$FILE_PATH" ]; then
    echo '{"decision":"approve"}'
elif is_external_path "$FILE_PATH"; then
    echo '{"decision":"approve"}'
elif [ ! -d .hashline ]; then
    echo '{"decision":"approve"}'
else
    echo "{\"decision\":\"block\",\"reason\":\"Use: bash .hashline/hashline_grep.sh <pattern> '$FILE_PATH'\"}"
fi
