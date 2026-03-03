---
description: 프로젝트에 hashline 스크립트를 설치합니다
allowed-tools: Bash(bash:*), Bash(mkdir:*), Bash(cp:*), Bash(chmod:*), Bash(ls:*), Bash(pwd:*)
argument-hint: [target-directory]
---

hashline 핵심 스크립트를 대상 프로젝트 디렉터리에 설치합니다.

대상 디렉터리: `$1`이 제공된 경우 해당 경로, 없으면 현재 작업 디렉터리 사용.

설치 절차:
1. `pwd` 또는 `realpath`로 대상 디렉터리의 절대 경로 확인
2. `.hashline/` 디렉터리가 없으면 생성
3. `${CLAUDE_PLUGIN_ROOT}/scripts/`의 스크립트 4개를 `.hashline/`에 복사:
   - `hashline_cat.sh`
   - `hashline_edit.sh`
   - `hashline_grep.sh`
   - `hashline_find.sh`
4. `${CLAUDE_PLUGIN_ROOT}/hooks/scripts/check_external_path.sh`를 `.hashline/`에 복사
5. 모든 스크립트에 `chmod +x` 적용
6. `.hashline/project_root` 파일에 절대 프로젝트 루트 경로 저장
   (서브에이전트가 프로젝트 경계를 인식하는 데 사용)
7. `.hashline/` 디렉터리 내용 출력으로 설치 확인

설치 후, PreToolUse 훅이 `.hashline/`을 감지하여 네이티브 파일 작업을
자동으로 hashline 명령으로 리다이렉트합니다.

서브에이전트 지원:
다른 작업 디렉터리에서 실행되는 서브에이전트의 경우:
  export HASHLINE_PROJECT_ROOT=$(cat .hashline/project_root)
를 설정하면 올바른 외부 경로 감지가 동작합니다.

설치 결과를 사용자에게 간략히 보고합니다.
