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
  },

  actions: {
    formatTime(seconds) {
      if (isNaN(seconds)) return '00:00';
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = Math.floor(seconds % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    },
  }
});
