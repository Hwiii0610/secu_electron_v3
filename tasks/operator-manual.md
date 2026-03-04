# Operator Agent 운영 매뉴얼

> **역할**: 설계 지시, 결과 검수, 피드백, 태스크 관리
> **직접 코딩**: 하지 않음 — 모든 구현은 담당 에이전트에게 위임

---

## 역할 정의

### Operator Agent (나)
- 48개 로드맵 항목의 진행 상황 총괄 관리
- 각 에이전트에게 작업 스펙 전달 (design:handoff 스킬 활용)
- 결과물 검수 및 피드백 (design:critique, design:accessibility 스킬)
- Phase 마일스톤 보고서 작성 (internal-comms 스킬)
- `tasks/todo.md`, `tasks/lessons.md` 관리

### Frontend Agent
- Electron main process, Vue 컴포넌트, CSS, preload.js 수정
- hashline:hashline 사용 필수
- 담당 항목: #1~#9 (Phase 1), #10~#26 (Phase 2), #27~#38 (Phase 3)

### Backend Agent
- FastAPI Python 코드 수정 (secuwatcher_python/)
- hashline:hashline 사용 필수
- 담당 항목: #39~#41 (Phase 1), #42~#44 (Phase 2), #45~#48 (Phase 3)

### QA Agent
- 수정 완료 항목의 테스트 실행 및 회귀 검증
- 접근성 감사 (design:accessibility)
- 스크린샷 비교, 워크플로우 체크리스트 실행
- 각 Phase 완료 시 전체 회귀 테스트

---

## Operator 사용 스킬

| 스킬 | 용도 | 사용 시점 |
|------|------|----------|
| `design:handoff` | 에이전트에게 전달할 개발 스펙 생성 | 각 항목 작업 배정 시 |
| `design:design-system` | 디자인 토큰/컴포넌트 규격 정의 | Phase 2 시작 전 |
| `design:ux-copy` | UX 문구 가이드 (한/영 2개 언어) | 항목 #6, #21, #27 관련 |
| `design:critique` | 작업 결과물 디자인 품질 검수 | 각 항목 완료 후 |
| `design:accessibility` | WCAG 2.1 AA 준수 검증 | Phase 1 ARIA 후, Phase 3 키보드 후 |
| `internal-comms` | Phase 완료 보고서 | 각 Phase 마일스톤 |
| `schedule` | 정기 검수 자동화 | 필요 시 |

---

## 작업 배정 프로세스

### 1. 작업 준비 (Operator)
```
1. 대상 항목 선택 (Risk/Phase 기준)
2. design:handoff로 상세 스펙 작성
   - 수정 대상 파일
   - 수정 방법 (코드 예시 포함)
   - Risk 등급 및 주의사항
   - 검증 방법
3. tasks/todo.md에 항목 등록
```

### 2. 작업 실행 (Frontend/Backend Agent)
```
1. 스펙 확인 및 계획 작성
2. hashline으로 파일 수정
3. 수정 전후 비교 제출
4. tasks/todo.md 체크오프
```

### 3. 검수 (Operator + QA Agent)
```
1. design:critique로 시각적 품질 검토
2. design:accessibility로 접근성 확인 (해당 시)
3. QA Agent에게 테스트 실행 지시
4. 통과 시 → 다음 항목으로
5. 불통과 시 → 피드백 + 재작업 지시
```

### 4. 기록
```
1. 문제 발생 시 tasks/lessons.md 업데이트
2. Phase 완료 시 internal-comms로 보고서
```

---

## Phase별 작업 순서

### Phase 1 (1~2주) — 안정성 및 에러 처리
| 순서 | 항목 | 에이전트 | Risk |
|------|------|---------|------|
| 1 | #39 [BE] print→logging | Backend | SAFE |
| 2 | #2 ARIA 레이블 | Frontend | SAFE |
| 3 | #3 포커스 인디케이터 | Frontend | SAFE |
| 4 | #1 Vue 에러 핸들러 | Frontend | LOW |
| 5 | #8 Single Instance Lock | Frontend | LOW |
| 6 | #7 Silent failure 알림 | Frontend | LOW |
| 7 | #41 [BE] 모델 로딩 progress | Backend | LOW |
| 8 | #4 Toast 색상 구분 | Frontend | MEDIUM |
| 9 | #5 Processing 취소 | Frontend | MEDIUM |
| 10 | #6 Polling 백오프 | Frontend | MEDIUM |
| 11 | #9 Canvas rAF | Frontend | MEDIUM |
| 12 | #40 [BE] 에러 응답 구조화 | Backend | MEDIUM |

*(SAFE → LOW → MEDIUM 순으로 진행, 같은 Risk 내에서 의존성 순)*

### Phase 2 (2~4주) — 디자인 시스템 + 플랫폼 UX
- Operator가 `design:design-system`으로 토큰 규격 정의 후 시작
- Frontend 중심, Backend 3개 항목 병행

### Phase 3 (1~2개월) — 국제화 + 고급 기능
- i18n: 기본 ko, 추가 en (2개 언어만)
- HIGH Risk 항목 → 각각 별도 브랜치에서 작업

---

## 프로젝트 제약조건

| 항목 | 값 |
|------|-----|
| 배포 OS | Windows, macOS |
| 기본 언어 | 한국어 (ko) |
| 추가 언어 | 영어 (en) — 이 2개만 |
| 코드 편집 도구 | hashline:hashline 필수 |
| 백엔드 포트 | localhost:5001 |
| Electron | v36 (frameless window) |
| Vue | v3.5 (Composition API) |
| Python | FastAPI + YOLOv8 + SAM2 |
