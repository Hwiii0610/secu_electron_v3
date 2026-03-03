#!/usr/bin/env bash
# check_external_path.sh - 외부 경로 판단 유틸리티 (source해서 사용)
# 반환: 0 = 외부경로(approve), 1 = 프로젝트 내부(block 대상)
#
# 우선순위:
# 1. 절대경로로 변환
# 2. HASHLINE_PROJECT_ROOT 환경변수 또는 .hashline/project_root 파일로 프로젝트 루트 확인
#    → 프로젝트 루트 안 → 무조건 내부 (block)
#    → 프로젝트 루트 밖 → 외부 (approve)
# 3. project_root 정보 없으면 CWD 기준으로 판단

is_external_path() {
    local fpath="$1"
    local abs_path proj_root

    # 절대경로 변환
    if command -v realpath >/dev/null 2>&1; then
        abs_path=$(realpath -m "$fpath" 2>/dev/null || echo "$fpath")
    else
        case "$fpath" in
            /*) abs_path="$fpath" ;;
            *)  abs_path="$(pwd)/$fpath" ;;
        esac
    fi

    # 프로젝트 루트 결정 (환경변수 > .hashline/project_root 파일 > CWD)
    if [ -n "$HASHLINE_PROJECT_ROOT" ]; then
        proj_root="$HASHLINE_PROJECT_ROOT"
    elif [ -f ".hashline/project_root" ]; then
        proj_root=$(cat ".hashline/project_root")
    else
        proj_root="$(pwd)"
    fi

    if command -v realpath >/dev/null 2>&1; then
        proj_root=$(realpath -m "$proj_root" 2>/dev/null || echo "$proj_root")
    fi

    # 프로젝트 루트 안 → 내부 (block)
    case "$abs_path" in
        "$proj_root"/*)
            return 1 ;;
        "$proj_root")
            return 1 ;;
    esac

    # 프로젝트 루트 밖 → 외부 (approve)
    return 0
}
