# SecuWatcher 리팩토링 Phase 4 세부 구현 계획서

> **작성일**: 2026-02-10  
> **대상**: Composables 추출 (4개)  
> **예상 소요시간**: 4 ~ 5시간  

---

## 1. 개요

### 1.1 목표
Vue 3 Composition API의 Composables 패턴을 사용하여 재사용 가능한 로직을 분리합니다.  
Options API를 유지하며 컴포넌트에서는 `setup()` 옵션을 통해 Composables를 사용합니다.

### 1.2 원칙
- **점진적 적용**: 기존 동작을 유지하며 단계별로 전환
- **Options API 유지**: Composition API로 완전 전환하지 않음
- **최소한의 변경**: 인터페이스 변경 없이 낮부 구현만 추출
- **테스트 필수**: 각 Composables 적용 후 기능 테스트

---

## 2. 구현 순서 및 일정

```
Step 1: usePolling.ts (90분)
   ↓ 15분간 빌드/테스트
Step 2: useVideoConversion.ts (50분)
   ↓ 10분간 빌드/테스트
Step 3: useCanvasDrawing.ts (60분)
   ↓ 10분간 빌드/테스트
Step 4: useWatermark.ts (40분)
   ↓ 10분간 빌드/테스트
Step 5: 통합 테스트 (30분)
```

**총 예상 시간**: 4시간 ~ 5시간 (테스트 포함)

---

## 3. Step 1: usePolling.ts (난이도: ⭐⭐⭐⭐)

### 3.1 분석 현황

**발견된 폴리 로직 4개:**

| 위치 | 용도 | 특징 |
|------|------|------|
| App.vue lines 611-632 | 선택 객체 탐지 | 간단한 재귀 폴리, 상태 없음 |
| App.vue lines 1073-1113 | 자동 객체 탐지 | progress bar 업데이트 필요 |
| App.vue lines 1186-1211 | 다중 파일 탐지 | Promise 기반, 파일별 진행률 |
| exportStore.js | 일괄 처리 | Store 낮부 상태와 연동 |

### 3.2 구현 계획

```typescript
// src/composables/usePolling.ts

interface PollingOptions {
  /** 폴리 간격 (ms), 기본 1000 */
  interval?: number;
  /** 최대 폴리 시간 (ms), 기본 5분 */
  timeout?: number;
  /** 자동 중지 여부 */
  autoStopOnComplete?: boolean;
}

interface PollingState {
  isPolling: boolean;
  progress: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  error: Error | null;
}

interface UsePollingReturn {
  /** 폴리 시작 */
  startPolling: (jobId: string) => void;
  /** 폴리 중지 */
  stopPolling: () => void;
  /** 현재 상태 (반응형) */
  state: PollingState;
}

/**
 * 진행률 폴리 Composable
 * @param fetchProgress - 진행률 조회 함수
 * @param onProgress - 진행률 업데이트 콜백
 * @param onComplete - 완료 콜백
 * @param onError - 에러 콜백
 * @param options - 폴리 옵션
 */
export function usePolling(
  fetchProgress: (jobId: string) => Promise<{ progress: number; status: string; error?: string }>,
  onProgress: (progress: number, data?: any) => void,
  onComplete: (data?: any) => void,
  onError: (error: Error) => void,
  options?: PollingOptions
): UsePollingReturn;
```

### 3.3 구현 체크리스트

- [ ] `usePolling.ts` 파일 생성
- [ ] `setInterval` 기반 폴리 로직 구현
- [ ] 타임아웃 처리 (선택적)
- [ ] 메모리 누수 방지를 위한 클린업
- [ ] **App.vue** - 선택 객체 탐지에 적용
- [ ] **App.vue** - 자동 객체 탐지에 적용
- [ ] **App.vue** - 다중 파일 탐지에 적용
- [ ] **exportStore.js** - 일괄 처리에 적용
- [ ] 기존 `detectionIntervalId`, `batchIntervalId` 제거

### 3.4 적용 예시

```javascript
// 변경 전 (App.vue)
methods: {
  async autoObjectDetection() {
    // ... API 호출 ...
    this.detectionIntervalId = setInterval(async () => {
      const res = await apiPython.get(`${config.progress}/${jobId}`);
      this.progress = Math.floor(res.data.progress);
      // ... 상태 업데이트 ...
    }, 1000);
  }
}

// 변경 후 (App.vue)
import { usePolling } from './composables/usePolling';

export default {
  setup() {
    const { startPolling, stopPolling, state } = usePolling(
      async (jobId) => {
        const res = await apiPython.get(`${config.progress}/${jobId}`);
        return res.data;
      },
      (progress) => { /* 진행률 업데이트 */ },
      (data) => { /* 완료 처리 */ },
      (error) => { /* 에러 처리 */ }
    );
    return { startPolling, stopPolling, pollingState: state };
  },
  methods: {
    async autoObjectDetection() {
      // ... API 호출 ...
      this.startPolling(jobId);
    }
  }
}
```

---

## 4. Step 2: useVideoConversion.ts (난이도: ⭐⭐⭐)

### 4.1 분석 현황

**분리 대상 메서드:**
- `convertAndPlay` (App.vue lines 1681-1743)
- `convertAndPlayFromPath` (App.vue lines 429-538)

**공통 기능:**
- Electron IPC를 통한 FFmpeg 변환
- 진행률 이벤트 리스너 관리
- 임시 파일 생성/삭제
- 변환 캐시 관리

### 4.2 구현 계획

```typescript
// src/composables/useVideoConversion.ts

interface ConversionOptions {
  videoCodec?: string;  // 기본 'libx264'
  crf?: number;         // 기본 23
  duration?: number;    // 초 단위
}

interface ConversionState {
  isConverting: boolean;
  progress: number;
  currentFile: string;
  error: Error | null;
}

interface ConversionResult {
  url: string;
  filePath: string;
  fileName: string;
}

interface UseVideoConversionReturn {
  /** 파일 객체로 변환 */
  convertFromFile: (
    file: File, 
    options?: ConversionOptions
  ) => Promise<ConversionResult>;
  
  /** 경로로 변환 */
  convertFromPath: (
    filePath: string, 
    options?: ConversionOptions
  ) => Promise<ConversionResult>;
  
  /** 상태 (반응형) */
  state: ConversionState;
  
  /** 캐시 관리 */
  getCachedUrl: (key: string) => string | undefined;
  setCachedUrl: (key: string, url: string) => void;
  clearCache: () => void;
}

export function useVideoConversion(): UseVideoConversionReturn;
```

### 4.3 구현 체크리스트

- [ ] `useVideoConversion.ts` 파일 생성
- [ ] `convertFromFile` 메서드 구현
- [ ] `convertFromPath` 메서드 구현
- [ ] 진행률 이벤트 리스너 자동 등록/제거
- [ ] 캐시 관리 기능 (Map 기반)
- [ ] **App.vue** - `conversionCache` 관리 이전
- [ ] **App.vue** - `convertAndPlay` 메서드 제거
- [ ] **App.vue** - `convertAndPlayFromPath` 메서드 제거
- [ ] 비디오 변환 기능 테스트

### 4.4 적용 예시

```javascript
// 변경 전
convertAndPlay(file, cacheKey) {
  // 60+ 라인의 복잡한 로직
}

// 변경 후 (setup)
const { convertFromFile, state } = useVideoConversion();

// 변경 후 (메서드)
async selectFile(index) {
  // ...
  if (file.file instanceof File) {
    const result = await convertFromFile(file.file);
    this.currentVideoUrl = result.url;
  }
}
```

---

## 5. Step 3: useCanvasDrawing.ts (난이도: ⭐⭐⭐)

### 5.1 분석 현황

**VideoCanvas.vue에서 분리:**
- 좌표 변환: `convertToCanvasCoordinates`, `convertToOriginalCoordinates`
- 그리기: `drawBoundingBoxes`, `drawCSVMasks`, `drawPolygon`, `drawRectangle`
- 유틸리티: `getScale`, `isPointInPolygon`, `getBBoxString`

### 5.2 구현 계획

```typescript
// src/composables/useCanvasDrawing.ts

interface CanvasOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
}

interface Point { x: number; y: number; }

interface BoundingBox { x: number; y: number; w: number; h: number; }

interface DetectionEntry {
  frame: number;
  track_id: string;
  bbox: number[] | number[][];
  bbox_type?: 'rect' | 'polygon';
  score?: number;
  class_id?: number;
}

interface DrawOptions {
  type: 'mosaic' | 'blur';
  level: number;  // 1-5
}

interface UseCanvasDrawingReturn {
  /** 좌표 변환: 원본 → 캔버스 */
  toCanvasCoordinates: (point: Point) => Point;
  /** 좌표 변환: 캔버스 → 원본 */
  toOriginalCoordinates: (event: MouseEvent) => Point;
  /** 디스플레이 스케일 계산 */
  getScale: () => number;
  /** 캔버스 클리어 */
  clearCanvas: () => void;
  /** 탐지 박스 그리기 */
  drawDetectionBoxes: (detections: DetectionEntry[], currentFrame: number) => void;
  /** 마스킹 그리기 (모자이크/블러) */
  drawMasks: (entries: DetectionEntry[], currentFrame: number, options: DrawOptions) => void;
  /** 다각형 그리기 */
  drawPolygon: (points: Point[], closed?: boolean) => void;
  /** 사각형 그리기 */
  drawRectangle: (box: BoundingBox, style?: RectStyle) => void;
  /** 점이 다각형 낮부에 있는지 확인 */
  isPointInPolygon: (point: Point, polygon: Point[]) => boolean;
}

interface RectStyle {
  fillStyle?: string;
  strokeStyle?: string;
  lineWidth?: number;
}

export function useCanvasDrawing(options: CanvasOptions): UseCanvasDrawingReturn;
```

### 5.3 구현 체크리스트

- [ ] `useCanvasDrawing.ts` 파일 생성
- [ ] 좌표 변환 함수 추출
- [ ] `drawBoundingBoxes` 메서드 추출
- [ ] `drawCSVMasks` 메서드 추출 (모자이크/블러)
- [ ] `drawPolygon`, `drawRectangle` 메서드 추출
- [ ] **VideoCanvas.vue** - setup에서 composable 사용
- [ ] **VideoCanvas.vue** - 기존 메서드에서 composable 호출
- [ ] 캔버스 그리기 기능 테스트

### 5.4 적용 예시

```javascript
// VideoCanvas.vue
import { useCanvasDrawing } from '../composables/useCanvasDrawing';

export default {
  setup() {
    // VideoCanvas에서는 mounted 이후 canvas/video 접근 가능
    return {};
  },
  methods: {
    drawBoundingBoxes() {
      const { drawDetectionBoxes, drawMasks, clearCanvas } = useCanvasDrawing({
        canvas: this.$refs.maskingCanvas,
        video: this.video
      });
      
      clearCanvas();
      drawDetectionBoxes(this.detectionResults, this.currentFrame);
      // ...
    }
  }
}
```

---

## 6. Step 4: useWatermark.ts (난이도: ⭐⭐)

### 6.1 분석 현황

**VideoCanvas.vue에서 분리:**
- `drawWatermarkPreview` (lines 687-799, 112라인)
- `getWatermarkCoords`
- `getScale` (useCanvasDrawing과 중복, 위임 필요)

### 6.2 구현 계획

```typescript
// src/composables/useWatermark.ts

interface WatermarkOptions {
  text?: string;
  image?: HTMLImageElement;
  position?: 1 | 2 | 3 | 4 | 5;  // 1-5 위치
  opacity?: number;               // 0-100
}

interface WatermarkState {
  isLoaded: boolean;
  cachedImage: HTMLImageElement | null;
}

interface WatermarkPosition {
  x: number;
  y: number;
}

interface UseWatermarkReturn {
  /** 이미지 워터마크 로드 */
  loadImage: (src: string) => Promise<HTMLImageElement>;
  /** 워터마크 그리기 */
  drawWatermark: (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    options: WatermarkOptions
  ) => void;
  /** 위치 계산 */
  calculatePosition: (
    position: number,
    canvasW: number,
    canvasH: number,
    itemW: number,
    itemH: number
  ) => WatermarkPosition;
  /** 상태 */
  state: WatermarkState;
}

export function useWatermark(): UseWatermarkReturn;
```

### 6.3 구현 체크리스트

- [ ] `useWatermark.ts` 파일 생성
- [ ] `drawWatermarkPreview` 로직 추출
- [ ] 텍스트 워터마크 그리기 분리
- [ ] 이미지 워터마크 그리기 분리
- [ ] 위치 계산 함수 분리
- [ ] **VideoCanvas.vue** - 워터마크 관련 메서드 정리
- [ ] **ConfigStore** - 워터마크 설정과 연동 (필요시)

### 6.4 적용 예시

```javascript
// VideoCanvas.vue
import { useWatermark } from '../composables/useWatermark';

export default {
  setup() {
    const { drawWatermark, loadImage, state } = useWatermark();
    return { drawWatermark, loadImage, watermarkState: state };
  },
  methods: {
    drawBoundingBoxes() {
      // ... 다른 그리기 로직 ...
      
      if (this.isWaterMarking && this.isBoxPreviewing) {
        const canvas = this.$refs.maskingCanvas;
        const ctx = canvas.getContext('2d');
        
        this.drawWatermark(ctx, canvas, this.video, {
          text: this.watermarkText,
          image: this.cachedWatermarkImage,
          position: this.watermarkLocation,
          opacity: this.watermarkTransparency
        });
      }
    }
  }
}
```

---

## 7. 통합 및 테스트

### 7.1 통합 체크리스트

- [ ] **빌드 테스트**: `npm run build` 성공
- [ ] **타입 체크**: TypeScript 오류 없음
- [ ] **단위 테스트**:
  - [ ] 객체 탐지 폴리 동작
  - [ ] 비디오 변환 동작
  - [ ] 캔버스 그리기 동작
  - [ ] 워터마크 표시 동작
- [ ] **통합 테스트**:
  - [ ] 파일 선택 → 재생 → 탐지 → 마스킹 → 내보내기 플로우

### 7.2 롤백 계획

각 Composables 적용 후 Git 커밋을 생성하여 문제 발생 시 롤백 가능하도록 합니다.

```bash
# 각 Step 완료 후 커밋
git add .
git commit -m "refac: add usePolling composable"
git commit -m "refac: add useVideoConversion composable"
git commit -m "refac: add useCanvasDrawing composable"
git commit -m "refac: add useWatermark composable"
```

---

## 8. 파일 생성/수정 목록

### 생성 파일
```
src/
└── composables/
    ├── usePolling.ts         # 150~200라인 예상
    ├── useVideoConversion.ts # 200~250라인 예상
    ├── useCanvasDrawing.ts   # 300~400라인 예상
    └── useWatermark.ts       # 150~200라인 예상
```

### 수정 파일
```
src/
├── App.vue                   # 폴리/변환 로직 정리
└── components/
    └── VideoCanvas.vue       # 캔버스/워터마크 로직 정리
```

---

## 9. 리스크 및 대응

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|-----------|
| 폴리 로직 복잡성 | 높음 | 높음 | 기존 코드 분석 철저, 단계적 적용 |
| Options API와 호환 문제 | 중간 | 중간 | `setup()` 반환값을 methods에서 참조 |
| this 컨텍스트 문제 | 중간 | 중간 | 화살표 함수 사용, 클로저 주의 |
| 캔버스 성능 저하 | 낮음 | 높음 | ref 기반 접근 유지, 불필요한 리렌더 방지 |
| Electron IPC 오류 | 낮음 | 높음 | 기존 API 호출 패턴 유지 |

---

## 10. 참고사항

- **Options API 유지**: `export default { setup() { ... }, methods: { ... } }` 패턴 사용
- **Pinia Store와의 관계**: Store는 상태 관리용, Composables는 로직 재사용용으로 구분
- **타입 정의**: `.ts` 파일로 생성하여 타입 안정성 확보
- **JSDoc 주석**: 한국어로 함수/인터페이스 문서화

---

**다음 단계**: Phase 4 완료 후 Phase 5 (중복 코드 정리) 진행
