#!/usr/bin/env bash
# hashline_cat.sh - 파일 읽기 (LINE:HASH|content 포맷)
# 사용법: hashline_cat.sh <filepath> [offset] [limit]

FILEPATH="$1"
OFFSET="${2:-0}"
LIMIT="${3:-0}"

if [ -z "$FILEPATH" ]; then
    echo "ERR usage: hashline_cat.sh <filepath> [offset] [limit]" >&2
    exit 1
fi

if [ ! -f "$FILEPATH" ]; then
    echo "ERR file_not_found: $FILEPATH" >&2
    exit 1
fi

if [ -s "$FILEPATH" ] && file --mime-encoding "$FILEPATH" 2>/dev/null | grep -q binary; then
    echo "BINARY:$FILEPATH"
    exit 0
fi

awk -v offset="$OFFSET" -v limit="$LIMIT" '
function djb2(s,    i, h, c, stripped) {
    stripped = s; gsub(/[[:space:]]/, "", stripped)
    h = 5381
    for (i = 1; i <= length(stripped); i++) {
        c = ord[substr(stripped, i, 1)]
        h = (h * 33 + c) % 65536
    }
    return sprintf("%02x", h % 256)
}
BEGIN {
    for (i = 0; i < 256; i++) ord[sprintf("%c", i)] = i
    start = offset + 1
}
{
    if (NR < start) next
    if (limit > 0 && NR >= start + limit) exit
    printf "%d:%s|%s\n", NR, djb2($0), $0
}
' "$FILEPATH"
