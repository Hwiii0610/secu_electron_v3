<template>
  <div class="video-container">
    <!-- 비디오 엘리먼트 -->
    <video 
      id="video" 
      ref="videoPlayer" 
      class="video-player"
      @loadedmetadata="onVideoLoaded"
      @ended="onVideoEnded"
    ></video>

    <!-- 비디오 변환 오버레이 -->
    <div v-if="conversion.inProgress" class="conversion-overlay">
      <div class="conversion-info">
        <h4>{{ conversion.currentFile }} 변환 중...</h4>
        <div class="conversion-progress-bar">
          <div class="conversion-progress-fill" :style="{ width: conversion.progress + '%' }"></div>
        </div>
        <p>진행률: {{ conversion.progress }}%</p>
        <p>재생을 위해 MP4로 변환하고 있습니다.</p>
      </div>
    </div>

    <!-- 전체 마스킹 프리뷰 캔버스 -->
    <canvas
      ref="maskPreview"
      class="mask-preview-canvas"
      :style="{ display: exportAllMasking === 'Yes' ? 'block' : 'none' }"
    ></canvas>

    <!-- 마스킹/바울링박스 캔버스 -->
    <canvas
      ref="maskingCanvas"
      id="canvas"
      @click="onCanvasClick"
      @mousedown="onCanvasMouseDown"
      @mousemove="onCanvasMouseMove"
      @mouseup="onCanvasMouseUp"
      @contextmenu.prevent="onCanvasContextMenu"
      :style="{ pointerEvents: selectMode ? 'auto' : 'none' }"
    ></canvas>
  </div>
</template>

<script>
/**
 * VideoCanvas 컴포넌트
 * 
 * 비디오 재생, 캔버스 오버레이, 마스킹, 객체 탐지 표시를 담당
 * App.vue로부터 비디오 소스와 상태를 받아 캔버스를 렌더링
 * 
 * @author AI Assistant
 * @version 1.0.0
 */

import { mapWritableState, mapState } from 'pinia';
import { useVideoStore } from '../stores/videoStore';
import { useFileStore } from '../stores/fileStore';
import { useDetectionStore } from '../stores/detectionStore';
import { useModeStore } from '../stores/modeStore';
import { useConfigStore } from '../stores/configStore';
import { createMaskingDataManager } from '../composables/maskingData';
import { createCanvasDrawing } from '../composables/canvasDrawing';
import { createCanvasInteraction } from '../composables/canvasInteraction';
import { createMaskPreview } from '../composables/maskPreview';

export default {
  name: 'VideoCanvas',

  // =====================================================
  // Expose: 부모 컴포넌트(App.vue)에서 접근 가능한 멤버
  // =====================================================
  expose: ['videoPlayer', 'drawBoundingBoxes', 'startMaskPreview', 'stopMaskPreview'],

  // =====================================================
  // Props: App.vue로부터 받는 데이터
  // =====================================================
  props: {
    /**
     * 비디오 소스 URL
     * local-video:// 프로토콜 또는 file:// 프로토콜
     */
    videoSrc: {
      type: String,
      default: ''
    },

    /**
     * 선택된 파일 정보
     * 현재 재생 중인 파일의 메타데이터
     */
    selectedFile: {
      type: Object,
      default: () => null
    },

    /**
     * 워터마크 이미지 데이터 URL
     * 설정된 워터마크 이미지
     */
    watermarkImage: {
      type: String,
      default: null
    },

    /**
     * 캐시된 워터마크 Image 객체
     * preload된 이미지 객체
     */
    cachedWatermarkImage: {
      type: Image,
      default: null
    },

    /**
     * 워터마크 이미지 로드 여부
     */
    watermarkImageLoaded: {
      type: Boolean,
      default: false
    }
  },

  // =====================================================
  // Emits: App.vue로 볼내는 이벤트
  // =====================================================
  emits: {
    /**
     * 캔버스 클릭 이벤트
     * @param {MouseEvent} event - 원본 마우스 이벤트
     * @param {Object} coordinate - 변환된 원본 좌표 {x, y}
     * @param {number} frame - 현재 프레임
     */
    'canvas-click': (event, coordinate, frame) => true,

    /**
     * 선택 객체 탐지 요청
     * @param {Object} payload - 탐지 요청 데이터 {x, y, frame, videoName}
     */
    'object-detect': (payload) => true,

    /**
     * 마스킹 데이터 저장
     * @param {Object} entry - 마스킹 엔트리
     */
    'masking-save': (entry) => true,

    /**
     * 배치 마스킹 서버 동기화 요청
     * @param {Array} entries - 마스킹 엔트리 배열
     */
    'masking-batch': (entries) => true,

    /**
     * 컨텍스트 메뉴 표시 요청
     * @param {Object} payload - {x, y, trackId, clientX, clientY}
     */
     'context-menu': (payload) => true,

    /**
     * 비디오 로드 완료
     * @param {Object} videoInfo - 비디오 메타데이터
     */
    'video-loaded': (videoInfo) => true,

    /**
     * 비디오 종료
     */
    'video-ended': () => true,

    /**
     * 호버 상태 변경
     * @param {string|null} trackId - 호버된 객체의 track_id
     */
    'hover-change': (trackId) => true,

    /**
     * 프레임 업데이트
     * @param {number} frame - 현재 프레임
     */
    'frame-update': (frame) => true,

    /**
     * 에러 발생
     * @param {Error} error - 에러 객체
     */
    'error': (error) => true
  },

  // =====================================================
  // Data: 컴포넌트 낭부 상태
  // =====================================================
  data() {
    return {
      // --- 캔버스 관련 refs (template ref와 별개) ---
      video: null,                    // video 엘리먼트 참조 (this.$refs.videoPlayer)
      maskCanvas: null,               // maskPreview 캔버스
      maskCtx: null,                  // maskPreview context
      tmpCanvas: null,                // 임시 캔버스 (createElement)
      tmpCtx: null,                   // 임시 캔버스 context

      // --- 마우스 상태 ---
      lastHoveredBoxId: null,         // 마지막 호버된 박스 ID (최적화용)
    };
  },

  // =====================================================
  // Computed: Store 연결
  // =====================================================
  computed: {
    // --- VideoStore ---
    ...mapWritableState(useVideoStore, [
      'currentTime',
      'totalTime', 
      'progress',
      'videoPlaying',
      'zoomLevel',
      'frameRate',
      'videoDuration',
      'currentPlaybackRate',
      'currentFrame',
      'previousFrame',
      'conversion'
    ]),

    // --- FileStore ---
    ...mapWritableState(useFileStore, [
      'files',
      'selectedFileIndex'
    ]),

    // --- DetectionStore ---
    ...mapWritableState(useDetectionStore, [
      'maskingLogs',
      'maskingLogsMap',
      'newMaskings',
      'dataLoaded',
      'detectionResults',
      'isDetecting',
      'hasSelectedDetection',
      'manualBiggestTrackId',
      'maskBiggestTrackId',
      'hoveredBoxId',
      'maskFrameStart',
      'maskFrameEnd'
    ]),

    // --- ModeStore ---
    ...mapWritableState(useModeStore, [
      'currentMode',
      'selectMode',
      'isBoxPreviewing',
      'exportAllMasking',
      'maskMode',
      'maskCompleteThreshold',
      'maskingPoints',
      'isDrawingMask',
      'isPolygonClosed',
      'manualBox',
      'isDrawingManualBox',
      'isDraggingManualBox',
      'dragOffset',
      'contextMenuVisible',
      'contextMenuPosition',
      'selectedShape'
    ]),

    // --- ConfigStore ---
    ...mapWritableState(useConfigStore, [
      'allConfig',
      'isWaterMarking'
    ]),

    // --- Read-only Store State ---
    ...mapState(useVideoStore, [
      // 필요한 read-only state
    ]),

    /**
     * 현재 선택된 파일명
     */
    currentVideoName() {
      return this.files[this.selectedFileIndex]?.name || '';
    },

    /**
     * 마스킹 툴 타입 (0: 모자이크, 1: 블러)
     */
    maskingTool() {
      return this.allConfig?.export?.maskingtool === '0' ? 'mosaic' : 'blur';
    },

    /**
     * 마스킹 강도 (1-5)
     */
    maskingStrength() {
      return Number(this.allConfig?.export?.maskingstrength) || 5;
    },

    /**
     * 워터마크 위치 (1-5)
     */
    watermarkLocation() {
      return Number(this.allConfig?.export?.waterlocation) || 4;
    },

    /**
     * 워터마크 투명도 (0-100)
     */
    watermarkTransparency() {
      return Number(this.allConfig?.export?.watertransparency) || 100;
    },

    /**
     * 워터마크 텍스트
     */
    watermarkText() {
      return this.allConfig?.export?.watertext || '';
    }
  },

  // =====================================================
  // Watch: Prop 변경 감시
  // =====================================================
  watch: {
    /**
     * 비디오 소스 변경 시 로드
     */
    videoSrc: {
      immediate: true,
      handler(newSrc) {
        if (newSrc && this.video) {
          this.loadVideo(newSrc);
        }
      }
    },

    /**
     * 전체 마스킹 토글
     */
    exportAllMasking(newVal) {
      if (newVal === 'Yes') {
        this.startMaskPreview();
      } else {
        this.stopMaskPreview();
      }
    },

    /**
     * 줌 레벨 변경 시 비디오 스타일 업데이트
     */
    zoomLevel(newVal) {
      if (this.video) {
        this.video.style.transform = `scale(${newVal})`;
      }
    }
  },

  // =====================================================
  // Lifecycle Hooks
  // =====================================================
  mounted() {
    // 비디오 엘리먼트 참조 설정
    this.video = this.$refs.videoPlayer;

    // 임시 캔버스 생성
    this.tmpCanvas = document.createElement('canvas');
    this.tmpCtx = this.tmpCanvas.getContext('2d');

    // 컴포저블 초기화
    const stores = () => ({
      detection: useDetectionStore(),
      mode: useModeStore(),
      file: useFileStore(),
      video: useVideoStore(),
      config: useConfigStore()
    });

    this._masking = createMaskingDataManager({
      getStores: stores,
      getVideo: () => this.video
    });

    this._drawing = createCanvasDrawing({
      getVideo: () => this.video,
      getCanvas: () => this.$refs.maskingCanvas,
      getTmpCanvas: () => this.tmpCanvas,
      getTmpCtx: () => this.tmpCtx,
      getStores: stores,
      getProps: () => ({
        watermarkImage: this.watermarkImage,
        cachedWatermarkImage: this.cachedWatermarkImage,
        watermarkImageLoaded: this.watermarkImageLoaded
      })
    });

    this._interaction = createCanvasInteraction({
      getVideo: () => this.video,
      getCanvas: () => this.$refs.maskingCanvas,
      drawing: this._drawing,
      masking: this._masking,
      emit: (...args) => this.$emit(...args),
      getStores: stores,
      getLastHoveredBoxId: () => this.lastHoveredBoxId,
      setLastHoveredBoxId: (id) => { this.lastHoveredBoxId = id; }
    });

    this._preview = createMaskPreview({
      getVideo: () => this.video,
      getMaskCanvas: () => this.maskCanvas,
      getMaskCtx: () => this.maskCtx,
      getTmpCanvas: () => this.tmpCanvas,
      getTmpCtx: () => this.tmpCtx,
      drawing: this._drawing,
      masking: this._masking,
      getStores: stores,
      formatTime: (s) => this.formatTime(s)
    });

    // 윈도우 리사이즈 이벤트 등록
    window.addEventListener('resize', this.handleResize);

    // 비디오 소스가 있으면 로드
    if (this.videoSrc) {
      this.loadVideo(this.videoSrc);
    }
  },

  beforeUnmount() {
    // 이벤트 리스너 제거
    window.removeEventListener('resize', this.handleResize);

    // 애니메이션 루프 정지
    this.stopAnimationLoop();

    // 마스킹 프리뷰 정지
    this.stopMaskPreview();

    // 배치 데이터 동기화
    if (this.newMaskings.length > 0) {
      this.$emit('masking-batch', [...this.newMaskings]);
    }

    // 임시 캔버스 정리
    this.tmpCanvas = null;
    this.tmpCtx = null;
  },

  // =====================================================
  // Methods: 메서드는 단계별로 구현 예정
  // =====================================================
  methods: {
    // -------------------------------------------------
    // Group A: 좌표 변환 → composables/canvasDrawing.js 위임
    // -------------------------------------------------
    convertToCanvasCoordinates(point) { return this._drawing.convertToCanvasCoordinates(point); },
    convertToOriginalCoordinates(event) { return this._drawing.convertToOriginalCoordinates(event); },

    // -------------------------------------------------
    // Group F: 유틸리티 → composables/canvasInteraction.js 위임
    // -------------------------------------------------
    checkHoveredBox(event) { this._interaction.checkHoveredBox(event); },
    getCurrentFrameNormalized() { return this._drawing.getCurrentFrameNormalized(); },
    findTrackIdAtPosition(clickPoint) { return this._interaction.findTrackIdAtPosition(clickPoint); },

    // -------------------------------------------------
    // Group I: 워터마크 → composables/canvasDrawing.js 위임
    // -------------------------------------------------
    drawWatermarkPreview(ctx, canvas) { this._drawing.drawWatermarkPreview(ctx, canvas); },
    getScale() { return this._drawing.getScale(); },
    getWatermarkCoords(position, canvasW, canvasH, itemW, itemH) {
      return this._drawing.getWatermarkCoords(position, canvasW, canvasH, itemW, itemH);
    },

    // -------------------------------------------------
    // Group B: 그리기 → composables/canvasDrawing.js 위임
    // -------------------------------------------------
    drawBoundingBoxes() { this._drawing.drawBoundingBoxes(); },
    drawCSVMasks(ctx, currentFrame) { this._drawing.drawCSVMasks(ctx, currentFrame); },
    drawDetectionBoxes(ctx, video) { this._drawing.drawDetectionBoxes(ctx, video); },
    drawPolygon() { this._drawing.drawPolygon(); },
    drawRectangle() { this._drawing.drawRectangle(); },
    resizeCanvas() { this._drawing.resizeCanvas(); },
    resizeMaskCanvas() { this._drawing.resizeMaskCanvas(this.maskCanvas); },

    // -------------------------------------------------
    // Group C: 마스킹 프리뷰 → composables/maskPreview.js 위임
    // -------------------------------------------------
    startMaskPreview() { this._preview.startMaskPreview(); },
    stopMaskPreview() { this._preview.stopMaskPreview(); },
    applyEffectFull(ctx, ow, oh) { this._preview.applyEffectFull(ctx, ow, oh); },

    // -------------------------------------------------
    // Group D: 마우스 이벤트 → composables/canvasInteraction.js 위임
    // -------------------------------------------------
    async onCanvasClick(event) { return this._interaction.onCanvasClick(event); },
    onCanvasMouseDown(event) { this._interaction.onCanvasMouseDown(event); },
    onCanvasMouseMove(event) { this._interaction.onCanvasMouseMove(event); },
    onCanvasMouseUp(event) { this._interaction.onCanvasMouseUp(event); },
    onCanvasContextMenu(event) { this._interaction.onCanvasContextMenu(event); },

    // -------------------------------------------------
    // Group E: 데이터 관리 → composables/maskingData.js 위임
    // -------------------------------------------------
    logMasking() { this._masking.logMasking(); },
    saveMaskingEntry(frame, bbox) { this._masking.saveMaskingEntry(frame, bbox); },
    saveManualMaskingEntry(frame, bbox) { this._masking.saveManualMaskingEntry(frame, bbox); },
    async sendBatchMaskingsToBackend() { return this._masking.sendBatchMaskingsToBackend(); },
    rebuildMaskingLogsMap() { useDetectionStore().rebuildMaskingLogsMap(); },
    addToMaskingLogsMap(entry) { useDetectionStore().addToMaskingLogsMap(entry); },
    checkBiggestTrackId(typeNum) { this._masking.checkBiggestTrackId(typeNum); },

    // -------------------------------------------------
    // Group G: 애니메이션 루프 → composables/maskPreview.js 위임
    // -------------------------------------------------
    startAnimationLoop() { this._preview.startAnimationLoop(); },
    stopAnimationLoop() { this._preview.stopAnimationLoop(); },

    // -------------------------------------------------
    // Group H: 비디오 생명주기 (단계 1.11 구현 완료)
    // -------------------------------------------------
    /**
     * 비디오 로드 완료 이벤트 핸들러
     * 재생 속도 초기화, 캔버스 설정, 애니메이션 루프 시작
     */
    onVideoLoaded() {
      if (!this.video) return;

      // 재생 속도 초기화
      this.video.playbackRate = 1;
      this.currentPlaybackRate = 1;

      // 비디오 메타데이터 저장
      this.videoDuration = this.video.duration;
      this.totalTime = this.formatTime(this.video.duration);

      // 캔버스 크기 조정
      this.resizeCanvas();
      this.resizeMaskCanvas();

      // 마스크 프리뷰용 캔버스 초기화
      this.maskCanvas = this.$refs.maskPreview;
      if (this.maskCanvas) {
        this.maskCtx = this.maskCanvas.getContext('2d');
      }

      // 초기 그리기
      this.drawBoundingBoxes();

      // 애니메이션 루프 시작
      this.startAnimationLoop();

      // 이벤트 발생
      this.$emit('video-loaded', {
        duration: this.video.duration,
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        frameRate: this.frameRate
      });
    },

    /**
     * 비디오 종료 이벤트 핸들러
     * 상태 정리, 배치 동기화, 캔버스 클리어
     */
    async onVideoEnded() {
      this.videoPlaying = false;

      // 남은 마스킹 데이터 동기화
      if (this.newMaskings.length > 0) {
        await this.sendBatchMaskingsToBackend();
      }

      // 캔버스 클리어
      const canvas = this.$refs.maskingCanvas;
      if (canvas) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      }

      // manual 박스 초기화
      this.manualBox = null;

      // 마지막 그리기
      this.drawBoundingBoxes();

      // 이벤트 발생
      this.$emit('video-ended');
    },

    /**
     * 비디오 소스 로드
     * 
     * @param {string} src - 비디오 소스 URL
     */
    loadVideo(src) {
      if (!this.video) return;

      // 현재 재생 상태 저장
      const wasPlaying = !this.video.paused;

      // 비디오 소스 설정
      this.video.src = src;
      this.video.load();

      // 메타데이터 로드 대기
      this.video.addEventListener('loadedmetadata', () => {
        this.onVideoLoaded();

        // 이전에 재생 중이었다면 자동 재생
        if (wasPlaying) {
          this.video.play().catch(() => {
            // 자동 재생 실패 (정책 등)
          });
        }
      }, { once: true });
    },

    // -------------------------------------------------
    // 유틸리티
    // -------------------------------------------------
    /**
     * 윈도우 리사이즈 핸들러
     */
    handleResize() {
      this.resizeCanvas();
      this.resizeMaskCanvas();
    },

    formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return '00:00';
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }
};
</script>

<style scoped>
.video-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.video-player {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.mask-preview-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
}

#canvas {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
}

.conversion-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 20;
}

.conversion-info {
  color: white;
  text-align: center;
}

.conversion-progress-bar {
  width: 300px;
  height: 20px;
  background: #333;
  border-radius: 10px;
  overflow: hidden;
  margin: 10px auto;
}

.conversion-progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s ease;
}
</style>
