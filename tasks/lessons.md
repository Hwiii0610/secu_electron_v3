# SecuWatcher UI/UX 개선 — Lessons Learned

> 수정/실수 발생 시 즉시 기록. 세션 시작 시 리뷰.

---

## 프로젝트 설정 단계

### 2026-03-04: 백엔드 분석 누락
- **상황**: 초기 리뷰(v1.0~v3.0)에서 프론트엔드만 분석하고 Python 백엔드(~4,100줄)를 깊이 있게 분석하지 않음
- **교훈**: 프론트-백 연동 프로젝트에서는 양쪽을 동시에 분석해야 UX 이슈를 완전히 파악할 수 있음
- **규칙**: 새 프로젝트 리뷰 시 API 엔드포인트, 에러 응답 포맷, 진행률 메커니즘을 반드시 함께 분석

### 2026-03-04: i18n 범위 사전 확인
- **상황**: 다국어 지원을 일반적으로 계획했으나, 실제로는 ko+en 2개 언어만 필요
- **교훈**: 국제화 범위는 프로젝트 초기에 확정해야 불필요한 복잡도 방지
- **규칙**: i18n 항목 작업 전 지원 언어 목록과 배포 대상 OS를 반드시 확인

### 2026-03-04: 배포 대상 OS 확인
- **상황**: Windows/macOS 배포임이 늦게 확인됨
- **교훈**: Electron 프로젝트에서 OS별 UX 차이(트레이 동작, 창 닫기 등)는 설계에 영향을 미침
- **규칙**: 첫 리뷰 시 배포 대상 OS 확인 필수

---

## 작업 중 교훈

### 2026-03-04: ProcessingModal.vue 구문 오류 (#5)
- **상황**: Phase 1 #5 cancellable prop 추가 시 props 객체 닫는 `}` 뒤 쉼표 누락 → 빌드 실패
- **원인**: `emits: ['cancel']`이 props 객체 내부가 아닌 컴포넌트 옵션 레벨인데, props 닫는 `},` 쉼표가 빠짐
- **교훈**: Vue SFC 수정 후 반드시 Vite 빌드 검증 단계를 포함해야 함
- **규칙**: MEDIUM Risk 이상 Vue 컴포넌트 수정 시 QA에 `npm run build` 검증 포함 필수

### 2026-03-04: macOS 호환성 사전 점검 필수
- **상황**: Phase 1 완료 후 macOS 실행 가능 여부 점검 시 CRITICAL 이슈 다수 발견 (dirConfig.json Windows 하드코딩, config.ini 절대 경로)
- **원인**: 초기 리뷰에서 크로스플랫폼 경로 호환성을 별도 항목으로 분리하지 않음
- **교훈**: Windows/macOS 양쪽 배포 프로젝트에서 "경로 하드코딩 제거"를 Phase 1 SAFE Risk로 포함해야 함
- **규칙**: 새 프로젝트 분석 시 `grep -rn "C:\\\\" src/` 등으로 하드코딩 경로 전수 조사 필수

---

## 필수 도구 규칙

### hashline 필수 사용 (2026-03-04 확정)
- **규칙**: Operator 및 모든 서브 에이전트(Frontend/Backend/QA)는 파일 읽기·편집·검색 시 반드시 hashline을 사용해야 합니다.
- **프로젝트 루트**: `/sessions/peaceful-wizardly-knuth/mnt/secu_electron_v3`
- **hashline 명령어**:
  - 파일 읽기: `bash .hashline/hashline_cat.sh <파일경로>`
  - 파일 편집: `bash .hashline/hashline_edit.sh <파일경로> <해시> '<old>' '<new>'`
  - 코드 검색: `bash .hashline/hashline_grep.sh '<패턴>' <경로>`
  - 파일 찾기: `bash .hashline/hashline_find.sh <경로> '<패턴>'`
- **서브에이전트 환경 변수**: `export HASHLINE_PROJECT_ROOT=$(cat /sessions/peaceful-wizardly-knuth/mnt/secu_electron_v3/.hashline/project_root)`
- **위반 시**: 네이티브 Read/Edit/Grep 대신 hashline 미사용은 작업 규칙 위반으로 간주
