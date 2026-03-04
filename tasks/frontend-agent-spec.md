# Frontend Agent 지침서

> **담당**: Electron main process, Vue 컴포넌트, CSS, preload.js
> **편집 도구**: hashline:hashline 필수
> **참조 문서**: `SecuWatcher_UIUX_Review.md` (v4.0), `SecuWatcher_UIUX_ModificationStrategy.md` (v2.0)

---

## 담당 범위

### Phase 1 (항목 #1~#9)
| # | 항목 | Risk | 대상 파일 |
|---|------|------|----------|
| 1 | Vue 글로벌 에러 핸들러 | LOW | `src/renderer.js` |
| 2 | ARIA 레이블 추가 | SAFE | 전체 .vue + index.html |
| 3 | 포커스 인디케이터 | SAFE | `src/styles/base.css` |
| 4 | Toast 색상 구분 | MEDIUM | `controls.css`, `App.vue` |
| 5 | ProcessingModal 취소 | MEDIUM | `ProcessingModal.vue`, `App.vue` |
| 6 | Polling 백오프 | MEDIUM | `progressPoller.js` |
| 7 | Silent failure 알림 | LOW | `objectManager.js` 외 4개 |
| 8 | Single Instance Lock | LOW | `src/main/index.js` |
| 9 | Canvas rAF 스로틀링 | MEDIUM | `canvasInteraction.js` |

### Phase 2 (항목 #10~#26)
디자인 토큰 통합, 컴포넌트 통합, 플랫폼 UX 개선

### Phase 3 (항목 #27~#38)
vue-i18n (ko/en), 키보드 내비게이션, App.vue 분리

---

## 핵심 규칙

1. **hashline 사용**: 모든 파일 읽기/편집은 hashline 명령으로
2. **하위 호환성 우선**: 기존 함수 시그니처에 파라미터 추가 시 반드시 기본값 설정
3. **태그 변경 주의**: Phase 1에서 `div→button` 태그 변경 금지 (CSS 영향). `role`/`aria-*` 속성만 추가
4. **인라인 스타일 구분**: 고정 `style=""` → CSS 클래스 전환 가능. 동적 `:style=""` → 유지
5. **버튼 인덱스 주의**: `windowManager.js`의 다이얼로그 버튼 순서 변경 시 `canvasInteraction.js`의 `choice === 0/1/2/3/4` 매핑 반드시 동기화

## 프로젝트 구조 참고

```
secuwatcher_electron/
├── index.html              # 윈도우 컨트롤 버튼 (ARIA 추가 대상)
├── src/
│   ├── renderer.js         # Vue 앱 진입점 (7줄)
│   ├── preload.js          # IPC 브릿지
│   ├── main/
│   │   ├── index.js        # Electron main process (146줄)
│   │   ├── windowManager.js # 창 관리 + 다이얼로그 (334줄)
│   │   └── ipcHandlers/    # IPC 핸들러 모듈
│   ├── App.vue             # 메인 컴포넌트 (31KB, 850줄)
│   ├── components/
│   │   ├── TopMenuBar.vue
│   │   ├── FilePanel.vue
│   │   ├── VideoControls.vue
│   │   └── modals/         # 10개 모달
│   ├── composables/        # 14개 (canvasInteraction, progressPoller 등)
│   ├── stores/             # 6개 Pinia 스토어
│   └── styles/
│       ├── variables.css   # 디자인 토큰 (41줄)
│       ├── base.css        # 기본 스타일 (93줄)
│       └── controls.css    # 컨트롤 스타일 (140줄)
```

## i18n 가이드 (Phase 3)

- 기본 언어: **한국어 (ko)** — fallback 언어
- 추가 언어: **영어 (en)** — 이 2개만 지원
- 라이브러리: `vue-i18n` v10+
- 파일 구조: `src/locales/ko.json`, `src/locales/en.json`
- 배포 대상: Windows, macOS
