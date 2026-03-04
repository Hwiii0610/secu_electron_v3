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
    detectionEta: null,
    detectionEventType: '',  // '1'=자동, '2'=선택, '3'=마스킹
    hasSelectedDetection: false,
    maskBiggestTrackId: '',
    hoveredBoxId: null,
    // 탐지 중 사용자 object 변경값 보존 (key: "${track_id}_${frame}", value: object값)
    userObjectOverrides: {},
    // 사용자 객체 조작 타임스탬프 (리로드 가드용)
    _lastUserActionTime: 0,
    // 프레임 범위 마스킹
    maskFrameStart: null,
    maskFrameEnd: null,
    showMaskFrameModal: false,
    frameMaskStartInput: '',
    frameMaskEndInput: '',
    // 선택객체 탐지 클릭 포인트 (원본 좌표계, {x, y})
    selectDetectionPoint: null,
    // 탐지 데이터의 실제 최대 프레임 번호 (totalFrames 보정용)
    maxDataFrame: -1,
    // 다중파일 탐지
    showMultiAutoDetectionModal: false,
    autoDetectionSelections: [],
  }),

  getters: {
    isBusy(state) {
      return state.isDetecting || state.detectionEventType !== '';
    },
    allAutoDetectionSelected(state) {
      return state.autoDetectionSelections.length > 0 &&
        state.autoDetectionSelections.every(selected => selected);
    },
    hasDetectionResults(state) {
      return state.detectionResults && state.detectionResults.length > 0;
    },
isAutoDetecting(state) {
      return state.isDetecting && state.detectionEventType === '1';
    },
    isSelectionDetecting(state) {
      return state.isDetecting && state.detectionEventType === '2';
    },
    isMaskingDetecting(state) {
      return state.isDetecting && state.detectionEventType === '3';
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
    removeFromMaskingLogsMap(log) {
      const arr = this.maskingLogsMap[log.frame];
      if (!arr) return;
      const idx = arr.indexOf(log);
      if (idx > -1) arr.splice(idx, 1);
      if (arr.length === 0) delete this.maskingLogsMap[log.frame];
    },
  }
});
