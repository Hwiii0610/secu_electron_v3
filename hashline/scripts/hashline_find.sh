#!/usr/bin/env bash
# hashline_find.sh - 파일 탐색 (바이너리/불필요 디렉터리 자동 제외)
# 사용법: hashline_find.sh <directory> [glob-pattern]

ROOT_DIR="${1:-.}"
PATTERN="${2:-*}"

if [ ! -d "$ROOT_DIR" ]; then
    echo "ERR not_a_directory: $ROOT_DIR" >&2
    exit 1
fi

find "$ROOT_DIR" \
    -path '*/.hashline' -prune -o \
    -path '*/.git' -prune -o \
    -path '*/node_modules' -prune -o \
    -path '*/__pycache__' -prune -o \
    -path '*/.venv' -prune -o \
    -path '*/venv' -prune -o \
    -path '*/.next' -prune -o \
    -path '*/dist' -prune -o \
    -path '*/build' -prune -o \
    -type f -name "$PATTERN" \
    ! -name '*.png' ! -name '*.jpg' ! -name '*.jpeg' ! -name '*.gif' \
    ! -name '*.ico' ! -name '*.webp' ! -name '*.bmp' \
    ! -name '*.mp3' ! -name '*.mp4' ! -name '*.wav' ! -name '*.avi' \
    ! -name '*.mov' ! -name '*.mkv' ! -name '*.flac' ! -name '*.ogg' \
    ! -name '*.zip' ! -name '*.tar' ! -name '*.gz' ! -name '*.bz2' \
    ! -name '*.7z' ! -name '*.rar' ! -name '*.xz' \
    ! -name '*.exe' ! -name '*.dll' ! -name '*.so' ! -name '*.dylib' \
    ! -name '*.pyc' ! -name '*.pyo' ! -name '*.class' ! -name '*.o' \
    ! -name '*.pdf' ! -name '*.doc' ! -name '*.docx' ! -name '*.xls' \
    ! -name '*.xlsx' ! -name '*.ppt' ! -name '*.pptx' \
    ! -name '*.db' ! -name '*.sqlite' ! -name '*.sqlite3' \
    ! -name '*.woff' ! -name '*.woff2' ! -name '*.ttf' ! -name '*.eot' \
    ! -name 'package-lock.json' \
    ! -name 'yarn.lock' \
    ! -name 'pnpm-lock.yaml' \
    ! -name 'bun.lock' \
    ! -name 'Cargo.lock' \
    ! -name 'Gemfile.lock' \
    ! -name 'poetry.lock' \
    ! -name 'composer.lock' \
    ! -name 'Pipfile.lock' \
    -print 2>/dev/null | sort
