# SecuWatcher 레이아웃 계산맵 (Layout Calculation Map)

## 1. 레이아웃 트리 구조 (DOM Hierarchy)

```
body
├── .title-bar (32px)
└── .container (height: calc(100vh - 32px), padding: 0 20px)
    ├── TopMenuBar (.export-container)
    │   └── margin-top: 10px
    └── .wrapper (display: flex, gap: 10px)
        ├── .video-wrapper (flex: 1)
        │   └── DetectingPopup (position: fixed)
        └── FilePanel (.file-wrapper, width: 220px)
```

## 2. 요소별 크기 및 위치 계산

### 2.1 타이틀바 (.title-bar)
| 속성 | 값 | 파일 | 라인 |
|------|-----|------|------|
| height | 32px | base.css | 26 |
| position | top: 0 | - | Viewport 최상단 |

**Viewport 기준 bottom:** 32px

---

### 2.2 메뉴 바 (.export-container)
| 속성 | 값 | 파일 | 라인 |
|------|-----|------|------|
| margin-top | 10px | layout.css | 38 |
| padding | 10px 20px | layout.css | 44 |
| 날 div padding | 10px 0 | layout.css | 52 |
| img height | 15px | layout.css | 82 |
| gap | 5px | layout.css | 57 |
| text height | ~14px | font-size: 12px + line-height |

**총 높이 계산:**
```
Total Height = padding-top(10px) 
             + img(15px) 
             + gap(5px) 
             + text(~14px) 
             + padding-bottom(10px)
             = 54px
```

**Viewport 기준:**
- top: 32px (title-bar) + 10px (margin-top) = **42px**
- bottom: 42px + 54px = **96px**

---

### 2.3 파일 패널 (.file-wrapper)
| 속성 | 값 | 파일 | 라인 |
|------|-----|------|------|
| width | 220px | layout.css | 87 |
| margin-top | 0 (wrapper 난내) | - | - |
| flex-shrink | 0 | layout.css | 88 |

**Viewport 기준 top:**
- title-bar: 32px
- export-container: 10px (margin) + 54px (height) = 64px
- **Total: 32px + 64px = 96px**

**⚠️ 중요:** FilePanel은 wrapper 난내에 있으며, wrapper는 export-container의 형제입니다.
Block flow 상 export-container 다음에 위치하므로, FilePanel의 top은 export-container의 bottom과 같습니다.

---

### 2.4 DetectingPopup (.auto-detect-popup)
| 속성 | 현재 값 | 목표 값 | 비고 |
|------|---------|---------|------|
| position | fixed | fixed | Viewport 기준 |
| top | 45px | **96px** | FilePanel과 같은 높이 |
| right | 250px | **250px** | 유지 |
| z-index | 100 | 100 | 유지 |

**위치 계산:**
```
top = title-bar(32px) + export-container 전체 높이(64px)
    = 32px + 64px
    = 96px

right = container-padding(20px) + file-wrapper(220px) + gap(10px)
      = 250px
```

---

## 3. 시각적 위치 비교

### 현재 위치 (top: 45px)
```
Viewport Top
├── 0-32px: title-bar
├── 32-42px: 여백 (export-container margin-top)
├── 42-45px: DetectingPopup 시작 (3px 여백) ← ❌ 잘못됨
└── 42-96px: export-container (메뉴 바)
```

### 목표 위치 (top: 96px)
```
Viewport Top
├── 0-32px: title-bar
├── 32-42px: 여백 (export-container margin-top)
├── 42-96px: export-container (메뉴 바)
├── 96px: FilePanel 시작
└── 96px: DetectingPopup 시작 ← ✅ 맞음
```

---

## 4. 수정 필요 사항

### 4.1 modals.css 수정
```css
.auto-detect-popup {
  position: fixed;
  top: 96px;      /* 45px → 96px (FilePanel과 같은 높이) */
  right: 250px;   /* 유지 */
  z-index: 100;
}
```

### 4.2 이전 계산 오류 분석
| 항목 | 이전 계산 | 실제 값 | 오차 |
|------|----------|---------|------|
| export-container 높이 | ~65px | 54px | -11px |
| FilePanel top | 107px | 96px | -11px |
| DetectingPopup top | 45px | 96px | -51px |

**오류 원인:**
1. 메뉴 바 낮피 div의 padding-bottom 중복 계산
2. container의 padding-top이 0인 것 간과
3. wrapper가 block flow를 따르는 것 간과

---

## 5. 검증 체크리스트

- [x] title-bar 높이: 32px (base.css:26)
- [x] container padding-top: 0 (layout.css:10)
- [x] export-container margin-top: 10px (layout.css:38)
- [x] export-container height: 54px (계산됨)
- [x] FilePanel top: 96px (32+10+54)
- [x] file-wrapper width: 220px (layout.css:87)
- [x] right 값: 20+220+10=250px

**결론:** DetectingPopup의 top 값을 **96px**로 변경하면 FilePanel과 정확히 같은 높이에 위치합니다.
