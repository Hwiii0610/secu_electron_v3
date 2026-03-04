import { defineStore } from 'pinia';

export const useFileStore = defineStore('file', {
  state: () => ({
    files: [],
    selectedFileIndex: -1,
    fileInfoItems: [
      { label: 'fileInfo.fileName', value: '' },
      { label: 'fileInfo.fileSize', value: '' },
      { label: 'fileInfo.playTime', value: '' },
      { label: 'fileInfo.resolution', value: '' },
      { label: 'fileInfo.frameRate', value: '' },
      { label: 'fileInfo.totalFrames', value: '' },
    ],
    sessionCroppedFiles: [],
    currentTimeFolder: null,
    selectedExportDir: '',
    desktopDir: '',
    dirConfig: {
      videoDir: '',
    },
    fileProgressMap: {},
    isFolderLoading: false,
    folderLoadCurrent: 0,
    folderLoadTotal: 0,
    folderLoadProgress: 0,
    showVideoListModal: false,
    serverVideoList: [],
  }),

  getters: {
    hasSelectedFile(state) {
      return state.selectedFileIndex >= 0;
    },
    selectedFile(state) {
      if (state.selectedFileIndex >= 0) {
        return state.files[state.selectedFileIndex] || null;
      }
      return null;
    },
    fileCount(state) {
      return state.files.length;
    },
    hasFiles(state) {
      return state.files.length > 0;
    },
    folderLoadingProgress(state) {
      if (state.folderLoadTotal === 0) return 0;
      return (state.folderLoadCurrent / state.folderLoadTotal) * 100;
    },
    allVideoSelected(state) {
      return state.serverVideoList.length > 0 &&
        state.serverVideoList.every(v => v.selected);
    },
  },

  actions: {
    formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    resetVideoInfo() {
      this.fileInfoItems.forEach(item => { item.value = ''; });
    },
  }
});
