# SecuWatcher 리팩토링 남은 작업 계획서

> **기준 문서**: refac2.md, refac.md  
> **작성일**: 2026-02-10  
> **대상**: Phase 3 (UI 컴포넌트), Phase 4 (Composables), Phase 5 (중복 코드 정리)

---

## 1. 현재 진행 상황

### ✅ 완료된 작업

| Phase | 작업 내용 | 완료일 | 비고 |
|-------|----------|--------|------|
| Phase 1 | 버그 수정 (6개) | 2026-02-10 | App.vue 오류 수정 |
| Phase 2 | Pinia Store 도입 | 2026-02-10 | 6개 Store 생성 |
| Phase 3-1 | 모달 컴포넌트 추출 | 2026-02-10 | 10개 모달 분리 |
| Phase 3-6 | VideoCanvas 분리 | 2026-02-10 | 캔버스 로직 분리 완료 |

### 📊 현재 코드 규모

| 파일 | 라인 수 | 상태 |
|------|---------|------|
| App.vue | ~3,500라인 (추정) | 리팩토링 중 |
| VideoCanvas.vue | ~2,100라인 | 분리 완료 |
| Modal Components | 10개 파일 | 분리 완료 |
| Pinia Stores | 6개 파일 | 생성 완료 |

---

## 2. 남은 작업 개요

```
Phase 3: UI 컴포넌트 추출 [████████████░░░░░░░░] 60% 진행 중
├── TopMenuBar.vue ⏳
├── FilePanel.vue ⏳
├── VideoControls.vue ⏳
└── ContextMenu.vue ⏳

Phase 4: Composables 추출 [░░░░░░░░░░░░░░░░░░░░] 0% 대기
├── usePolling.ts ⏳
├── useCanvasDrawing.ts ⏳
├── useWatermark.ts ⏳
└── useVideoConversion.ts ⏳

Phase 5: 중복 코드 정리 [░░░░░░░░░░░░░░░░░░░░] 0% 대기
├── export polling 중복 제거 ⏳
└── 기타 중복 로직 정리 ⏳
```

---

## 3. Phase 3: UI 컴포넌트 추출 (4개)

### 3.1 작업 순서 및 일정

| 순서 | 컴포넌트 | 예상 소요시간 | 난이도 | 의존성 |
|------|---------|--------------|--------|--------|
| 1 | TopMenuBar.vue | 20분 | 낮음 | 없음 |
| 2 | FilePanel.vue | 30분 | 중간 | fileStore |
| 3 | VideoControls.vue | 30분 | 중간 | videoStore |
| 4 | ContextMenu.vue | 20분 | 낮음 | modeStore |

**총 예상 소요시간**: 약 1.5시간

### 3.2 TopMenuBar.vue

#### 분석 현황
- **현재 위치**: App.vue template 상단 (라인 ~3-40)
- **주요 기능**: 9개 버튼 메뉴 바 (미리보기, 수동객체탐지, 영역마스킹, 전첼마스킹, 낼바내기, 일괄처리, 설정, 닫기)
- **이벤트**: `menu-click` → `handleMenuItemClick` 메서드

#### Props/Emits 정의
```typescript
// Props
interface TopMenuBarProps {
  currentMode?: string;
  exportAllMasking?: string;
  isBoxPreviewing?: boolean;
}

// Emits
interface TopMenuBarEmits {
  'menu-click': (item: string) => void;
}
```

#### 구현 체크리스트
- [ ] Template: 상단 메뉴 버튼 9개 분리
- [ ] Props: `currentMode`, `exportAllMasking`, `isBoxPreviewing` 수신
- [ ] Emits: `menu-click` 이벤트 emit
- [ ] 스타일: 기존 CSS 클래스 유지

### 3.3 FilePanel.vue

#### 분석 현황
- **현재 위치**: App.vue template 우측 패널
- **주요 기능**: 파일 목록 표시, 파일 정보 표시, 파일 선택/삭제
- **사용 Store**: fileStore (files, selectedFileIndex, fileInfoItems 등)
- **이벤트**: `select-file`, `trigger-file-input`, `delete-file`

#### Props/Emits 정의
```typescript
// Props - 없음 (Store 직접 사용)

// Emits
interface FilePanelEmits {
  'select-file': (index: number) => void;
  'trigger-file-input': () => void;
  'delete-file': () => void;
}
```

#### 구현 체크리스트
- [ ] Template: 우측 파일 패널 분리
- [ ] Store: fileStore의 `mapWritableState` 사용
- [ ] Emits: 파일 선택/삭제/추가 이벤트 emit
- [ ] 스타일: `.file-panel`, `.file-list` 등 유지

### 3.4 VideoControls.vue

#### 분석 현황
- **현재 위치**: App.vue template 하단
- **주요 기능**: 재생/일시정지, 앞/뒤 이동, 배속 조절, 줌 인/아웃, 자르기/병합
- **사용 Store**: videoStore (videoPlaying, currentTime, progress 등)
- **이벤트**: 10개 이벤트 (`toggle-play`, `jump-backward`, `jump-forward` 등)

#### Props/Emits 정의
```typescript
// Props
interface VideoControlsProps {
  videoPlaying?: boolean;
  currentTime?: string;
  totalTime?: string;
  progress?: number;
  zoomLevel?: number;
  currentPlaybackRate?: number;
}

// Emits
interface VideoControlsEmits {
  'toggle-play': () => void;
  'jump-backward': () => void;
  'jump-forward': () => void;
  'set-playback-rate': (rate: number) => void;
  'zoom-in': () => void;
  'zoom-out': () => void;
  'update-progress': (progress: number) => void;
  'marker-mousedown': (marker: string) => void;
  'trim-video': () => void;
  'merge-video': () => void;
}
```

#### 구현 체크리스트
- [ ] Template: 하단 컨트롤 바 분리
- [ ] Props: 비디오 상태 수신
- [ ] Emits: 컨트롤 이벤트 emit
- [ ] 슬라이더: 진행률, 트림 마커 처리

### 3.5 ContextMenu.vue

#### 분석 현황
- **현재 위치**: App.vue template 컨텍스트 메뉴 영역
- **주요 기능**: 우클릭 컨텍스트 메뉴 (객체 조작)
- **사용 Store**: modeStore (contextMenuVisible, contextMenuPosition, selectedShape)
- **이벤트**: `action` → `handleContextMenuAction`

#### Props/Emits 정의
```typescript
// Props
interface ContextMenuProps {
  visible?: boolean;
  position?: { x: number; y: number };
}

// Emits
interface ContextMenuEmits {
  'action': (action: string) => void;
}
```

#### 구현 체크리스트
- [ ] Template: 컨텍스트 메뉴 DOM 분리
- [ ] Props: `visible`, `position` 수신
- [ ] Emits: 메뉴 액션 emit
- [ ] 동작: 마우스 위치에 따른 표시/숨김

---

## 4. Phase 4: Composables 추출

### 4.1 개요

Vue 3 Composition API의 Composables 패턴을 사용하여 재사용 가능한 로직을 분리합니다.
Options API 유지를 위해 컴포넌트 내부에서는 `setup()` 옵션을 통해 사용합니다.

### 4.2 usePolling.ts

#### 대상 로직
- 객체 탐지 진행률 폴링
- 낼바내기 진행률 폴링
- 일괄 처리 진행률 폴링

#### 인터페이스
```typescript
interface PollingOptions {
  interval?: number;
  timeout?: number;
}

interface UsePollingReturn {
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
  isPolling: Ref<boolean>;
  progress: Ref<number>;
  status: Ref<'idle' | 'running' | 'completed' | 'failed'>;
}

export function usePolling(
  onProgress: (data: any) => void,
  onComplete: (data: any) => void,
  onError: (error: any) => void,
  options?: PollingOptions
): UsePollingReturn;
```

### 4.3 useCanvasDrawing.ts

#### 대상 로직
- 바울링 박스 그리기
- 마스킹 캔버스 그리기
- 다각형/사각형 그리기

#### 인터페이스
```typescript
interface UseCanvasDrawingOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
}

interface UseCanvasDrawingReturn {
  drawBoundingBoxes: (detections: Detection[]) => void;
  drawMasks: (masks: Mask[]) => void;
  drawPolygon: (points: Point[]) => void;
  drawRectangle: (box: BoundingBox) => void;
  clearCanvas: () => void;
}

export function useCanvasDrawing(
  options: UseCanvasDrawingOptions
): UseCanvasDrawingReturn;
```

### 4.4 useWatermark.ts

#### 대상 로직
- 워터마크 이미지 로드 및 캐싱
- 워터마크 위치 계산
- 워터마크 그리기

#### 인터페이스
```typescript
interface WatermarkOptions {
  text?: string;
  image?: HTMLImageElement;
  position?: 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';
  opacity?: number;
}

interface UseWatermarkReturn {
  loadImage: (src: string) => Promise<HTMLImageElement>;
  drawWatermark: (ctx: CanvasRenderingContext2D, options: WatermarkOptions) => void;
  calculatePosition: (canvasW: number, canvasH: number, itemW: number, itemH: number) => Point;
}

export function useWatermark(): UseWatermarkReturn;
```

### 4.5 useVideoConversion.ts

#### 대상 로직
- FFmpeg 변환 실행
- 변환 진행률 추적
- 임시 파일 관리

#### 인터페이스
```typescript
interface ConversionOptions {
  videoCodec?: string;
  crf?: number;
  duration?: number;
}

interface UseVideoConversionReturn {
  convert: (inputPath: string, outputPath: string, options?: ConversionOptions) => Promise<string>;
  convertFromFile: (file: File, options?: ConversionOptions) => Promise<string>;
  isConverting: Ref<boolean>;
  progress: Ref<number>;
}

export function useVideoConversion(): UseVideoConversionReturn;
```

---

## 5. Phase 5: 중복 코드 정리

### 5.1 중복 로직 목록

| 항목 | 위치 | 설명 | 정리 방안 |
|------|------|------|----------|
| export polling | exportStore, App.vue | 낼바내기 진행률 폴링 | usePolling composable로 통합 |
| detection polling | detectionStore, App.vue | 객체 탐지 진행률 폴링 | usePolling composable로 통합 |
| batch polling | exportStore | 일괄 처리 진행률 폴링 | usePolling composable로 통합 |
| getDetectObjValue | configStore | 클래스 매핑 | 이미 테이블화 완료 |
| formatTime | 여러 곳 | 시간 포맷팅 | videoStore에 중앙화 |

### 5.2 정리 계획

```javascript
// 변경 전: 각각 폴링 로직 구현
// App.vue
detectionIntervalId = setInterval(async () => {
  // 폴링 로직
}, 1000);

// 변경 후: usePolling composable 사용
const { startPolling, stopPolling } = usePolling(
  (data) => { /* 진행 처리 */ },
  (data) => { /* 완료 처리 */ },
  (err) => { /* 에러 처리 */ }
);
```

---

## 6. 작업 순서 및 일정

### Phase 3: UI 컴포넌트 (1.5시간)

```
1. TopMenuBar.vue 추출 (20분)
   ↓ 빌드 테스트
2. FilePanel.vue 추출 (30분)
   ↓ 빌드 테스트
3. VideoControls.vue 추출 (30분)
   ↓ 빌드 테스트
4. ContextMenu.vue 추출 (20분)
   ↓ 빌드 테스트
```

### Phase 4: Composables (2시간)

```
1. usePolling.ts 추출 (40분)
   ↓ 기존 폴링 로직 교체
2. useCanvasDrawing.ts 추출 (40분)
   ↓ VideoCanvas 적용
3. useWatermark.ts 추출 (20분)
   ↓ VideoCanvas 적용
4. useVideoConversion.ts 추출 (20분)
   ↓ App.vue 적용
```

### Phase 5: 중복 코드 정리 (1시간)

```
1. export polling 통합 (20분)
2. detection polling 통합 (20분)
3. batch polling 통합 (20분)
```

---

## 7. 리스크 및 대응

| 리스크 | 영향도 | 대응 방안 |
|--------|--------|-----------|
| 이벤트 버블링 문제 | 중간 | 이벤트 핸들러 정확히 연결 |
| Store 상태 동기화 | 중간 | mapWritableState 정확히 설정 |
| Composables Options API 호환 | 낮음 | setup() 옵션 사용 |
| CSS 스타일 누락 | 낮음 | scoped 스타일 유지 |
| 템플릿 ref 접근 | 중간 | expose 설정 확인 |

---

## 8. 검증 체크리스트

### Phase 3 검증

- [ ] TopMenuBar: 메뉴 클릭 동작
- [ ] FilePanel: 파일 선택/삭제 동작
- [ ] VideoControls: 재생/일시정지/이동 동작
- [ ] ContextMenu: 우클릭 메뉴 동작

### Phase 4 검증

- [ ] usePolling: 폴링 시작/중지 동작
- [ ] useCanvasDrawing: 캔버스 그리기 동작
- [ ] useWatermark: 워터마크 표시 동작
- [ ] useVideoConversion: 비디오 변환 동작

### Phase 5 검증

- [ ] 중복 제거 후 기능 동일성 확인
- [ ] 빌드 오류 없음
- [ ] 런타임 에러 없음

---

## 9. 파일 변경 예상 목록

### 생성 파일
```
src/
├── components/
│   ├── TopMenuBar.vue
│   ├── FilePanel.vue
│   ├── VideoControls.vue
│   └── ContextMenu.vue
└── composables/
    ├── usePolling.ts
    ├── useCanvasDrawing.ts
    ├── useWatermark.ts
    └── useVideoConversion.ts
```

### 수정 파일
```
src/
├── App.vue (템플릿 교체, import 추가)
└── stores/
    └── exportStore.ts (polling 로직 제거)
```

---

## 10. 참고사항

- Options API 유지 (Composition API로 전환하지 않음)
- Pinia Store는 기존 구조 유지
- 빌드 테스트는 각 Phase 완료 후 필수
- 이벤트 명명 규칙: kebab-case (예: `menu-click`)
