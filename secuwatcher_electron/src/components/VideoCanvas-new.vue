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
    // Group B: 그리기 (단계 1.6 구현 완료)
    // -------------------------------------------------
    /**
     * 메인 바울링 박스 그리기 루프
     * 모든 그리기 요소(탐지 박스, 마스킹, 워터마크)를 순서대로 그림
     */
    drawBoundingBoxes() {
      const video = this.video;
      const canvas = this.$refs.maskingCanvas;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. 탐지 박스 그리기
      this.drawDetectionBoxes(ctx, video);

      // 2. 수동 박스 그리기 (manual 모드)
      if (this.currentMode === 'manual' && this.manualBox) {
        const { x, y, w, h } = this.manualBox;
        const topLeft = this.convertToCanvasCoordinates({ x, y });
        const bottomRight = this.convertToCanvasCoordinates({ x: x + w, y: y + h });

        const rectX = topLeft.x;
        const rectY = topLeft.y;
        const rectW = bottomRight.x - topLeft.x;
        const rectH = bottomRight.y - topLeft.y;

        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
      }

      // 3. CSV 마스킹 그리기 (dataLoaded 상태)
      const currentFrame = this.getCurrentFrameNormalized() + 1;
      if (this.dataLoaded) {
        this.drawCSVMasks(ctx, currentFrame);
      }

      // 4. 마스킹 모드 그리기
      if (this.currentMode === 'mask') {
        if (this.maskFrameStart !== null && this.maskFrameEnd !== null &&
            (currentFrame < this.maskFrameStart || currentFrame > this.maskFrameEnd)) {
          return;
        }
        if (this.maskMode === 'polygon' && this.maskingPoints.length > 0) {
          this.drawPolygon();
        }
        if (this.maskMode === 'rectangle' && this.maskingPoints.length === 2) {
          this.drawRectangle();
        }
      }

      // 5. 워터마크 그리기 (미리보기 모드)
      if (this.isWaterMarking && this.isBoxPreviewing) {
        this.drawWatermarkPreview(ctx, canvas);
      }
    },

    /**
     * CSV 파일에서 불러온 마스킹 정보 그리기 (모자이크/블러 처리)
     * 
     * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
     * @param {number} currentFrame - 현재 프레임
     */
    drawCSVMasks(ctx, currentFrame) {
      const video = this.video;
      const tmp = this.tmpCanvas;
      const tmpCtx = this.tmpCtx;
      if (!video || !tmp || !tmpCtx) return;

      // 원본 해상도
      const origW = video.videoWidth;
      const origH = video.videoHeight;
      if (!origW || !origH) return;

      // 1) tmpCanvas에 원본 프레임 그려두기
      tmp.width = origW;
      tmp.height = origH;
      tmpCtx.clearRect(0, 0, origW, origH);
      tmpCtx.drawImage(video, 0, 0, origW, origH);

      // 2) 비디오가 화면에 실제 표시되는 크기/위치 구하기
      const rect = video.getBoundingClientRect();
      const dispW = rect.width;
      const dispH = rect.height;
      const scale = Math.min(dispW / origW, dispH / origH);
      const offsetX = (dispW - origW * scale) / 2;
      const offsetY = (dispH - origH * scale) / 2;

      // 3) 이 프레임에 해당하는 로그만 골라냄 (O(1) 조회)
      const logs = this.maskingLogsMap[currentFrame] || [];

      // 4) 설정값
      const type = this.maskingTool; // 'mosaic' or 'blur'
      const lvl = this.maskingStrength; // 1-5

      // 5) 헬퍼: 원본 좌표 → 캔버스 픽셀 좌표
      const toCanvas = (x, y) => ({
        x: x * scale + offsetX,
        y: y * scale + offsetY
      });

      // 6) 헬퍼: 모자이크/블러 처리
      const applyMosaic = (sx, sy, sw, sh, dx, dy, dw, dh) => {
        const tileW = Math.max(1, Math.floor(dw / (lvl + 4)));
        const tileH = Math.max(1, Math.floor(dh / (lvl + 4)));
        ctx.drawImage(tmp, sx, sy, sw, sh, dx, dy, tileW, tileH);
        ctx.drawImage(ctx.canvas, dx, dy, tileW, tileH, dx, dy, dw, dh);
        ctx.imageSmoothingEnabled = false;
      };

      const applyBlur = (sx, sy, sw, sh, dx, dy, dw, dh) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);
        tempCtx.filter = `blur(${lvl + 4}px)`;
        tempCtx.drawImage(tempCanvas, 0, 0);
        ctx.drawImage(tempCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
      };

      const applyEffect = (sx, sy, sw, sh, dx, dy, dw, dh) => {
        if (type === 'mosaic') applyMosaic(sx, sy, sw, sh, dx, dy, dw, dh);
        else applyBlur(sx, sy, sw, sh, dx, dy, dw, dh);
      };

      // 전체 마스킹 프리뷰
      if (this.exportAllMasking === 'Yes') {
        applyEffect(0, 0, origW, origH, offsetX, offsetY, origW * scale, origH * scale);
        return;
      }

      // 개별 마스킹 처리
      for (const log of logs) {
        try {
          const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;

          // 사각형 형식 [x0, y0, x1, y1]
          if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
            const [x0, y0, x1, y1] = bboxData;
            const topLeft = toCanvas(x0, y0);
            const bottomRight = toCanvas(x1, y1);
            applyEffect(x0, y0, x1 - x0, y1 - y0, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
          }
          // 다각형 형식 [[x1,y1], [x2,y2], ...]
          else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
            const points = bboxData.map(p => toCanvas(p[0], p[1]));
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
              ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.clip();

            // 다각형 영역의 bounding box 계산
            const xs = points.map(p => p.x);
            const ys = points.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);

            applyEffect(minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
            ctx.restore();
          }
        } catch (error) {
          console.error('마스킹 처리 중 오류:', error);
        }
      }
    },

    /**
     * 탐지 결과 바울링 박스 그리기
     * 
     * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
     * @param {HTMLVideoElement} video - 비디오 엘리먼트
     */
    drawDetectionBoxes(ctx, video) {
      const originalWidth = video.videoWidth;
      const originalHeight = video.videoHeight;
      if (!originalWidth || !originalHeight) return;

      const containerWidth = video.clientWidth;
      const containerHeight = video.clientHeight;
      const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
      const offsetX = (containerWidth - originalWidth * scale) / 2;
      const offsetY = (containerHeight - originalHeight * scale) / 2;

      ctx.font = '14px Arial';
      ctx.fillStyle = 'red';
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;

      const currentFrame = Math.floor(video.currentTime * this.frameRate);
      const currentFrameBoxes = this.detectionResults.filter(item => item.frame === currentFrame);

      currentFrameBoxes.forEach(result => {
        if (result.bbox) {
          const coords = result.bbox.split(',').map(Number);
          if (coords.length === 4 && coords.every(num => !isNaN(num))) {
            let [x, y, w, h] = coords;
            x = x * scale + offsetX;
            y = y * scale + offsetY;
            w = w * scale;
            h = h * scale;

            // 호버 상태에 따라 색상 변경
            const isHovered = this.hoveredBoxId === result.track_id;
            ctx.strokeStyle = isHovered ? 'orange' : 'red';
            ctx.fillStyle = isHovered ? 'orange' : 'red';

            // 호버 시 내부 불투명하게 채우기
            if (isHovered) {
              ctx.save();
              ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
              ctx.fillRect(x, y, w, h);
              ctx.restore();
            }

            ctx.strokeRect(x, y, w, h);
            ctx.fillText(`ID: ${result.track_id}`, x, y - 5);
          }
        }
      });
    },

    /**
     * 다각형 마스킹 그리기
     */
    drawPolygon() {
      const canvas = this.$refs.maskingCanvas;
      const video = this.video;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawDetectionBoxes(ctx, video);

      const currentFrame = Math.floor(video.currentTime * this.frameRate);
      if (this.maskFrameStart !== null && this.maskFrameEnd !== null &&
          (currentFrame < this.maskFrameStart || currentFrame > this.maskFrameEnd)) {
        return;
      }

      if (this.maskingPoints.length === 0) return;
      const complete = this.isPolygonClosed;

      ctx.beginPath();
      const first = this.convertToCanvasCoordinates(this.maskingPoints[0]);
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < this.maskingPoints.length; i++) {
        const pt = this.convertToCanvasCoordinates(this.maskingPoints[i]);
        ctx.lineTo(pt.x, pt.y);
      }

      if (complete) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fill();
      }

      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 꼭지점 표시
      this.maskingPoints.forEach((point) => {
        const cp = this.convertToCanvasCoordinates(point);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
      });
    },

    /**
     * 사각형 마스킹 그리기
     */
    drawRectangle() {
      const canvas = this.$refs.maskingCanvas;
      const video = this.video;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.drawDetectionBoxes(ctx, video);

      const currentFrame = Math.floor(video.currentTime * this.frameRate);
      if (this.maskFrameStart !== null && this.maskFrameEnd !== null &&
          (currentFrame < this.maskFrameStart || currentFrame > this.maskFrameEnd)) {
        return;
      }

      if (this.maskingPoints.length === 2) {
        const p0 = this.convertToCanvasCoordinates(this.maskingPoints[0]);
        const p1 = this.convertToCanvasCoordinates(this.maskingPoints[1]);
        const rectX = Math.min(p0.x, p1.x);
        const rectY = Math.min(p0.y, p1.y);
        const rectW = Math.abs(p1.x - p0.x);
        const rectH = Math.abs(p1.y - p0.y);

        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(rectX, rectY, rectW, rectH);

        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectX, rectY, rectW, rectH);
      }
    },

    /**
     * 마스킹 캔버스 크기 조정
     */
    resizeCanvas() {
      const canvas = this.$refs.maskingCanvas;
      const video = this.video;
      if (canvas && video) {
        const rect = video.getBoundingClientRect();
        const displayedWidth = rect.width;
        const displayedHeight = rect.height;
        canvas.width = displayedWidth;
        canvas.height = displayedHeight;
        canvas.style.width = displayedWidth + 'px';
        canvas.style.height = displayedHeight + 'px';
        this.drawBoundingBoxes();
      }
    },

    /**
     * 마스크 프리뷰 캔버스 크기 조정
     */
    resizeMaskCanvas() {
      if (!this.video || !this.maskCanvas) return;

      // 1) 내부 픽셀 해상도를 비디오 원본 해상도로
      const origW = this.video.videoWidth;
      const origH = this.video.videoHeight;
      this.maskCanvas.width = origW;
      this.maskCanvas.height = origH;
      this.tmpCanvas.width = origW;
      this.tmpCanvas.height = origH;

      // CSS 위치/크기: getBoundingClientRect()로 화면에 그려진 정확한 위치/크기 가져오기
      const rect = this.video.getBoundingClientRect();
      Object.assign(this.maskCanvas.style, {
        position: 'absolute',
        top: `${rect.top + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        pointerEvents: 'none',
        zIndex: 5
      });
    },

    // -------------------------------------------------
    // Group C: 마스킹 프리뷰 (단계 1.7 구현 완료)
    // -------------------------------------------------
    /**
     * 전체 마스킹 프리뷰 시작
     * 비디오 전체에 모자이크/블러 효과를 실시간으로 적용하여 미리보기
     */
    startMaskPreview() {
      if (this.isMasking) return;
      if (!this.dataLoaded) return;

      this.isMasking = true;

      const v = this.video;
      const mc = this.maskCtx;
      const tc = this.tmpCtx;
      if (!v || !mc || !tc) return;

      // 마스크 캔버스 표시
      if (this.maskCanvas) {
        this.maskCanvas.style.display = 'block';
      }

      // 원본 비디오 해상도
      const origW = v.videoWidth;
      const origH = v.videoHeight;
      if (!origW || !origH) return;

      // 마스크 캔버스와 임시 캔버스를 원본 해상도로 설정
      this.maskCanvas.width = origW;
      this.maskCanvas.height = origH;
      this.tmpCanvas.width = origW;
      this.tmpCanvas.height = origH;

      const lvl = this.maskingStrength;

      // 비디오 컨테이너의 크기
      const containerW = v.clientWidth;
      const containerH = v.clientHeight;

      // 종횡비를 유지하면서 크기 계산
      const scale = Math.min(containerW / origW, containerH / origH);
      const displayW = origW * scale;
      const displayH = origH * scale;

      // 중앙 정렬을 위한 오프셋 계산
      const offsetX = (containerW - displayW) / 2;
      const offsetY = (containerH - displayH) / 2;

      // 마스크 캔버스 스타일 설정
      Object.assign(this.maskCanvas.style, {
        position: 'absolute',
        top: `${v.offsetTop + offsetY}px`,
        left: `${v.offsetLeft + offsetX}px`,
        width: `${displayW}px`,
        height: `${displayH}px`,
        pointerEvents: 'none',
        zIndex: 5,
        objectFit: 'contain'
      });

      const loop = () => {
        if (!this.isMasking) {
          // 마스킹이 중지되면 애니메이션 프레임 취소
          if (this.maskPreviewAnimationFrame) {
            cancelAnimationFrame(this.maskPreviewAnimationFrame);
            this.maskPreviewAnimationFrame = null;
          }
          return;
        }

        // 1) 원본 프레임을 임시 캔버스에 그리기
        tc.clearRect(0, 0, origW, origH);
        tc.drawImage(v, 0, 0, origW, origH);

        // 2) 마스크 캔버스 초기화
        mc.clearRect(0, 0, origW, origH);

        // 0: 모자이크, 1: 블러
        if (this.maskingTool === 'mosaic') {
          // 모자이크: 축소 → 확대
          const w = Math.max(1, Math.floor(origW / (lvl + 4)));
          const h = Math.max(1, Math.floor(origH / (lvl + 4)));
          mc.drawImage(tc.canvas, 0, 0, origW, origH, 0, 0, w, h);
          mc.drawImage(mc.canvas, 0, 0, w, h, 0, 0, origW, origH);
          mc.imageSmoothingEnabled = false;
        } else {
          // 블러: canvas 필터
          mc.filter = `blur(${lvl + 4}px)`;
          mc.drawImage(tc.canvas, 0, 0, origW, origH);
          mc.filter = 'none';
        }

        this.maskPreviewAnimationFrame = requestAnimationFrame(loop);
      };

      loop();
    },

    /**
     * 전체 마스킹 프리뷰 중지
     * 마스킹 프리뷰를 정리하고 원래 상태로 복원
     */
    stopMaskPreview() {
      this.isMasking = false;

      // 마스크 캔버스 초기화
      if (this.maskCanvas) {
        const mc = this.maskCtx;
        mc.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);

        // 마스크 캔버스를 숨김
        this.maskCanvas.style.display = 'none';
      }

      // 임시 캔버스 초기화
      if (this.tmpCanvas) {
        const tc = this.tmpCtx;
        tc.clearRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
      }

      // 비디오 상태 복원
      if (this.video) {
        // 비디오가 일시정지 상태가 아니라면 일시정지
        if (!this.video.paused) {
          this.video.pause();
          this.videoPlaying = false;
        }

        // 비디오 스타일 초기화
        this.video.style.filter = 'none';
      }

      // 애니메이션 프레임 취소
      if (this.maskPreviewAnimationFrame) {
        cancelAnimationFrame(this.maskPreviewAnimationFrame);
        this.maskPreviewAnimationFrame = null;
      }
    },

    /**
     * 전체 화면에 마스킹 효과 적용 (export용)
     * 
     * @param {CanvasRenderingContext2D} ctx - 대상 캔버스 컨텍스트
     * @param {number} ow - 원본 너비
     * @param {number} oh - 원본 높이
     */
    applyEffectFull(ctx, ow, oh) {
      const lvl = this.maskingStrength;
      const type = this.maskingTool; // 'mosaic' or 'blur'
      const src = this.tmpCanvas;

      // 모자이크 처리
      const mosaic = (dx, dy, dw, dh) => {
        const tw = Math.max(1, Math.floor(dw / (lvl + 4)));
        const th = Math.max(1, Math.floor(dh / (lvl + 4)));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 0, 0, ow, oh, dx, dy, tw, th);
        ctx.drawImage(ctx.canvas, dx, dy, tw, th, dx, dy, dw, dh);
      };

      // 블러 처리
      const blur = (dx, dy, dw, dh) => {
        ctx.save();
        ctx.filter = `blur(${lvl + 4}px)`;
        ctx.drawImage(src, 0, 0, ow, oh, dx, dy, dw, dh);
        ctx.restore();
      };

      // 전체 적용
      if (type === 'mosaic') mosaic(0, 0, ow, oh);
      else blur(0, 0, ow, oh);
    },

    // -------------------------------------------------
    // Group D: 마우스 이벤트 (단계 1.8 구현 완료)
    // -------------------------------------------------
    /**
     * 캔버스 클릭 이벤트 처리
     * - 마스킹 모드: 다각형 점 추가/닫기
     * - 선택 객체 탐지 모드: API 호출
     * 
     * @param {MouseEvent} event - 마우스 이벤트
     */
    async onCanvasClick(event) {
      // 1) 공통 체크
      if (!this.selectMode) {
        this.$emit('canvas-click', event);
        return;
      }

      const canvas = this.$refs.maskingCanvas;
      if (!canvas || !this.video) return;

      // 2) 마스킹 모드 - 다각형 처리
      if (this.currentMode === 'mask' && this.maskMode === 'polygon') {
        const point = this.convertToOriginalCoordinates(event);

        // 이미 닫힌 다각형이면 무시
        if (this.isPolygonClosed) return;

        // 첫 점과 가까우면 다각형 닫기
        if (this.maskingPoints.length >= 3) {
          const first = this.maskingPoints[0];
          const dx = first.x - point.x;
          const dy = first.y - point.y;
          if (Math.hypot(dx, dy) < this.maskCompleteThreshold) {
            this.isPolygonClosed = true;
            this.maskingPoints.push({ ...first });
            this.drawPolygon();
            // 프레임 범위가 지정된 후라면 우클릭 메뉴에서 저장
            if (this.maskFrameStart == null || this.maskFrameEnd == null) {
              this.logMasking();
            }
            return;
          }
        }

        this.maskingPoints.push(point);
        this.drawPolygon();
        return;
      }

      // 3) 선택 객체 탐지 모드 - 이벤트 발생 (App.vue에서 처리)
      if (this.currentMode === 'select') {
        const point = this.convertToOriginalCoordinates(event);
        const currentFrame = this.getCurrentFrameNormalized();
        this.$emit('object-detect', {
          x: point.x,
          y: point.y,
          frame: currentFrame,
          videoName: this.currentVideoName
        });
        return;
      }

      // 기본 이벤트 발생
      this.$emit('canvas-click', event, this.convertToOriginalCoordinates(event), this.getCurrentFrameNormalized());
    },

    /**
     * 캔버스 마우스 다운 이벤트 처리
     * - 사각형 마스킹: 시작점 설정
     * - manual 모드: 박스 생성 또는 드래그 시작
     * 
     * @param {MouseEvent} event - 마우스 이벤트
     */
    onCanvasMouseDown(event) {
      // 왼쪽 버튼이 아니라면 아무 것도 하지 않음 (우클릭 방지)
      if (event.button !== 0) return;

      // 사각형 마스킹 모드
      if (this.currentMode === 'mask' && this.maskMode === 'rectangle') {
        const point = this.convertToOriginalCoordinates(event);
        this.maskingPoints = [point];
        this.isDrawingMask = true;
        return;
      }

      // manual 모드
      if (this.currentMode === 'manual') {
        const click = this.convertToOriginalCoordinates(event);

        // 사각형이 없는 경우: 새로 만들기 시작
        if (!this.manualBox) {
          this.manualBox = { x: click.x, y: click.y, w: 0, h: 0 };
          this.isDrawingManualBox = true;
          return;
        }

        // 기존 박스 내에서 클릭하면 이동 모드
        const { x, y, w, h } = this.manualBox;
        const withinBox = (
          click.x >= x && click.x <= x + w &&
          click.y >= y && click.y <= y + h
        );

        if (withinBox) {
          this.isDraggingManualBox = true;
          this.dragOffset = { x: click.x - x, y: click.y - y };
        } else {
          // 박스 외부 클릭하면 새 박스 만들기 시작
          this.manualBox = { x: click.x, y: click.y, w: 0, h: 0 };
          this.isDrawingManualBox = true;
        }
      }
    },

    /**
     * 캔버스 마우스 물브 이벤트 처리
     * - 호버 효과 확인
     * - manual 모드: 박스 크기 조절/이동
     * - 사각형 마스킹: 크기 조절
     * 
     * @param {MouseEvent} event - 마우스 이벤트
     */
    onCanvasMouseMove(event) {
      if (event.button !== 0) return;

      // 마우스 위치에 있는 박스 확인 (호버 효과용)
      this.checkHoveredBox(event);

      // manual 모드
      if (this.currentMode === 'manual') {
        const current = this.convertToOriginalCoordinates(event);

        // 크기 조절 중
        if (this.isDrawingManualBox && this.manualBox) {
          this.manualBox.w = current.x - this.manualBox.x;
          this.manualBox.h = current.y - this.manualBox.y;
          this.drawBoundingBoxes();
          return;
        }

        // 위치 이동 중
        if (this.isDraggingManualBox && this.manualBox) {
          this.manualBox.x = current.x - this.dragOffset.x;
          this.manualBox.y = current.y - this.dragOffset.y;
          const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
          const bbox = this.getBBoxString(this.manualBox);
          this.saveManualMaskingEntry(currentFrame, bbox);
          this.drawBoundingBoxes();
          return;
        }
      }

      // 사각형 마스킹 모드
      if (this.currentMode === 'mask' && this.maskMode === 'rectangle' && this.isDrawingMask) {
        const point = this.convertToOriginalCoordinates(event);
        if (this.maskingPoints.length === 1) {
          this.maskingPoints.push(point);
        } else {
          this.maskingPoints[1] = point;
        }
        this.drawRectangle();
      }
    },

    /**
     * 캔버스 마우스 업 이벤트 처리
     * - manual 모드: 박스 확정 및 저장
     * - 사각형 마스킹: 마스킹 확정
     * 
     * @param {MouseEvent} event - 마우스 이벤트
     */
    onCanvasMouseUp(event) {
      if (event.button !== 0) return;

      // manual 모드
      if (this.currentMode === 'manual') {
        // 정지 상태에서 그린 박스 → 자동재생
        if (this.isDrawingManualBox) {
          this.isDrawingManualBox = false;
          const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
          const bbox = this.getBBoxString(this.manualBox);
          this.saveManualMaskingEntry(currentFrame, bbox);
          this.sendBatchMaskingsToBackend();
          return;
        }

        // 드래그로 이동 완료
        if (this.isDraggingManualBox) {
          this.isDraggingManualBox = false;
          const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
          const bbox = this.getBBoxString(this.manualBox);
          this.saveManualMaskingEntry(currentFrame, bbox);
          this.sendBatchMaskingsToBackend();
        }
      }

      // 사각형 마스킹 모드
      if (this.currentMode === 'mask' && this.maskMode === 'rectangle' && this.isDrawingMask) {
        const endPoint = this.convertToOriginalCoordinates(event);
        if (this.maskingPoints.length === 1) {
          this.maskingPoints.push(endPoint);
        } else {
          this.maskingPoints[1] = endPoint;
        }
        this.isDrawingMask = false;

        // 너무 작은 영역이면 취소
        const start = this.maskingPoints[0];
        const dx = Math.abs(start.x - endPoint.x);
        const dy = Math.abs(start.y - endPoint.y);
        if (dx < 5 && dy < 5) {
          this.maskingPoints = [];
          return;
        }

        this.drawRectangle();
      }
    },

    /**
     * 캔버스 우클릭 컨텍스트 메뉴 이벤트 처리
     * 
     * @param {MouseEvent} event - 마우스 이벤트
     */
    onCanvasContextMenu(event) {
      event.stopPropagation();
      event.preventDefault();

      // 선택된 파일이 없으면 무시
      if (this.selectedFileIndex < 0) {
        console.log('선택된 파일이 없습니다');
        return;
      }

      // 마스킹 모드가 아니면 무시
      if (this.currentMode !== 'mask' && this.currentMode !== '') return;

      const clickPoint = this.convertToOriginalCoordinates(event);
      // 호버된 객체가 있으면 우선 사용, 없으면 위치에서 찾기
      const trackId = this.hoveredBoxId || this.findTrackIdAtPosition(clickPoint);

      // 도형 클릭 여부 확인
      let shapeClicked = false;
      if (this.maskMode === 'rectangle' && this.maskingPoints.length === 2) {
        const [p0, p1] = this.maskingPoints;
        const minX = Math.min(p0.x, p1.x);
        const maxX = Math.max(p0.x, p1.x);
        const minY = Math.min(p0.y, p1.y);
        const maxY = Math.max(p0.y, p1.y);
        if (clickPoint.x >= minX && clickPoint.x <= maxX && clickPoint.y >= minY && clickPoint.y <= maxY) {
          shapeClicked = true;
        }
      } else if (this.maskMode === 'polygon' && this.maskingPoints.length >= 3 && this.isPolygonClosed) {
        if (this.isPointInPolygon(clickPoint, this.maskingPoints)) {
          shapeClicked = true;
        }
      }

      if (this.selectedFileIndex >= 0) {
        shapeClicked = true;
      }

      // 컨텍스트 메뉴 이벤트 발생
      this.$emit('context-menu', {
        x: clickPoint.x,
        y: clickPoint.y,
        trackId: trackId,
        clientX: event.clientX,
        clientY: event.clientY,
        shapeClicked
      });
    },

    // -------------------------------------------------
    // Group E: 데이터 관리 (단계 1.9 구현 완료)
    // -------------------------------------------------
    /**
     * 마스킹 데이터 로깅 (프레임 범위 지원)
     * 다각형 또는 사각형 마스킹을 현재 프레임 또는 지정된 범위에 저장
     */
    logMasking() {
      let bbox = null;

      if (this.maskMode === 'rectangle' && this.maskingPoints.length === 2) {
        const p0 = this.maskingPoints[0];
        const p1 = this.maskingPoints[1];
        const minX = Math.min(p0.x, p1.x);
        const minY = Math.min(p0.y, p1.y);
        const maxX = Math.max(p0.x, p1.x);
        const maxY = Math.max(p0.y, p1.y);
        bbox = [minX, minY, maxX, maxY];
      } else if (this.maskMode === 'polygon' && this.maskingPoints.length > 0 && this.isPolygonClosed) {
        bbox = this.maskingPoints.map(p => [p.x, p.y]);
      }

      if (!bbox) return;

      const currentFrame = Math.floor(this.video.currentTime * this.frameRate);

      // 프레임 범위가 지정된 경우 해당 범위 전체에 적용
      if (this.maskFrameStart !== null && this.maskFrameEnd !== null) {
        for (let f = this.maskFrameStart; f <= this.maskFrameEnd; f++) {
          this.saveMaskingEntry(f, bbox);
        }
      } else {
        // 현재 프레임에만 적용
        this.saveMaskingEntry(currentFrame, bbox);
      }
    },

    /**
     * 마스킹 엔트리 저장
     * 
     * @param {number} frame - 프레임 번호
     * @param {Array} bbox - 바울링 박스 좌표
     */
    saveMaskingEntry(frame, bbox) {
      const bboxType = Array.isArray(bbox) && Array.isArray(bbox[0]) ? 'polygon' : 'rect';
      const newEntry = {
        frame,
        track_id: this.maskBiggestTrackId,
        bbox,
        bbox_type: bboxType,
        type: 4,
        object: 1
      };

      // 중복 체크
      const exists = this.maskingLogs.some(
        log => log.frame === newEntry.frame &&
               log.track_id === newEntry.track_id &&
               JSON.stringify(log.bbox) === JSON.stringify(newEntry.bbox) &&
               log.object === newEntry.object
      );

      if (!exists) {
        this.maskingLogs.push(newEntry);
        this.addToMaskingLogsMap(newEntry);
        this.newMaskings.push(newEntry);
      }
    },

    /**
     * 수동 마스킹 엔트리 저장 (manual 모드)
     * 같은 프레임의 기존 엔트리는 업데이트
     * 
     * @param {number} frame - 프레임 번호
     * @param {string} bbox - 바울링 박스 문자열
     */
    saveManualMaskingEntry(frame, bbox) {
      const videoName = this.currentVideoName || 'unknown.mp4';
      const trackId = this.manualBiggestTrackId;
      const newEntry = {
        frame,
        track_id: trackId,
        bbox,
        bbox_type: 'rect',
        type: 3,
        object: 1
      };

      // 같은 프레임+track_id 조합이 있으면 업데이트
      const index = this.maskingLogs.findIndex(
        log => log.frame === newEntry.frame && log.track_id === newEntry.track_id
      );

      if (index !== -1) {
        // bbox가 변경된 경우에만 업데이트
        if (JSON.stringify(this.maskingLogs[index].bbox) !== JSON.stringify(newEntry.bbox)) {
          this.maskingLogs[index] = newEntry;
          this.rebuildMaskingLogsMap();

          // newMaskings에서도 업데이트 또는 추가
          const indexNew = this.newMaskings.findIndex(
            log => log.frame === newEntry.frame && log.track_id === newEntry.track_id
          );
          if (indexNew !== -1) {
            this.newMaskings[indexNew] = { ...newEntry, videoName };
          } else {
            this.newMaskings.push({ ...newEntry, videoName });
          }
        }
      } else {
        // 새 엔트리 추가
        this.maskingLogs.push(newEntry);
        this.addToMaskingLogsMap(newEntry);
        this.newMaskings.push({ ...newEntry, videoName });
      }

      // 데이터 로드 상태 업데이트
      if (this.maskingLogs.length > 0) {
        this.dataLoaded = true;
      }
    },

    /**
     * 배치 마스킹 데이터를 백엔드로 전송
     */
    async sendBatchMaskingsToBackend() {
      if (!this.newMaskings.length) return;

      const videoName = this.currentVideoName || 'default.mp4';

      const entries = this.newMaskings.map(entry => ({
        frame: entry.frame,
        track_id: entry.track_id,
        bbox: typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox,
        bbox_type: entry.bbox_type || 'rect',
        score: entry.score ?? null,
        class_id: entry.class_id ?? null,
        type: entry.type,
        object: entry.object ?? 1
      }));

      try {
        await window.electronAPI.updateJson({ videoName, entries });
        this.newMaskings = [];
      } catch (error) {
        console.error('JSON 업데이트 오류:', error);
      }
    },

    /**
     * maskingLogsMap 재구축 (O(1) 조회용)
     * maskingLogs 변경 시 호출
     */
    rebuildMaskingLogsMap() {
      this.maskingLogsMap = {};
      for (const log of this.maskingLogs) {
        const f = Number(log.frame);
        if (!this.maskingLogsMap[f]) this.maskingLogsMap[f] = [];
        this.maskingLogsMap[f].push(log);
      }
    },

    /**
     * maskingLogsMap에 엔트리 추가
     * 
     * @param {Object} entry - 마스킹 엔트리
     */
    addToMaskingLogsMap(entry) {
      const f = Number(entry.frame);
      if (!this.maskingLogsMap[f]) this.maskingLogsMap[f] = [];
      this.maskingLogsMap[f].push(entry);
    },

    /**
     * 다음 track_id 결정
     * 기존 마스킹 로그에서 가장 큰 번호를 찾아 +1
     * 
     * @param {number} typeNum - 타입 번호 (3: manual, 4: mask)
     */
    checkBiggestTrackId(typeNum) {
      if (this.dataLoaded) {
        const entries = this.maskingLogs.filter(log => log.type === typeNum);
        if (entries.length > 0) {
          const trackNumbers = entries.map(entry => {
            if (typeof entry.track_id === 'string' && entry.track_id.startsWith(typeNum + '_')) {
              return parseInt(entry.track_id.split('_')[1]);
            }
            return 0;
          });

          const nextTrackNumber = Math.max(...trackNumbers) + 1;
          if (typeNum === 3) {
            this.manualBiggestTrackId = `3_${nextTrackNumber}`;
          } else {
            this.maskBiggestTrackId = `4_${nextTrackNumber}`;
          }
        } else {
          if (typeNum === 3) {
            this.manualBiggestTrackId = `${typeNum}_1`;
          } else {
            this.maskBiggestTrackId = `${typeNum}_1`;
          }
        }
      } else {
        if (typeNum === 3) {
          this.manualBiggestTrackId = `${typeNum}_1`;
        } else {
          this.maskBiggestTrackId = `${typeNum}_1`;
        }
      }
    },

    // -------------------------------------------------
    // Group G: 애니메이션 루프 (단계 1.10 구현 완료)
    // -------------------------------------------------
    /**
     * 메인 애니메이션 루프 시작
     * 비디오 재생 중 프레임 변경 감지 및 drawBoundingBoxes 호출
     * manual 모드에서 박스 위치 자동 저장
     */
    startAnimationLoop() {
      const loop = () => {
        if (!this.video) {
          this.animationFrameId = requestAnimationFrame(loop);
          return;
        }

        const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
        this.currentFrame = currentFrame;

        // 진행률 및 시간 업데이트
        if (this.video.duration) {
          this.progress = (this.video.currentTime / this.video.duration) * 100;
          this.currentTime = this.formatTime(this.video.currentTime);
        }

        // 프레임 변경 시에만 다시 그리기
        if (currentFrame !== this.previousFrame) {
          this.previousFrame = currentFrame;
          this.drawBoundingBoxes();
        }

        // manual 모드: 재생 중 박스 위치 자동 저장
        if (
          this.currentMode === 'manual' &&
          this.videoPlaying &&
          this.manualBox &&
          !this.isDrawingManualBox
        ) {
          const bbox = this.getBBoxString(this.manualBox);
          this.saveManualMaskingEntry(currentFrame, bbox);
          // 매 30프레임(~1초)마다 배치 동기화
          if (this.newMaskings.length > 0 && currentFrame % 30 === 0) {
            this.sendBatchMaskingsToBackend();
          }
        }

        this.animationFrameId = requestAnimationFrame(loop);
      };

      this.animationFrameId = requestAnimationFrame(loop);
    },

    /**
     * 애니메이션 루프 중지
     */
    stopAnimationLoop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    },

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
