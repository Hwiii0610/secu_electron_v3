# hashline

> Claude Code 플러그인 — djb2 해시 기반 안전한 파일 편집 시스템

각 줄에 2자리 djb2 해시를 부여하여, 전체 파일을 다시 읽지 않고도 안전한 앵커 검증 편집을 제공합니다.

## 설치

### Claude Code 플러그인으로 등록

`~/.claude/settings.json`에 플러그인 추가:

```json
{
  "plugin": ["hashline"]
}
```

또는 로컬 경로로 직접 등록:

```json
{
  "plugin": ["/path/to/hashline"]
}
```

### 프로젝트에 활성화

Claude Code에서 프로젝트 루트로 이동 후 실행:

```
/hashline-install
```

또는 특정 디렉터리에 설치:

```
/hashline-install /path/to/project
```

설치 후 `.hashline/` 디렉터리가 생성되며, 이후 모든 파일 작업이 자동으로 hashline으로 리다이렉트됩니다.

## 구성 파일

```
hashline/
├── package.json
├── .claude-plugin/
│   └── plugin.json
├── AGENTS.md                        ← 에이전트용 빠른 참조
├── hooks/
│   ├── hooks.json                   ← PreToolUse 훅 (4개)
│   └── scripts/
│       ├── check_external_path.sh   ← 경로 판단 유틸 (공통)
│       ├── check-read.sh
│       ├── check-edit.sh
│       ├── check-write.sh
│       └── check-grep.sh
├── scripts/                         ← 프로젝트에 설치되는 핵심 스크립트
│   ├── hashline_cat.sh
│   ├── hashline_edit.sh
│   ├── hashline_grep.sh
│   └── hashline_find.sh
├── commands/
│   └── hashline-install.md          ← /hashline-install 슬래시 커맨드
└── skills/
    └── hashline/
        ├── SKILL.md
        └── references/
            └── edit-protocol.md
```

## 동작 방식

```
Claude가 Read/Edit/Write/Grep 시도
         ↓
PreToolUse 훅 실행
         ↓
.hashline/ 디렉터리 존재?
├── NO  → 네이티브 도구 허용
└── YES → block + hashline 명령 안내
         ↓
Claude가 hashline 스크립트로 작업
```

## 서브에이전트 지원

```bash
# 서브에이전트가 다른 CWD에서 실행될 때
export HASHLINE_PROJECT_ROOT=$(cat .hashline/project_root)
```

## 변경 이력

### v0.3.0
- **FIX**: cross-device `mv` 방지 — 임시 파일을 `/tmp` 대신 대상 파일과 같은 디렉토리에 생성
- **CHANGE**: 플러그인명 `hashline-v2` → `hashline`으로 정리

### v0.2.0
- **FIX**: `xxd` → `od` (Linux 이식성 — POSIX 표준)
- **FIX**: 외부 경로 regex 버그 수정 (절대경로 기반 판단으로 변경)
- **FIX**: `replace_lines`/`delete_lines` 역순 범위 오류 반환
- **FIX**: `insert_after` 동일 줄 중복 오류 반환
- **FIX**: `set_line` no-op 감지 구현 (SKILL.md 스펙 일치)
- **FIX**: `delete_lines` 후 주변 컨텍스트 줄 출력
- **FIX**: `*.lock` 전체 제외 → 특정 lockfile 이름만 제외
- **NEW**: `hashline_grep.sh` 디렉터리 재귀 검색 지원
- **NEW**: `check_external_path.sh` 공통 유틸 (4개 훅이 공유)
- **NEW**: `HASHLINE_PROJECT_ROOT` 환경변수로 서브에이전트 지원
- **NEW**: `/hashline-install`이 `.hashline/project_root` 파일 생성
- **NEW**: `AGENTS.md` 에이전트용 빠른 참조 추가
- **NEW**: `package.json` — npm 패키지로 배포 가능

### v0.1.0
- 초기 릴리즈
