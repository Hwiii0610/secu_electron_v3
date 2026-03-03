#!/usr/bin/env bash
# Hook: Write(기존파일) → hashline_edit.sh 리다이렉트 (.hashline/ 존재 시)
source "$(dirname "$0")/check_external_path.sh"

FILE_PATH=$(echo "$TOOL_INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

if [ -z "$FILE_PATH" ]; then
    echo '{"decision":"approve"}'
elif is_external_path "$FILE_PATH"; then
    echo '{"decision":"approve"}'
elif [ ! -d .hashline ]; then
    echo '{"decision":"approve"}'
elif [ ! -f "$FILE_PATH" ]; then
    echo '{"decision":"approve"}'   # 신규 파일은 Write 허용
else
    echo "{\"decision\":\"block\",\"reason\":\"Existing file. Use: bash .hashline/hashline_edit.sh '$FILE_PATH' <<'EDITS' ... EDITS\"}"
fi
