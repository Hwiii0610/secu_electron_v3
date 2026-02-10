import { defineStore } from 'pinia';

export const useFileStore = defineStore('file', {
  state: () => ({
    files: [],
    selectedFileIndex: -1,
    fileInfoItems: [
      { label: '파일 이름', value: '' },
      { label: '파일 용량', value: '' },
      { label: '재생 시간', value: '' },
      { label: '해상도', value: '' },
      { label: '프레임 속도', value: '' },
      { label: '총 프레임', value: '' },
    ],
    sessionCroppedFiles: [],
    currentTimeFolder: null,
    selectedExportDir: '',
    desktopDir: '',
    dirConfig: {
      videoDir: 'C:/swfc/download/videos/org',
    },
    fileProgressMap: {},
    isFolderLoading: false,
    folderLoadCurrent: 0,
    folderLoadTotal: 0,
    folderLoadProgress: 0,
    showVideoListModal: false,
    serverVideoList: [],
  }),

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
