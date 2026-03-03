---
name: hashline
description: >
  이 스킬은 사용자가 "hashline으로 편집", "해시 기반 편집 사용", "라인 해시로 파일 읽기"를
  요청하거나, 프로젝트에 `.hashline/` 디렉터리가 존재하여 파일 작업을 네이티브 도구 대신
  hashline 명령으로 라우팅해야 할 때 사용합니다.
  "hashline", "djb2 해시 편집", "앵커 기반 편집" 등의 키워드에도 반응합니다.
version: 0.3.0
---

# Hashline — 스테이트리스 해시 기반 편집

Hashline은 네이티브 파일 작업(Read, Edit, Write, Grep)을 해시 앵커 명령으로 대체합니다.
각 줄은 줄 번호와 2자리 djb2 해시로 식별되어, 전체 파일을 다시 읽지 않고도 안전하게 편집할 수 있습니다.

## 출력 포맷

```
LINE:HASH|content
```

- **LINE**: 1부터 시작하는 줄 번호
- **HASH**: 공백을 제거한 내용의 djb2 해시 2자리 hex
- 공백 변경은 해시에 영향 없음

## 명령어

`.hashline/`이 프로젝트에 존재하면 네이티브 도구 대신 아래 명령을 사용합니다.

### 파일 읽기

```bash
bash .hashline/hashline_cat.sh <path> [offset] [limit]
```

모든 줄을 `LINE:HASH|content` 포맷으로 반환. `offset`(줄 건너뜀), `limit`(최대 줄 수) 선택 가능.

### 파일 내 검색

```bash
bash .hashline/hashline_grep.sh <pattern> <file|directory>
```

ERE 패턴으로 매칭되는 줄을 `LINE:HASH|content` 포맷으로 반환.
디렉터리 지정 시 재귀 검색, 결과에 파일명 prefix 포함.

**ERE 특수문자 이스케이프 필요**: `\(` `\)` `\[` `\]` `\.` `\*` `\+` `\?`

### 파일 탐색

```bash
bash .hashline/hashline_find.sh <directory> [glob-pattern]
```

`.git`, `node_modules`, `__pycache__`, `dist`, `build` 등 자동 제외.
바이너리/미디어/패키지 lockfile 자동 제외.

### 파일 편집

```bash
bash .hashline/hashline_edit.sh <path> <<'EDITS'
<operation> <anchor(s)>
<content lines>
---
EDITS
```

## 편집 명령어

| 명령어 | 구문 | 설명 |
|--------|------|------|
| `set_line` | `LINE:HASH` | 단일 줄 교체 |
| `replace_lines` | `START:HH END:HH` | 줄 범위 교체 |
| `insert_after` | `LINE:HASH` | 앵커 줄 다음에 삽입 |
| `delete_lines` | `START:HH END:HH` | 줄 범위 삭제 |

여러 명령은 `---`로 구분.

## 핵심 규칙

1. **모든 앵커는 편집 전 파일 상태 기준** — 같은 배치 내에서 편집 후 줄 번호 사용 금지
2. **성공 후 반환된 해시를 후속 편집에 사용** — 파일 재읽기 불필요
3. **교체 시 정확한 공백 유지**
4. **배치 편집은 원자적** — 하나라도 앵커 검증 실패 시 전체 취소
5. **no-op 편집 금지** — 교체 내용은 현재 내용과 달라야 함
6. **동일 줄에 insert_after 중복 금지**
7. **범위 명령의 start ≤ end** — 역순 범위는 오류
8. **Relocation**: 지정 줄에서 해시 불일치 시 파일 내 유일한 매치 위치로 자동 재위치

## Hashline을 사용하지 않는 경우

다음은 네이티브 도구를 사용합니다:

- 새 파일 생성 (Write 사용)
- `.hashline/` 디렉터리가 없는 경우
- 바이너리/이미지 파일

## 상세 레퍼런스

전체 편집 프로토콜 명세, 앵커 검증 로직, 고급 사용 패턴은 `references/edit-protocol.md` 참조.
