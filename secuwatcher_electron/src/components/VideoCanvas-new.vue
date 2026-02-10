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

export default {
  name: 'VideoCanvas',

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

      // --- 마스킹 프리뷰 상태 ---
      isMasking: false,               // 전체 마스킹 프리뷰 실행 중
      maskPreviewAnimationFrame: null, // 프리뷰 애니메이션 프레임 ID

      // --- 애니메이션 루프 ---
      animationFrameId: null,         // 메인 애니메이션 프레임 ID

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
      'hoveredBoxId'
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
      'selectedShape',
      'maskFrameStart',
      'maskFrameEnd'
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
    // Group A: 좌표 변환 (단계 1.3 구현 완료)
    // -------------------------------------------------
    /**
     * 원본 비디오 좌표를 캔버스 좌표로 변환
     * 비디오의 원본 해상도와 캔버스 표시 크기 간의 스케일 변환
     * 
     * @param {Object} point - 원본 좌표 { x, y }
     * @returns {Object} 캔버스 좌표 { x, y }
     */
    convertToCanvasCoordinates(point) {
      const video = this.video;
      const canvas = this.$refs.maskingCanvas;
      if (!video || !canvas) return { x: 0, y: 0 };

      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;
      const containerWidth = video.clientWidth;
      const containerHeight = video.clientHeight;

      // 스케일 계산 (비율 유지)
      const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);

      // 중앙 정렬 오프셋 계산
      const offsetX = (containerWidth - originalWidth * scale) / 2;
      const offsetY = (containerHeight - originalHeight * scale) / 2;

      return {
        x: point.x * scale + offsetX,
        y: point.y * scale + offsetY
      };
    },

    /**
     * 캔버스 상의 마우스 이벤트 좌표를 원본 비디오 좌표로 변환
     * 
     * @param {MouseEvent} event - 마우스 이벤트 객체
     * @returns {Object} 원본 좌표 { x, y } (소수점 버림)
     */
    convertToOriginalCoordinates(event) {
      const canvas = this.$refs.maskingCanvas;
      const video = this.video;
      if (!canvas || !video) return { x: 0, y: 0 };

      // 캔버스 기준 클릭 위치
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;
      const containerWidth = video.clientWidth;
      const containerHeight = video.clientHeight;

      // 스케일 계산 (비율 유지)
      const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);

      // 중앙 정렬 오프셋 계산
      const offsetX = (containerWidth - originalWidth * scale) / 2;
      const offsetY = (containerHeight - originalHeight * scale) / 2;

      // 원본 좌표로 역변환
      const originalX = (clickX - offsetX) / scale;
      const originalY = (clickY - offsetY) / scale;

      return {
        x: Math.floor(originalX),
        y: Math.floor(originalY)
      };
    },

    // -------------------------------------------------
    // Group F: 유틸리티 (단계 1.4 구현 완료)
    // -------------------------------------------------
    /**
     * 마우스 위치에 호버된 객체 박스 확인
     * detectionResults와 maskingLogs에서 겹치는 박스를 찾아 hoveredBoxId 설정
     * 
     * @param {MouseEvent} event - 마우스 이벤트 객체
     */
    checkHoveredBox(event) {
      if (!this.video || !this.$refs.maskingCanvas) return;

      const clickPoint = this.convertToOriginalCoordinates(event);
      const currentFrame = this.getCurrentFrameNormalized() + 1;

      // 겹치는 모든 박스 저장 { track_id, area }
      let overlappingBoxes = [];

      // 1) detectionResults에서 확인 (자동 객체 탐지 결과)
      const currentFrameBoxes = this.detectionResults.filter(
        item => item.frame === Math.floor(this.video.currentTime * this.frameRate)
      );
      for (const result of currentFrameBoxes) {
        if (result.bbox) {
          const coords = result.bbox.split(',').map(Number);
          if (coords.length === 4 && coords.every(num => !isNaN(num))) {
            const [x, y, w, h] = coords;
            if (clickPoint.x >= x && clickPoint.x <= x + w &&
                clickPoint.y >= y && clickPoint.y <= y + h) {
              overlappingBoxes.push({
                track_id: result.track_id,
                area: w * h
              });
            }
          }
        }
      }

      // 2) maskingLogs에서 확인 (CSV 탐지 데이터)
      if (this.dataLoaded) {
        const logs = this.maskingLogsMap[currentFrame] || [];
        for (const log of logs) {
          try {
            const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
            // 사각형 형식 [x0, y0, x1, y1]
            if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
              const [x0, y0, x1, y1] = bboxData;
              if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
                  clickPoint.y >= y0 && clickPoint.y <= y1) {
                overlappingBoxes.push({
                  track_id: log.track_id,
                  area: (x1 - x0) * (y1 - y0)
                });
              }
            }
            // 다각형 형식 [[x1,y1], [x2,y2], ...]
            else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
              const points = bboxData.map(point => ({ x: point[0], y: point[1] }));
              if (this.isPointInPolygon(clickPoint, points)) {
                // 다각형의 bounding box 면적 계산
                const xs = points.map(p => p.x);
                const ys = points.map(p => p.y);
                const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
                overlappingBoxes.push({
                  track_id: log.track_id,
                  area
                });
              }
            }
          } catch (error) {
            console.error('객체 검색 중 오류:', error);
          }
        }
      }

      // 가장 작은 객체 선택 (면적 기준 정렬)
      if (overlappingBoxes.length > 0) {
        overlappingBoxes.sort((a, b) => a.area - b.area);
        this.hoveredBoxId = overlappingBoxes[0].track_id;
      } else {
        this.hoveredBoxId = null;
      }

      // 호버 상태 변경 이벤트 발생
      if (this.lastHoveredBoxId !== this.hoveredBoxId) {
        this.lastHoveredBoxId = this.hoveredBoxId;
        this.$emit('hover-change', this.hoveredBoxId);
      }
    },

    /**
     * 현재 비디오 프레임 번호 계산
     * totalFrames 정보가 있으면 비율 기반, 없으면 프레임레이트 기반 계산
     * 
     * @returns {number} 현재 프레임 (0-based)
     */
    getCurrentFrameNormalized() {
      if (!this.video || !this.video.duration) return 0;

      const currentFile = this.files[this.selectedFileIndex];
      const totalFrames = currentFile?.totalFrames;

      if (totalFrames && typeof totalFrames === 'number') {
        const timeRatio = this.video.currentTime / this.video.duration;
        const frame = Math.floor(timeRatio * totalFrames);
        return Math.max(0, Math.min(frame, totalFrames - 1));
      } else {
        return this.frameRate ? Math.floor(this.video.currentTime * this.frameRate) : 0;
      }
    },

    /**
     * 점이 다각형 남부에 있는지 확인 (ray casting algorithm)
     * 
     * @param {Object} point - 확인할 점 { x, y }
     * @param {Array} polygonPoints - 다각형 점 배열 [{ x, y }, ...]
     * @returns {boolean} 다각형 남부 여부
     */
    isPointInPolygon(point, polygonPoints) {
      let inside = false;
      for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
        const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
        const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 0.00001) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    },

    /**
     * 박스 객체를 문자열 형식으로 변환
     * 
     * @param {Object} box - 박스 객체 { x, y, w, h }
     * @returns {string} JSON 문자열 형식 '[x1, y1, x2, y2]'
     */
    getBBoxString(box) {
      const x1 = Math.round(box.x);
      const y1 = Math.round(box.y);
      const x2 = Math.round(box.x + box.w);
      const y2 = Math.round(box.y + box.h);
      return `[${x1}, ${y1}, ${x2}, ${y2}]`;
    },

    /**
     * 지정된 위치에 있는 객체의 track_id 찾기
     * maskingLogsMap에서 현재 프레임의 객체를 검색하여 가장 작은 객체 반환
     * 
     * @param {Object} clickPoint - 클릭 위치 { x, y }
     * @returns {string|null} track_id 또는 null
     */
    findTrackIdAtPosition(clickPoint) {
      if (!this.maskingLogs || !this.maskingLogs.length) return null;

      const currentFrame = Math.floor(this.video.currentTime * this.frameRate);

      // 현재 프레임에 해당하는 마스킹 로그 (O(1) 조회)
      const logsInCurrentFrame = this.maskingLogsMap[currentFrame] || [];

      // 클릭한 위치에 있는 모든 객체를 찾아 면적 기준으로 정렬
      const candidates = [];

      for (const log of logsInCurrentFrame) {
        try {
          const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;

          // 사각형 형식 [x0, y0, x1, y1] 처리
          if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
            const [x0, y0, x1, y1] = bboxData;
            if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
                clickPoint.y >= y0 && clickPoint.y <= y1) {
              const area = (x1 - x0) * (y1 - y0);
              candidates.push({ track_id: log.track_id, area });
            }
          }
          // 다각형 형식 [[x1,y1], [x2,y2], ...] 처리
          else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
            const points = bboxData.map(point => ({ x: point[0], y: point[1] }));
            if (this.isPointInPolygon(clickPoint, points)) {
              // 다각형의 bounding box 면적 계산
              const xs = points.map(p => p.x);
              const ys = points.map(p => p.y);
              const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
              candidates.push({ track_id: log.track_id, area });
            }
          }
        } catch (error) {
          console.error('객체 검색 중 오류:', error);
        }
      }

      // 면적이 작은 순으로 정렬하여 가장 작은 객체 반환
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.area - b.area);
        return candidates[0].track_id;
      }

      return null; // 해당 위치에 객체가 없음
    },

    // -------------------------------------------------
    // Group I: 워터마크 (단계 1.5 구현 완료)
    // -------------------------------------------------
    /**
     * 워터마크 프리뷰를 캔버스에 그리기
     * 이미지와 텍스트 워터마크를 설정에 따라 표시
     * 
     * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
     * @param {HTMLCanvasElement} canvas - 대상 캔버스
     */
    drawWatermarkPreview(ctx, canvas) {
      if (!this.allConfig) return;
      if (!this.video) return;

      const text = (this.watermarkText || '').trim();
      const hasText = this.isWaterMarking && text.length > 0;
      const hasImage =
        this.isWaterMarking &&
        this.watermarkImage &&
        this.watermarkImageLoaded &&
        this.cachedWatermarkImage;

      if (!hasText && !hasImage) return;

      const originalW = this.video.videoWidth;
      const originalH = this.video.videoHeight;
      if (!originalW || !originalH) return;

      const displayScale = this.getScale();
      const naturalLogoW = hasImage ? this.cachedWatermarkImage.naturalWidth || 0 : 0;
      const naturalLogoH = hasImage ? this.cachedWatermarkImage.naturalHeight || 0 : 0;

      let logoWidth = 0;
      let logoHeight = 0;
      if (hasImage && naturalLogoW > 0 && naturalLogoH > 0) {
        logoWidth = Math.max(1, Math.round(originalW / 10));
        const resizeFactor = logoWidth / naturalLogoW;
        logoHeight = Math.max(1, Math.round(naturalLogoH * resizeFactor));
      }

      // 텍스트만 있을 때를 위해 텍스트 크기 미리 측정
      let textWidth = 0;
      let textHeight = 0;
      if (hasText && !hasImage) {
        const fontSize = Math.max(12, Math.round(18 * displayScale));
        ctx.font = `${fontSize}px sans-serif`;
        const metrics = ctx.measureText(text);
        textWidth = metrics.width / displayScale; // 원본 비디오 크기 기준으로 변환
        textHeight = fontSize / displayScale;
      }

      const margin = 50;
      const location = this.watermarkLocation;

      // 텍스트만 있을 때는 textWidth, textHeight 사용
      const itemWidth = hasImage ? logoWidth : textWidth;
      const itemHeight = hasImage ? logoHeight : textHeight;

      const positions = {
        1: { x: margin, y: margin },
        2: { x: originalW - itemWidth - margin, y: margin },
        3: {
          x: Math.floor((originalW - itemWidth) / 2),
          y: Math.floor((originalH - itemHeight) / 2)
        },
        4: { x: margin, y: originalH - itemHeight - margin },
        5: { x: originalW - itemWidth - margin, y: originalH - itemHeight - margin }
      };
      const pos = positions[location] || positions[4];
      const xOffset = pos.x;
      const yOffset = pos.y;

      // 이미지 워터마크 그리기
      if (hasImage && logoWidth > 0 && logoHeight > 0) {
        const opacity = this.watermarkTransparency;
        const normalizedOpacity = Number.isFinite(opacity)
          ? Math.max(0, Math.min(1, opacity / 100))
          : 0;

        const imgCanvasPos = this.convertToCanvasCoordinates({ x: xOffset, y: yOffset });
        const drawW = logoWidth * displayScale;
        const drawH = logoHeight * displayScale;

        ctx.save();
        ctx.globalAlpha = normalizedOpacity;
        ctx.drawImage(this.cachedWatermarkImage, imgCanvasPos.x, imgCanvasPos.y, drawW, drawH);
        ctx.restore();
      }

      // 텍스트 워터마크 그리기
      if (hasText) {
        const fontSize = Math.max(12, Math.round(18 * displayScale));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(1, Math.round(fontSize / 6));

        const metrics = ctx.measureText(text);
        const drawTextWidth = metrics.width;
        const drawTextHeight = fontSize;

        let textCanvasX, textCanvasY;

        // 이미지와 함께 있을 때: 이미지 아래 중앙
        if (hasImage) {
          const imgCanvasPos = this.convertToCanvasCoordinates({ x: xOffset, y: yOffset });
          const drawW = logoWidth * displayScale;
          const drawH = logoHeight * displayScale;
          const marginCanvas = Math.max(2, Math.round(5 * displayScale));

          textCanvasX = imgCanvasPos.x + (drawW - drawTextWidth) / 2;
          textCanvasY = imgCanvasPos.y + drawH + drawTextHeight + marginCanvas;
        } else {
          // 텍스트만 있을 때: 원래 위치
          const baseCanvasPos = this.convertToCanvasCoordinates({ x: xOffset, y: yOffset });
          textCanvasX = baseCanvasPos.x;
          textCanvasY = baseCanvasPos.y + drawTextHeight;
        }

        ctx.strokeText(text, textCanvasX, textCanvasY);
        ctx.fillText(text, textCanvasX, textCanvasY);
      }
    },

    /**
     * 비디오 디스플레이 스케일 계산
     * 원본 해상도 대비 실제 표시 크기의 비율
     * 
     * @returns {number} 스케일 비율
     */
    getScale() {
      if (!this.video) return 1;
      const originalW = this.video.videoWidth;
      const originalH = this.video.videoHeight;
      const containerW = this.video.clientWidth;
      const containerH = this.video.clientHeight;
      if (!originalW || !originalH) return 1;
      return Math.min(containerW / originalW, containerH / originalH);
    },

    /**
     * 워터마크 위치 계산 (문자열 키 기반)
     * 
     * @param {string} position - 위치 키 ('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center')
     * @param {number} canvasW - 캔버스 너비
     * @param {number} canvasH - 캔버스 높이
     * @param {number} itemW - 아이템 너비
     * @param {number} itemH - 아이템 높이
     * @returns {Object} 위치 좌표 { x, y }
     */
    getWatermarkCoords(position, canvasW, canvasH, itemW, itemH) {
      switch (position) {
        case 'top-left': return { x: 10, y: 10 };
        case 'top-right': return { x: canvasW - itemW - 10, y: 10 };
        case 'bottom-left': return { x: 10, y: canvasH - itemH - 10 };
        case 'bottom-right': return { x: canvasW - itemW - 20, y: canvasH - itemH - 20 };
        case 'center':
        default:
          return {
            x: (canvasW - itemW) / 2,
            y: (canvasH - itemH) / 2
          };
      }
    },

    // -------------------------------------------------
    // Group B: 그리기 (단계 1.6에서 구현)
    // -------------------------------------------------
    drawBoundingBoxes() {
      // TODO: 단계 1.6 구현
    },

    drawCSVMasks(ctx, currentFrame) {
      // TODO: 단계 1.6 구현
    },

    drawDetectionBoxes(ctx, video) {
      // TODO: 단계 1.6 구현
    },

    drawPolygon() {
      // TODO: 단계 1.6 구현
    },

    drawRectangle() {
      // TODO: 단계 1.6 구현
    },

    resizeCanvas() {
      // TODO: 단계 1.6 구현
    },

    resizeMaskCanvas() {
      // TODO: 단계 1.6 구현
    },

    // -------------------------------------------------
    // Group C: 마스킹 프리뷰 (단계 1.7에서 구현)
    // -------------------------------------------------
    startMaskPreview() {
      // TODO: 단계 1.7 구현
    },

    stopMaskPreview() {
      // TODO: 단계 1.7 구현
    },

    applyEffectFull(ctx, ow, oh) {
      // TODO: 단계 1.7 구현
    },

    // -------------------------------------------------
    // Group D: 마우스 이벤트 (단계 1.8에서 구현)
    // -------------------------------------------------
    onCanvasClick(event) {
      // TODO: 단계 1.8 구현
      this.$emit('canvas-click', event);
    },

    onCanvasMouseDown(event) {
      // TODO: 단계 1.8 구현
    },

    onCanvasMouseMove(event) {
      // TODO: 단계 1.8 구현
    },

    onCanvasMouseUp(event) {
      // TODO: 단계 1.8 구현
    },

    onCanvasContextMenu(event) {
      // TODO: 단계 1.8 구현
    },

    // -------------------------------------------------
    // Group E: 데이터 관리 (단계 1.9에서 구현)
    // -------------------------------------------------
    logMasking() {
      // TODO: 단계 1.9 구현
    },

    saveMaskingEntry(frame, bbox) {
      // TODO: 단계 1.9 구현
    },

    saveManualMaskingEntry(frame, bbox) {
      // TODO: 단계 1.9 구현
    },

    sendBatchMaskingsToBackend() {
      // TODO: 단계 1.9 구현
    },

    rebuildMaskingLogsMap() {
      // TODO: 단계 1.9 구현
    },

    addToMaskingLogsMap(entry) {
      // TODO: 단계 1.9 구현
    },

    checkBiggestTrackId(typeNum) {
      // TODO: 단계 1.9 구현
    },

    // -------------------------------------------------
    // Group G: 애니메이션 루프 (단계 1.10에서 구현)
    // -------------------------------------------------
    startAnimationLoop() {
      // TODO: 단계 1.10 구현
    },

    stopAnimationLoop() {
      // TODO: 단계 1.10 구현
    },

    // -------------------------------------------------
    // Group H: 비디오 생명주기 (단계 1.11에서 구현)
    // -------------------------------------------------
    onVideoLoaded() {
      // TODO: 단계 1.11 구현
    },

    onVideoEnded() {
      // TODO: 단계 1.11 구현
    },

    loadVideo(src) {
      // TODO: 단계 1.11 구현
    },

    // -------------------------------------------------
    // 유틸리티
    // -------------------------------------------------
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
