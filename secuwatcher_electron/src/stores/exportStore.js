import { defineStore } from 'pinia';

export const useExportStore = defineStore('export', {
  state: () => ({
    exporting: false,
    exportProgress: 0,
    exportProgressTimer: null,
    exportMessage: '',
    exportFileNormal: true,
    exportFilePassword: '',
    showPassword: false,
    // 일괄처리
    isBatchProcessing: false,
    currentFileIndex: 0,
    totalFiles: 0,
    currentFileName: '',
    phase: '',
    currentFileProgress: 0,
    batchJobId: null,
    batchIntervalId: null,
  }),

  getters: {
    phaseText(state) {
      const map = {
        'init': '초기화 중...',
        'detect': '객체 탐지 중...',
        'mask': '마스킹 처리 중...',
        'watermark': '워터마크 적용 중...',
        'encrypt': '암호화 중...',
        'export': '내보내기 중...',
        'done': '완료!'
      };
      return map[state.phase] || state.phase;
    },
    overallProgress(state) {
      if (state.totalFiles === 0) return 0;
      const completedProgress = (state.currentFileIndex / state.totalFiles) * 100;
      const currentContribution = (state.currentFileProgress / state.totalFiles);
      return Math.min(100, Math.floor(completedProgress + currentContribution));
    },
  },

  actions: {
    resetBatchState() {
      this.isBatchProcessing = false;
      this.currentFileIndex = 0;
      this.totalFiles = 0;
      this.currentFileName = '';
      this.phase = '';
      this.currentFileProgress = 0;
      this.batchJobId = null;
      this.stopBatchPolling();
    },
    stopBatchPolling() {
      if (this.batchIntervalId) {
        clearInterval(this.batchIntervalId);
        this.batchIntervalId = null;
      }
    },
    cancelBatchProcessing() {
      this.resetBatchState();
    },
  }
});
