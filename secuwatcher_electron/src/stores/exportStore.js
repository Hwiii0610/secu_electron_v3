import { defineStore } from 'pinia';

export const useExportStore = defineStore('export', {
  state: () => ({
    exporting: false,
    exportProgress: 0,
    exportEta: null,
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
    exportProgressTimer: null,
    batchEta: 0,
    batchFiles: [], // [{name, status: 'waiting'|'active'|'completed', progress: 0}]
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
    isExportingActive(state) {
      return state.exporting || state.isBatchProcessing;
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
      this.batchEta = 0;
      this.batchFiles = [];
    },
    cancelBatchProcessing() {
      this.resetBatchState();
    },
    initBatchFiles(files) {
      this.batchFiles = files.map(f => ({
        name: typeof f === 'string' ? f : f.name,
        status: 'waiting',
        progress: 0
      }));
    },
    updateBatchFileStatus(index, status, progress = 0) {
      if (this.batchFiles[index]) {
        this.batchFiles[index].status = status;
        this.batchFiles[index].progress = progress;
      }
    },
  }
});
