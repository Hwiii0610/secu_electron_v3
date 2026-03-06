import { defineStore } from 'pinia';
import { FRAME_STEP_MODES } from '../composables/videoController';

export const useVideoStore = defineStore('video', {
  state: () => ({
    currentTime: '00:00',
    totalTime: '00:00',
    progress: 0,
    videoPlaying: false,
    zoomLevel: 1,
    frameRate: 30,
    videoDuration: 0,
    currentPlaybackRate: 1,
    currentFrame: 0,
    previousFrame: -1,
    trimStartTime: 0,
    trimEndTime: 0,
    trimDragging: null,
    conversion: {
      inProgress: false,
      progress: 0,
      currentFile: ''
    },
    conversionCache: {},
    frameStepMode: 0,  // 0=1프레임, 1=1초, 2=5초, 3=10초

    // 타임라인 스프라이트 썸네일
    segments: [],           // [{id, startTime, endTime, spriteUrl, spriteReady}]
    spriteGenerationId: 0,  // 취소용 카운터
    thumbnailsReady: false,
  }),

  getters: {
    sliderBackground(state) {
      return `linear-gradient(to right, #3498db 0%, #3498db ${state.progress}%, #666666 ${state.progress}%, #666666 100%)`;
    },
    trimStartPosition(state) {
      if (!state.videoDuration) return 0;
      return (state.trimStartTime / state.videoDuration) * 100;
    },
    trimEndPosition(state) {
      if (!state.videoDuration) return 100;
      return (state.trimEndTime / state.videoDuration) * 100;
    },
    frameStepLabel(state) {
      return FRAME_STEP_MODES[state.frameStepMode]?.label || FRAME_STEP_MODES[0].label;
    },
    isTrimming(state) {
      return state.trimDragging !== null;
    },
    isConverting(state) {
      return state.conversion.inProgress;
    },
    conversionPercentage(state) {
      return state.conversion.progress || 0;
    },
    hasVideo(state) {
      return state.videoDuration > 0;
    },
    segmentsWithLayout(state) {
      if (!state.videoDuration || state.segments.length === 0) return [];
      // 현재 재생 시간(초)을 progress에서 역산
      const currentSec = (state.progress / 100) * state.videoDuration;
      return state.segments.map(seg => {
        const duration = seg.endTime - seg.startTime;
        const m = Math.floor(duration / 60).toString().padStart(2, '0');
        const s = Math.floor(duration % 60).toString().padStart(2, '0');
        const isActive = currentSec >= seg.startTime && currentSec < seg.endTime;
        return {
          ...seg,
          leftPercent: (seg.startTime / state.videoDuration) * 100,
          widthPercent: ((seg.endTime - seg.startTime) / state.videoDuration) * 100,
          durationLabel: `${m}:${s}`,
          isActive,
        };
      });
    },
  },

  actions: {
    formatTime(seconds) {
      if (isNaN(seconds)) return '00:00';
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = Math.floor(seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    },

    initSegments() {
      this.segments = [{
        id: 'seg-0',
        startTime: 0,
        endTime: this.videoDuration,
        spriteUrl: null,
        spriteReady: false,
      }];
      this.spriteGenerationId++;
    },

    splitSegmentAt(splitTime) {
      const idx = this.segments.findIndex(
        s => splitTime > s.startTime && splitTime < s.endTime
      );
      if (idx === -1) return;
      const seg = this.segments[idx];
      const ts = Date.now();
      const left = { ...seg, id: `seg-${ts}-l`, endTime: splitTime, spriteUrl: null, spriteReady: false };
      const right = { ...seg, id: `seg-${ts}-r`, startTime: splitTime, spriteUrl: null, spriteReady: false };
      this.segments.splice(idx, 1, left, right);
      this.spriteGenerationId++;
    },

    updateSegmentSprite(segId, spriteUrl) {
      const seg = this.segments.find(s => s.id === segId);
      if (seg) {
        seg.spriteUrl = spriteUrl;
        seg.spriteReady = !!spriteUrl;
      }
    },

    resetThumbnails() {
      this.segments = [];
      this.thumbnailsReady = false;
      this.spriteGenerationId++;
    },
  }
});
