import { defineStore } from 'pinia';

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
