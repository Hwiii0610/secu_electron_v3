#!/usr/bin/env bash
# hashline_edit.sh - 원자적 배치 편집기 (djb2 앵커 검증)
# 사용법:
#   hashline_edit.sh <filepath> <<'EDITS'
#   set_line 5:a3
#   new content
#   ---
#   replace_lines 10:b2 15:c7
#   replacement
#   ---
#   insert_after 20:d4
#   inserted line
#   ---
#   delete_lines 25:e5 30:f6
#   ---
#   EDITS

FILEPATH="$1"

if [ -z "$FILEPATH" ]; then
    echo "ERR usage: hashline_edit.sh <filepath> <<'EDITS'" >&2
    exit 1
fi

if [ ! -f "$FILEPATH" ]; then
    echo "ERR file_not_found: $FILEPATH" >&2
    exit 1
fi

if [ -s "$FILEPATH" ] && file --mime-encoding "$FILEPATH" 2>/dev/null | grep -q binary; then
    echo "ERR binary_file: $FILEPATH" >&2
    exit 1
fi

# trailing newline 감지 (od: POSIX 표준 - macOS/Linux 모두 지원)
HAS_FINAL_NL=1
if [ -s "$FILEPATH" ]; then
    tail -c1 "$FILEPATH" | od -An -tx1 | grep -q "0a" || HAS_FINAL_NL=0
fi

# v0.3: cross-device mv 방지 — 대상 파일과 같은 디렉토리에 임시 파일 생성
_EDIT_TMPDIR="${TMPDIR:-$(dirname "$(realpath "$FILEPATH")")}"
EDITS_TMP=$(mktemp "${_EDIT_TMPDIR}/hashline_edits.XXXXXX")
cat > "$EDITS_TMP"
trap 'rm -f "$EDITS_TMP" "$OUT_TMP" 2>/dev/null' EXIT

OUT_TMP=$(mktemp "${_EDIT_TMPDIR}/hashline_out.XXXXXX")

awk -v edits_file="$EDITS_TMP" -v out_file="$OUT_TMP" '
function djb2(s,    i, h, c, stripped) {
    stripped = s; gsub(/[[:space:]]/, "", stripped)
    h = 5381
    for (i = 1; i <= length(stripped); i++) {
        c = ord[substr(stripped, i, 1)]
        h = (h * 33 + c) % 65536
    }
    return sprintf("%02x", h % 256)
}

function ctx_line(n) {
    if (n < 1 || n > total) return ""
    return sprintf("%d:%s|%s", n, djb2(lines[n]), lines[n])
}

function err_context(anchor, msg,    ln, i) {
    split(anchor, _a, ":")
    ln = _a[1] + 0
    printf "ERR %s %s\n", msg, anchor > "/dev/stderr"
    for (i = ln - 2; i <= ln + 2; i++) {
        if (i >= 1 && i <= total)
            printf "%s\n", ctx_line(i) > "/dev/stderr"
    }
}

function relocate(anchor,    target_hash, i, found, found_line) {
    split(anchor, _a, ":")
    target_hash = _a[2]
    found = 0; found_line = 0
    for (i = 1; i <= total; i++) {
        if (djb2(lines[i]) == target_hash) { found++; found_line = i }
    }
    if (found == 1) {
        printf "RELOCATED %s -> %d:%s\n", anchor, found_line, target_hash > "/dev/stderr"
        return found_line
    }
    return 0
}

function validate_anchor(anchor,    ln, expected_hash, actual_hash, relocated) {
    split(anchor, _a, ":")
    ln = _a[1] + 0
    expected_hash = _a[2]
    if (ln < 1 || ln > total) {
        relocated = relocate(anchor)
        if (relocated > 0) return relocated
        err_context(anchor, "line_out_of_range")
        return -1
    }
    actual_hash = djb2(lines[ln])
    if (actual_hash == expected_hash) return ln
    relocated = relocate(anchor)
    if (relocated > 0) return relocated
    err_context(anchor, "anchor_mismatch")
    return -1
}

BEGIN {
    for (i = 0; i < 256; i++) ord[sprintf("%c", i)] = i
    total = 0; num_ops = 0
}

{ total++; lines[total] = $0 }

END {
    # 편집 명령 파싱
    num_ops = 0
    in_content = 0; current_cmd = ""; current_content = ""
    current_anchor1 = ""; current_anchor2 = ""

    while ((getline eline < edits_file) > 0) {
        if (eline == "---") {
            if (current_cmd != "") {
                num_ops++
                ops_cmd[num_ops] = current_cmd
                ops_a1[num_ops] = current_anchor1
                ops_a2[num_ops] = current_anchor2
                if (current_content != "" && substr(current_content, length(current_content)) == "\n")
                    current_content = substr(current_content, 1, length(current_content) - 1)
                ops_content[num_ops] = current_content
            }
            current_cmd = ""; current_content = ""
            current_anchor1 = ""; current_anchor2 = ""
            in_content = 0
            continue
        }
        if (!in_content) {
            n = split(eline, parts, " ")
            current_cmd = parts[1]
            current_anchor1 = parts[2]
            current_anchor2 = (n >= 3) ? parts[3] : ""
            in_content = 1; current_content = ""
        } else {
            current_content = (current_content == "") ? eline : current_content "\n" eline
        }
    }
    close(edits_file)

    if (current_cmd != "") {
        num_ops++
        ops_cmd[num_ops] = current_cmd
        ops_a1[num_ops] = current_anchor1
        ops_a2[num_ops] = current_anchor2
        if (current_content != "" && substr(current_content, length(current_content)) == "\n")
            current_content = substr(current_content, 1, length(current_content) - 1)
        ops_content[num_ops] = current_content
    }

    if (num_ops == 0) {
        for (i = 1; i <= total; i++) print lines[i] > out_file
        close(out_file); exit 0
    }

    # 앵커 검증
    for (op = 1; op <= num_ops; op++) {
        resolved_a1 = validate_anchor(ops_a1[op])
        if (resolved_a1 < 0) exit 1
        ops_line1[op] = resolved_a1

        if (ops_a2[op] != "") {
            resolved_a2 = validate_anchor(ops_a2[op])
            if (resolved_a2 < 0) exit 1
            ops_line2[op] = resolved_a2
        } else {
            ops_line2[op] = resolved_a1
        }
    }

    # 역순 범위 검증
    for (op = 1; op <= num_ops; op++) {
        if (ops_cmd[op] == "replace_lines" || ops_cmd[op] == "delete_lines") {
            if (ops_line1[op] > ops_line2[op]) {
                printf "ERR invalid_range: start (%d) > end (%d) in op %d\n", \
                    ops_line1[op], ops_line2[op], op > "/dev/stderr"
                exit 1
            }
        }
    }

    # no-op 검증
    for (op = 1; op <= num_ops; op++) {
        if (ops_cmd[op] == "set_line" && lines[ops_line1[op]] == ops_content[op]) {
            printf "ERR noop: line %d content is unchanged\n", ops_line1[op] > "/dev/stderr"
            exit 1
        }
    }

    # insert_after 중복 검증
    for (i = 1; i <= num_ops; i++) {
        if (ops_cmd[i] == "insert_after") {
            for (j = i + 1; j <= num_ops; j++) {
                if (ops_cmd[j] == "insert_after" && ops_line1[i] == ops_line1[j]) {
                    printf "ERR duplicate insert_after at line %d (op %d and op %d)\n", \
                        ops_line1[i], i, j > "/dev/stderr"
                    exit 1
                }
            }
        }
    }

    # 오버랩 검증
    for (i = 1; i <= num_ops; i++) {
        for (j = i + 1; j <= num_ops; j++) {
            if (ops_cmd[i] == "insert_after" || ops_cmd[j] == "insert_after") continue
            s1 = ops_line1[i]; e1 = ops_line2[i]
            s2 = ops_line1[j]; e2 = ops_line2[j]
            if (s1 <= e2 && s2 <= e1) {
                printf "ERR overlap: op %d (%d-%d) and op %d (%d-%d)\n", i, s1, e1, j, s2, e2 > "/dev/stderr"
                exit 1
            }
        }
    }

    # 내림차순 정렬 (bottom-up 적용)
    for (i = 1; i <= num_ops; i++) order[i] = i
    for (i = 1; i < num_ops; i++) {
        for (j = i + 1; j <= num_ops; j++) {
            if (ops_line1[order[i]] < ops_line1[order[j]]) {
                tmp = order[i]; order[i] = order[j]; order[j] = tmp
            }
        }
    }

    # 편집 적용
    for (k = 1; k <= num_ops; k++) {
        op = order[k]; cmd = ops_cmd[op]
        l1 = ops_line1[op]; l2 = ops_line2[op]

        if (cmd == "set_line") {
            lines[l1] = ops_content[op]; affected[l1] = 1
        } else if (cmd == "delete_lines") {
            for (d = l1; d <= l2; d++) { deleted[d] = 1; affected[d] = 1 }
            delete_before[l1] = 1; delete_after[l2] = 1
        } else if (cmd == "replace_lines") {
            for (d = l1; d <= l2; d++) deleted[d] = 1
            insert_at[l1] = ops_content[op]; affected[l1] = 1
        } else if (cmd == "insert_after") {
            insert_after_map[l1] = ops_content[op]; affected[l1] = 1
        }
    }

    # 출력 파일 작성
    new_linenum = 0
    affected_min = 999999; affected_max = 0

    for (i = 1; i <= total; i++) {
        if (insert_at[i] != "") {
            n_new = split(insert_at[i], new_lines, "\n")
            for (j = 1; j <= n_new; j++) {
                new_linenum++
                print new_lines[j] > out_file
                new_content[new_linenum] = new_lines[j]
                if (new_linenum < affected_min) affected_min = new_linenum
                if (new_linenum > affected_max) affected_max = new_linenum
            }
        }

        if (!deleted[i]) {
            new_linenum++
            print lines[i] > out_file
            new_content[new_linenum] = lines[i]
            if (affected[i] && !deleted[i]) {
                if (new_linenum < affected_min) affected_min = new_linenum
                if (new_linenum > affected_max) affected_max = new_linenum
            }
            # delete 직전/직후 줄을 컨텍스트로 포함
            if (delete_after[i] || (i + 1 <= total && delete_before[i + 1])) {
                if (new_linenum < affected_min) affected_min = new_linenum
                if (new_linenum > affected_max) affected_max = new_linenum
            }
        }

        if (insert_after_map[i] != "") {
            n_new = split(insert_after_map[i], new_lines, "\n")
            for (j = 1; j <= n_new; j++) {
                new_linenum++
                print new_lines[j] > out_file
                new_content[new_linenum] = new_lines[j]
                if (new_linenum < affected_min) affected_min = new_linenum
                if (new_linenum > affected_max) affected_max = new_linenum
            }
        }
    }
    close(out_file)

    # OK + 변경된 영역 출력 (전후 1줄 컨텍스트 포함)
    print "OK"
    if (affected_min <= affected_max) {
        start_ctx = (affected_min > 1) ? affected_min - 1 : 1
        end_ctx = (affected_max < new_linenum) ? affected_max + 1 : new_linenum
        for (i = start_ctx; i <= end_ctx; i++) {
            printf "%d:%s|%s\n", i, djb2(new_content[i]), new_content[i]
        }
    }
}
' "$FILEPATH"

AWK_STATUS=$?
if [ $AWK_STATUS -ne 0 ]; then exit 1; fi

# 파일 권한 보존
if [ "$(uname)" = "Darwin" ]; then
    PERMS=$(stat -f '%Lp' "$FILEPATH" 2>/dev/null || echo "644")
else
    PERMS=$(stat -c '%a' "$FILEPATH" 2>/dev/null || echo "644")
fi
mv "$OUT_TMP" "$FILEPATH" || { echo "ERR mv_failed: $FILEPATH" >&2; exit 1; }
chmod "$PERMS" "$FILEPATH" 2>/dev/null

# trailing newline 보존
if [ "$HAS_FINAL_NL" -eq 0 ] && [ -s "$FILEPATH" ]; then
    perl -pi -e 'chomp if eof' "$FILEPATH" 2>/dev/null || truncate -s -1 "$FILEPATH" 2>/dev/null
fi
