#!/usr/bin/env bash
# hashline_grep.sh - 패턴 검색 (해시 주석 포함)
# 사용법:
#   hashline_grep.sh <pattern> <filepath>      # 단일 파일
#   hashline_grep.sh <pattern> <directory>     # 디렉터리 재귀 검색
# 출력: [file:]LINE:HASH|content
# 주의: ERE 특수문자는 이스케이프 필요 (예: print\()

PATTERN="$1"
TARGET="$2"

if [ -z "$PATTERN" ] || [ -z "$TARGET" ]; then
    echo "ERR usage: hashline_grep.sh <pattern> <filepath|directory>" >&2
    exit 1
fi

AWK_HASH='
function djb2(s,    i, h, c, stripped) {
    stripped = s; gsub(/[[:space:]]/, "", stripped)
    h = 5381
    for (i = 1; i <= length(stripped); i++) {
        c = ord[substr(stripped, i, 1)]
        h = (h * 33 + c) % 65536
    }
    return sprintf("%02x", h % 256)
}
BEGIN { for (i = 0; i < 256; i++) ord[sprintf("%c", i)] = i }
{
    colon = index($0, ":")
    linenum = substr($0, 1, colon - 1)
    content = substr($0, colon + 1)
    printf "%s:%s|%s\n", linenum, djb2(content), content
}
'

grep_single_file() {
    local fpath="$1"
    local show_filename="$2"

    [ ! -f "$fpath" ] && return
    if [ -s "$fpath" ] && file --mime-encoding "$fpath" 2>/dev/null | grep -q binary; then
        return
    fi

    local result
    result=$(grep -n -E "$PATTERN" "$fpath" 2>/dev/null | awk "$AWK_HASH")

    if [ -n "$result" ] && [ "$show_filename" = "yes" ]; then
        echo "$result" | sed "s|^|$fpath:|"
    elif [ -n "$result" ]; then
        echo "$result"
    fi
}

# 단일 파일
if [ -f "$TARGET" ]; then
    grep_single_file "$TARGET" "no"
    exit 0
fi

# 디렉터리 재귀 검색
if [ -d "$TARGET" ]; then
    find "$TARGET" \
        -path '*/.hashline' -prune -o \
        -path '*/.git' -prune -o \
        -path '*/node_modules' -prune -o \
        -path '*/__pycache__' -prune -o \
        -path '*/.venv' -prune -o \
        -path '*/venv' -prune -o \
        -path '*/.next' -prune -o \
        -path '*/dist' -prune -o \
        -path '*/build' -prune -o \
        -type f -print 2>/dev/null | sort | while IFS= read -r fpath; do
            grep_single_file "$fpath" "yes"
        done
    exit 0
fi

echo "ERR not_found: $TARGET" >&2
exit 1
