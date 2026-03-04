# SecuWatcher 디자인 토큰 규격 v1.0

> Phase 2 #11 색상 토큰 통합의 기준 문서
> Operator Agent 작성 | 2026-03-04

---

## 1. 색상 토큰 (Color Tokens)

### 배경 (Background)
| 토큰명 | 값 | 용도 |
|--------|------|------|
| `--color-bg-primary` | `#121519` | 앱 최상위 배경, 타이틀바 |
| `--color-bg-secondary` | `#1A1929` | 그라데이션 끝, 사이드바 |
| `--color-bg-video` | `#1C1E26` | 비디오 플레이어 영역 |
| `--color-bg-panel` | `#2C2B37` | 패널, 모달 배경 |
| `--color-bg-input` | `#363541` | 입력 필드, 셀렉트, 드롭다운 배경 |
| `--color-bg-hover` | `rgba(255,255,255,0.1)` | 호버 상태 오버레이 |
| `--color-bg-active` | `rgba(255,255,255,0.2)` | 활성/클릭 상태 오버레이 |

### 텍스트 (Text)
| 토큰명 | 값 | 용도 |
|--------|------|------|
| `--color-text-primary` | `#E8E8E8` | 본문 텍스트, 레이블 |
| `--color-text-secondary` | `#A0A0A0` | 보조 텍스트, 힌트 |
| `--color-text-muted` | `#aaaaaa` | 비활성 텍스트, 푸터 |

### 브랜드/액센트 (Brand)
| 토큰명 | 값 | 용도 |
|--------|------|------|
| `--color-accent` | `#3B82F6` | 포커스 링, 강조 |
| `--color-accent-button` | `#3A82C4` | 주요 버튼, 활성 탭 |
| `--color-accent-hover` | `#3498db` | 주요 버튼 호버 |

### 테두리 (Border)
| 토큰명 | 값 | 용도 |
|--------|------|------|
| `--color-border` | `rgba(255,255,255,0.1)` | 기본 테두리 |
| `--color-border-solid` | `#40404D` | 구분선, 입력 필드 테두리 |

### 상태 (Semantic)
| 토큰명 | 값 | 용도 |
|--------|------|------|
| `--color-success` | `#059669` | 성공 토스트, 유효 표시 |
| `--color-success-light` | `#10B981` | 성공 보더 |
| `--color-error` | `#DC2626` | 에러 토스트, 닫기 버튼 |
| `--color-error-light` | `#EF4444` | 에러 보더 |
| `--color-warning` | `#D97706` | 경고 토스트 |
| `--color-warning-light` | `#F59E0B` | 경고 보더 |
| `--color-info` | `#2563EB` | 정보 토스트 |
| `--color-valid` | `#27ae60` | 비밀번호 유효 |
| `--color-invalid` | `#e74c3c` | 비밀번호 무효 |

---

## 2. Z-index 토큰 (이미 정의됨)
| 토큰명 | 값 | 용도 |
|--------|------|------|
| `--z-base` | `0` | 기본 |
| `--z-video` | `0` | 비디오 |
| `--z-mask-preview` | `5` | 마스크 미리보기 |
| `--z-canvas` | `10` | 캔버스 |
| `--z-conversion` | `20` | 변환 오버레이 |
| `--z-modal-base` | `1000` | 모달 |
| `--z-context-menu` | `2000` | 컨텍스트 메뉴 |
| `--z-processing` | `9999` | 처리 중 오버레이 |
| `--z-toast` | `10000` | 토스트 (추가) |

---

## 3. 간격/크기 토큰 (이미 정의됨)
| 토큰명 | 값 |
|--------|------|
| `--spacing-xs` | `4px` |
| `--spacing-sm` | `8px` |
| `--spacing-md` | `16px` |
| `--spacing-lg` | `24px` |
| `--radius-sm` | `4px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `10px` |

---

## 4. 현재 하드코딩 매핑

| 하드코딩 값 | → 대체 토큰 | 파일 |
|-------------|-------------|------|
| `#3A82C4` | `var(--color-accent-button)` | controls.css, export-forms.css |
| `#3498db` | `var(--color-accent-hover)` | controls.css, export-forms.css |
| `#E8E8E8` | `var(--color-text-primary)` | export-forms.css 다수 |
| `#2C2B37` | `var(--color-bg-panel)` | export-forms.css |
| `#363541` | `var(--color-bg-input)` | export-forms.css |
| `#40404D` | `var(--color-border-solid)` | export-forms.css |
| `#555555` | `var(--color-accent-cancel)` | controls.css (.cancel) |
| `#27ae60` | `var(--color-valid)` | controls.css |
| `#e74c3c` | `var(--color-invalid)` | controls.css |
| `skyblue` | `var(--color-accent)` | controls.css (.setting-modal h4) |

---

## 5. 적용 규칙
- 모든 CSS 파일에서 하드코딩 hex/named color → CSS 변수로 교체
- 새 토큰은 `variables.css`에 추가
- Vue 컴포넌트 `<style>` 블록의 인라인 색상도 토큰으로 교체 (#15)
- `z-index` 하드코딩도 토큰으로 교체 (#16)
