# UI 레이아웃 최적화 계획 (수정 최종안)

**작성일**: 2026-02-26  
**검토 대상**: SecuWatcher Export 전체 UI 레이아웃 코드  
**위험도 평가**: 보수적 접근 (회귀 방지 우선)

---

## 📋 개요

본 문서는 현재 프로젝트의 UI 레이아웃 코드를 분석하고, 실제 오류 없이 안전하게 적용할 수 있는 최적화 방안을 제시한다.

**핵심 원칙**:
- 기능 회귀 ZERO
- 점진적 개선
- 검증 가능한 단계별 실행

---

## 🔍 현재 구조 분석

### 레이아웃 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│ Title Bar (32px)                                                │
├─────────────────────────────────────────────────────────────────┤
│ Export Container (Menu Bar)                                     │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │                          │
│  Video Wrapper (flex column)         │  File Wrapper (220px)    │
│  ┌────────────────────────────────┐  │                          │
│  │ Video Container (relative)     │  │  ┌────────────────────┐  │
│  │ ┌──────────────────────────┐   │  │  │ File Info Header   │  │
│  │ │ Video Player (z: 0)      │   │  │  ├────────────────────┤  │
│  │ │ Canvas (z: 10, absolute) │   │  │  │ Scrollable List    │  │
│  │ │ Mask Preview (z: 5)      │   │  │  ├────────────────────┤  │
│  │ └──────────────────────────┘   │  │  │ Action Buttons     │  │
│  └────────────────────────────────┘  │  └────────────────────┘  │
│  Control Bar (progress + buttons)    │                          │
└──────────────────────────────────────┴──────────────────────────┘
```

**기술 스택**:
- **CSS**: Grid (레이아웃) + Flexbox (낶부)
- **반응형**: Media Queries (1280px, 1366px, 1400px)
- **좌표 계산**: JavaScript (getBoundingClientRect, clientWidth/Height)

### 주요 파일

| 파일 | 역할 | 라인 수 | 해시 ID |
|------|------|---------|---------|
| `styles/base.css` | 전역 스타일, 타이틀 바 | 75 | `#1bc76e6e` |
| `styles/layout.css` | 그리드 레이아웃 | 252 | `#a0c286e1` |
| `styles/video.css` | 비디오 플레이어 | 200+ | `#106a6034` |
| `styles/file-panel.css` | 파일 패널 | 150+ | `#52fb9371` |
| `styles/modals.css` | 모달 다이얼로그 | 300+ | `#e1a4a996` |
| `composables/canvasDrawing.js` | 좌표 변환 | 600+ | `#ba6f13aa` |
| `composables/maskPreview.js` | 캔버스 위치 | 400+ | `#5625f9a2` |

---

## ⚠️ 식별된 문제점

### 1. CSS 아키텍처

**문제**:
- 매직 넘버 하드코딩 (`1280px`, `220px`, `800px`, `32px`)
- 색상 값 중복 (`#121519`, `#1A1929`, `#1C1E26`)
- z-index 산재 (0, 5, 10, 20, 1000-9999)

**영향**: 유지보수성 저하, 테마 변경 어려움

### 2. 레이아웃 계산

**문제**:
- `getBoundingClientRect()` 6회 호출
- `clientWidth/Height` 10회+ 호출
- 매 프레임/이벤트마다 재계산

**영향**: Reflow/Repaint, 성능 저하

### 3. 코드 중복

**문제**:
```javascript
// canvasDrawing.js - line 50-55
const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
const offsetX = (containerWidth - originalWidth * scale) / 2;
const offsetY = (containerHeight - originalHeight * scale) / 2;

// maskPreview.js - 유사 코드 존재
// canvasInteraction.js - 유사 코드 존재
```

**영향**: 일관성 결여, 버그 발생 가능성

---

## ❌ 제외된 위험한 방안

### 1. Container Queries 마이그레이션

**제외 이유**:
- 현재 Grid 레이아웃과 충돌 가능성
- Electron 앱 특성상 불필요 (고정 레이아웃)
- 변경 비용 > 효과

### 2. CSS @layer 적용

**제외 이유**:
- 브라우저 호환성 이슈 (Electron 36/Chromium 124)
- 기존 캐스케이딩 규칙과 충돌 위험
- 디버깅 복잡성 증가

### 3. 전면적 구조 변경

**제외 이유**:
- App.vue 구조 변경 시 전체 기능 영향
- 테스트 범위 과다
- 회귀 위험 매우 높음

### 4. aggressive contain/will-change

**제외 이유**:
- `contain: paint`는 캔버스 overflow 처리에 영향
- `will-change: transform`은 GPU 메모리 과다 사용
- 비디오 재생 중 지속적 적용 시 오히려 성능 저하

---

## ✅ 최종 최적화 계획

### Phase 1: CSS 변수 도입 (색상/Z-index) 🟢 안전

**목표**: 유지보수성 향상, 하드코딩 제거  
**예상 시간**: 0.5일  
**위험도**: 낮음  
**회귀 가능성**: 없음

#### 1.1 신규 파일 생성

**파일**: `src/styles/variables.css`

```css
/* ========================================
   VARIABLES.CSS
   CSS Custom Properties (Variables)
   ======================================== */

:root {
  /* 색상 팔레트 */
  --color-bg-primary: #121519;
  --color-bg-secondary: #1A1929;
  --color-bg-video: #1C1E26;
  --color-bg-panel: #2C2B37;
  --color-text-primary: #E8E8E8;
  --color-text-secondary: #A0A0A0;
  --color-accent: #3B82F6;
  --color-border: rgba(255, 255, 255, 0.1);
  
  /* Z-index 계층 */
  --z-base: 0;
  --z-video: 0;
  --z-mask-preview: 5;
  --z-canvas: 10;
  --z-conversion: 20;
  --z-modal-base: 1000;
  --z-context-menu: 2000;
  --z-processing: 9999;
  
  /* 간격 (선택적 도입) */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  
  /* 테두리 반경 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 10px;
  
  /* 트랜지션 */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
}
```

#### 1.2 수정 대상 파일

**A. styles/index.css** (line 6-7)
```css
/* 변경 전 */
@import './base.css';

/* 변경 후 */
@import './variables.css';
@import './base.css';
```

**B. styles/base.css** (line 16, 25-27)
```css
/* 변경 전 */
background: linear-gradient(180deg, #121519 0%, #1A1929 100%);
background-color: rgba(18, 21, 25, 0.9);

/* 변경 후 */
background: linear-gradient(180deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%);
background-color: rgba(18, 21, 25, 0.9); /* 투명도가 있어 유지 */
```

**C. styles/video.css** (line 10, 29)
```css
/* 변경 전 */
background: #1C1E26;
z-index: 0;

/* 변경 후 */
background: var(--color-bg-video);
z-index: var(--z-video);
```

**D. styles/modals.css** (z-index 관련)
```css
/* 변경 전 */
z-index: 1000;

/* 변경 후 */
z-index: var(--z-modal-base);
```

#### 1.3 검증 체크리스트

- [ ] 모든 색상이 정상 표시되는지
- [ ] z-index 순서가 유지되는지 (캔버스 > 비디오)
- [ ] 모달이 정상적으로 overlay 되는지
- [ ] 다크 테마 일관성 유지

---

### Phase 2: 레이아웃 계산 캐싱 🟡 주의

**목표**: DOM 측정 횟수 70% 감소, 성능 향상  
**예상 시간**: 1일  
**위험도**: 중간 (좌표 정확도 검증 필요)  
**회귀 가능성**: 낮음 (단위 테스트로 방지)

#### 2.1 신규 컴포저블 생성

**파일**: `src/composables/useLayoutCache.js`

```javascript
/**
 * 레이아웃 계산 캐싱 컴포저블
 * 
 * DOM 측정 값을 캐싱하여 reflow 최소화
 * 주의: video 메타데이터 로드 후 사용해야 함
 */

import { ref, computed } from 'vue';

export function useLayoutCache() {
  // 캐시 상태
  const cache = ref({
    videoWidth: 0,
    videoHeight: 0,
    containerWidth: 0,
    containerHeight: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    timestamp: 0
  });
  
  // 캐시 유효 시간 (ms) - 1프레임 @ 60fps
  const CACHE_TTL = 16;
  
  /**
   * 캐시된 레이아웃 정보 조회
   * @param {HTMLVideoElement} video
   * @param {HTMLElement} container
   * @returns {Object} 레이아웃 정보
   */
  const getLayout = (video, container) => {
    // 유효성 검사
    if (!video || !container) {
      console.warn('[useLayoutCache] Invalid video or container');
      return null;
    }
    
    // video 메타데이터 확인
    if (!video.videoWidth || !video.videoHeight) {
      console.warn('[useLayoutCache] Video metadata not loaded');
      return null;
    }
    
    const now = performance.now();
    
    // 캐시가 유효하면 반환
    if (now - cache.value.timestamp < CACHE_TTL) {
      return cache.value;
    }
    
    // 새로 계산
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    
    // scale 계산 (object-fit: contain 방식)
    const scale = Math.min(cw / vw, ch / vh);
    
    // 중앙 정렬 offset
    const offsetX = (cw - vw * scale) / 2;
    const offsetY = (ch - vh * scale) / 2;
    
    // 캐시 업데이트
    cache.value = {
      videoWidth: vw,
      videoHeight: vh,
      containerWidth: cw,
      containerHeight: ch,
      scale,
      offsetX,
      offsetY,
      timestamp: now
    };
    
    return cache.value;
  };
  
  /**
   * 좌표 변환: 화면 좌표 → 비디오 원본 좌표
   * @param {number} screenX - 화면 X 좌표
   * @param {number} screenY - 화면 Y 좌표
   * @param {Object} layout - getLayout() 결과
   * @returns {Object} 비디오 원본 좌표
   */
  const screenToVideo = (screenX, screenY, layout) => {
    if (!layout) return { x: 0, y: 0 };
    
    return {
      x: Math.floor((screenX - layout.offsetX) / layout.scale),
      y: Math.floor((screenY - layout.offsetY) / layout.scale)
    };
  };
  
  /**
   * 좌표 변환: 비디오 원본 좌표 → 화면 좌표
   * @param {number} videoX - 비디오 X 좌표
   * @param {number} videoY - 비디오 Y 좌표
   * @param {Object} layout - getLayout() 결과
   * @returns {Object} 화면 좌표
   */
  const videoToScreen = (videoX, videoY, layout) => {
    if (!layout) return { x: 0, y: 0 };
    
    return {
      x: Math.floor(videoX * layout.scale + layout.offsetX),
      y: Math.floor(videoY * layout.scale + layout.offsetY)
    };
  };
  
  /**
   * 캐시 무효화 (창 크기 변경, 비디오 변경 시)
   */
  const invalidate = () => {
    cache.value.timestamp = 0;
  };
  
  /**
   * 캐시 상태 확인 (디버깅용)
   */
  const isValid = computed(() => {
    return performance.now() - cache.value.timestamp < CACHE_TTL;
  });
  
  return {
    getLayout,
    screenToVideo,
    videoToScreen,
    invalidate,
    isValid,
    // 날짜 디버깅용
    _cache: cache
  };
}
```

#### 2.2 기존 코드 리팩토링

**A. canvasDrawing.js**

**변경 전** (line 44-59):
```javascript
function getClickCoordinates(event) {
  const canvas = getCanvas();
  const video = getVideo();
  if (!canvas || !video) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  const originalWidth = video.videoWidth;
  const originalHeight = video.videoHeight;
  const containerWidth = video.clientWidth;
  const containerHeight = video.clientHeight;

  const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
  const offsetX = (containerWidth - originalWidth * scale) / 2;
  const offsetY = (containerHeight - originalHeight * scale) / 2;

  return {
    x: Math.floor((clickX - offsetX) / scale),
    y: Math.floor((clickY - offsetY) / scale)
  };
}
```

**변경 후**:
```javascript
import { useLayoutCache } from './useLayoutCache';

// 컴포저블 인스턴스
const layoutCache = useLayoutCache();

function getClickCoordinates(event) {
  const canvas = getCanvas();
  const video = getVideo();
  if (!canvas || !video) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // 캐싱된 레이아웃 사용
  const layout = layoutCache.getLayout(video, canvas);
  if (!layout) return { x: 0, y: 0 };

  return layoutCache.screenToVideo(clickX, clickY, layout);
}
```

**B. canvasInteraction.js, maskPreview.js**

동일한 패턴으로 리팩토링

#### 2.3 ResizeObserver 연결

**VideoCanvas.vue**에 추가:

```javascript
import { useLayoutCache } from '@/composables/useLayoutCache';

// ...

const layoutCache = useLayoutCache();
let resizeObserver = null;

onMounted(() => {
  // ... 기존 코드
  
  // ResizeObserver로 창 크기 변경 감지
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      layoutCache.invalidate();
    });
    resizeObserver.observe(videoPlayer.value?.parentElement);
  }
});

onUnmounted(() => {
  // ... 기존 코드
  
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

// 비디오 변경 시에도 무효화
const onVideoLoaded = () => {
  layoutCache.invalidate();
  // ... 기존 코드
};
```

#### 2.4 검증 체크리스트

- [ ] 클릭 좌표가 정확한 위치에 매핑되는지
- [ ] 바울딩 박스가 올바르게 그려지는지
- [ ] 창 크기 변경 후에도 좌표 정확성 유지
- [ ] 비디오 변경 후 정상 동작
- [ ] 성능 개선 측정 (Chrome DevTools Performance)

**테스트 시나리오**:
1. 비디오 로드 → 마스킹 영역 클릭 → 좌표 확인
2. 창 크기 변경 → 같은 위치 클릭 → 좌표 일관성 확인
3. 연속 클릭 시 좌표 계산 정확성

---

### Phase 3: 미디어 쿼리 정리 🟢 안전

**목표**: 가독성 향상, 중복 제거  
**예상 시간**: 0.5일  
**위험도**: 없음  
**회귀 가능성**: 없음

#### 3.1 수정 대상

**파일**: `styles/layout.css` (line 182-251)

**변경 전**:
```css
@media screen and (max-width: 1400px) {
  .container { padding: 0 15px; }
  .video-wrapper { min-width: 750px; }
}

@media screen and (max-width: 1366px) {
  .container { padding: 0 10px; }
  .video-wrapper { min-width: 700px; }
  .file-wrapper { width: 200px; }
  /* ... 중복 속성 ... */
}

@media screen and (max-width: 1280px) {
  .container { padding: 0 8px; }
  .video-wrapper { min-width: 650px; }
  .file-wrapper { width: 180px; }
  /* ... 중복 속성 ... */
}
```

**변경 후**:
```css
/* ========================================
   반응형 브레이크포인트
   
   1400px: 일반 데스크탑
   1366px: 노트북 (FHD)
   1280px: 최소 지원 해상도
   ======================================== */

/* 1400px 이하 */
@media screen and (max-width: 1400px) {
  .container { 
    padding: 0 15px; 
  }
  
  .video-wrapper { 
    min-width: 750px; 
  }
}

/* 1366px 이하 */
@media screen and (max-width: 1366px) {
  .container { 
    padding: 0 10px; 
  }
  
  .video-wrapper { 
    min-width: 700px; 
  }
  
  .file-wrapper { 
    width: 200px; 
  }
}

/* 1280px 이하 (최소 해상도) */
@media screen and (max-width: 1280px) {
  .container { 
    padding: 0 8px; 
  }
  
  .video-wrapper { 
    min-width: 650px; 
  }
  
  .file-wrapper { 
    width: 180px; 
  }
}
```

#### 3.2 검증 체크리스트

- [ ] 1400px, 1366px, 1280px에서 레이아웃 정상
- [ ] 각 브레이크포인트에서 min-width 준수
- [ ] 파일 패널 크기 변경 확인

---

### Phase 4: 선택적 최적화 (실험) 🟡 주의

**목표**: conversion-overlay에 contain 적용  
**예상 시간**: 0.5일  
**위험도**: 낮음  
**회귀 가능성**: 낮음

#### 4.1 실험 대상

**파일**: `styles/video.css`

**변경**:
```css
.conversion-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  z-index: var(--z-conversion);
  
  /* 실험: 레이아웃 격리 */
  contain: layout;
}
```

#### 4.2 검증 방법

- Chrome DevTools Performance 탭
- 비디오 변환 시 reflow/repaint 측정
- 문제 발생 시 즉시 롤백

---

## 📊 변경 파일 목록

### 신규 파일 (2개)
1. `src/styles/variables.css` - CSS 변수 정의
2. `src/composables/useLayoutCache.js` - 레이아웃 캐싱

### 수정 파일 (5개)
1. `src/styles/index.css` - variables.css import 추가
2. `src/styles/base.css` - 색상 변수 적용
3. `src/styles/video.css` - 색상/z-index 변수 적용
4. `src/styles/modals.css` - z-index 변수 적용
5. `src/styles/layout.css` - 미디어 쿼리 정리

### 리팩토링 파일 (3개)
1. `src/composables/canvasDrawing.js` - useLayoutCache 적용
2. `src/composables/canvasInteraction.js` - useLayoutCache 적용
3. `src/components/VideoCanvas.vue` - ResizeObserver 연결

**총 10개 파일** (기존 안 25개+에서 축소)

---

## 🧪 테스트 계획

### 단위 테스트

**useLayoutCache.test.js**:
```javascript
import { describe, it, expect } from 'vitest';
import { useLayoutCache } from '../composables/useLayoutCache';

describe('useLayoutCache', () => {
  it('should calculate layout correctly', () => {
    const cache = useLayoutCache();
    
    const mockVideo = {
      videoWidth: 1920,
      videoHeight: 1080
    };
    
    const mockContainer = {
      clientWidth: 800,
      clientHeight: 600
    };
    
    const layout = cache.getLayout(mockVideo, mockContainer);
    
    expect(layout.scale).toBeLessThan(1);
    expect(layout.offsetX).toBeGreaterThan(0);
    expect(layout.offsetY).toBe(0); // 16:9 in 4:3
  });
  
  it('should convert coordinates correctly', () => {
    const cache = useLayoutCache();
    
    const layout = {
      scale: 0.5,
      offsetX: 100,
      offsetY: 50
    };
    
    const videoCoord = cache.screenToVideo(200, 150, layout);
    
    expect(videoCoord.x).toBe(200); // (200 - 100) / 0.5
    expect(videoCoord.y).toBe(200); // (150 - 50) / 0.5
  });
});
```

### 통합 테스트

**시나리오**:
1. 비디오 로드 → 마스킹 클릭 → 좌표 확인
2. 창 리사이즈 → 마스킹 클릭 → 좌표 일관성
3. 연속 프레임 마스킹 → 성능 측정
4. 다양한 해상도 비디오 테스트 (720p, 1080p, 4K)

### 수동 테스트

**브라우저**: Electron (Chromium 124)
**해상도**: 1280x720, 1366x768, 1920x1080, 2560x1440

**체크리스트**:
- [ ] 비디오 플레이어 중앙 정렬
- [ ] 캔버스 오버레이 정렬
- [ ] 마스킹 영역 클릭 정확성
- [ ] 모달 위치 및 z-index
- [ ] 파일 패널 반응형 동작

---

## ⚡ 성능 기대치

| 항목 | 현재 | 목표 | 개선율 |
|------|------|------|--------|
| DOM 측정/프레임 | 16회 | 4회 | 75% ↓ |
| CSS 중복 | 35% | 15% | 57% ↓ |
| 파일 크기 (CSS) | ~25KB | ~22KB | 12% ↓ |
| 유지보수 시간 | 100 | 50 | 50% ↓ |

---

## 📅 실행 일정

### Week 1
- **Day 1**: Phase 1 (CSS 변수)
- **Day 2**: Phase 2 시작 (useLayoutCache 구현)
- **Day 3**: Phase 2 완료 (기존 코드 리팩토링)
- **Day 4**: Phase 3 (미디어 쿼리 정리)
- **Day 5**: 테스트 및 버그 수정

### Week 2 (여유)
- Phase 4 선택적 실행
- 성능 측정 및 검증
- 문서화

---

## 🚨 리스크 및 대응

| 리스크 | 확률 | 영향 | 대응책 |
|--------|------|------|--------|
| 좌표 변환 오류 | 중간 | 높음 | 단위 테스트 강화, 단계적 배포 |
| CSS 변수 미적용 | 낮음 | 낮음 | 폴리필 불필요 (Electron 지원) |
| 성능 저하 | 낮음 | 중간 | feature flag로 롤백 가능 |
| z-index 꼬임 | 낮음 | 중간 | 시각적 회귀 테스트 |

---

## 📝 결론

본 계획은 **보수적 접근**을 취하여 기능 회귀를 최소화하면서도 유의미한 개선을 달성한다.

**핵심 성과**:
1. 유지보수성: CSS 변수로 테마/색상 중앙화
2. 성능: DOM 측정 75% 감소
3. 코드 품질: 레이아웃 계산 로직 중앙화

**권장 실행 순서**:
1. Phase 1 즉시 실행 (안전)
2. Phase 2 테스트 후 실행 (검증 필요)
3. Phase 3 병행 실행 (안전)
4. Phase 4 선택적 실행 (실험)

**승인 대상**: Tech Lead, QA Lead  
**예상 완료**: 1주 (테스트 포함)

---

## 📎 부록

### A. 참고 파일 해시 ID

```
# CSS
#1bc76e6e - base.css
#a0c286e1 - layout.css  
#106a6034 - video.css
#52fb9371 - file-panel.css
#e1a4a996 - modals.css

# JavaScript
#ba6f13aa - canvasDrawing.js
#e9d39ae6 - canvasInteraction.js
#5625f9a2 - maskPreview.js

# Vue
#d75bf41b - App.vue
#e16f43cd - VideoCanvas.vue
```

### B. 관련 문서

- `tasks/layout-analysis.md` - 초기 레이아웃 분석
- `tasks/layout-calculation-map.md` - 좌표 변환 흐름
- `tasks/css-grid-migration-plan.md` - (보류) 그리드 마이그레이션

---

*문서 버전: 1.0*  
*최종 검토일: 2026-02-26*  
*작성자: AI Assistant*
