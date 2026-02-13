import { defineStore } from 'pinia';

export const useDetectionStore = defineStore('detection', {
  state: () => ({
    maskingLogs: [],
    maskingLogsMap: {},
    newMaskings: [],
    dataLoaded: false,
    detectionResults: [],
    isDetecting: false,
    detectionProgress: 0,
    detectionEventType: '',  // '1'=자동, '2'=선택, '3'=마스킹
    hasSelectedDetection: false,
    maskBiggestTrackId: '',
    hoveredBoxId: null,
    // 탐지 중 사용자 object 변경값 보존 (key: "${track_id}_${frame}", value: object값)
    userObjectOverrides: {},
    // 프레임 범위 마스킹
    maskFrameStart: null,
    maskFrameEnd: null,
    showMaskFrameModal: false,
    frameMaskStartInput: '',
    frameMaskEndInput: '',
    // 다중파일 탐지
    showMultiAutoDetectionModal: false,
    autoDetectionSelections: [],
  }),

  getters: {
    allAutoDetectionSelected(state) {
      return state.autoDetectionSelections.length > 0 &&
        state.autoDetectionSelections.every(selected => selected);
    },
  },

  actions: {
    rebuildMaskingLogsMap() {
      this.maskingLogsMap = {};
      this.maskingLogs.forEach(log => {
        const frame = log.frame;
        if (!this.maskingLogsMap[frame]) this.maskingLogsMap[frame] = [];
        this.maskingLogsMap[frame].push(log);
      });
    },
    addToMaskingLogsMap(log) {
      const frame = log.frame;
      if (!this.maskingLogsMap[frame]) this.maskingLogsMap[frame] = [];
      this.maskingLogsMap[frame].push(log);
    },
  }
});
