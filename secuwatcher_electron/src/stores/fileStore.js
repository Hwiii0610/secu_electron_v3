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
    folderLoadCurrentName: '',
    folderLoadFiles: [],   // [{ name, status: 'waiting'|'active'|'completed'|'skipped' }]
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

    /**
     * 파일 리스트를 config/filelist.json에 저장
     */
    async saveFileList() {
      try {
        const data = this.files.map(f => ({
          name: f.name,
          size: f.size,
          url: f.url,
          duration: f.duration,
          resolution: f.resolution,
          frameRate: f.frameRate,
          totalFrames: f.totalFrames,
          file: f.file,
          selected: f.selected || false,
        }));
        await window.electronAPI.writeExternalJson('filelist.json', {
          files: data,
          selectedFileIndex: this.selectedFileIndex,
          savedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('파일 리스트 저장 실패:', e);
      }
    },

    /**
     * 앱 시작 시 config/filelist.json에서 파일 리스트 복원
     * 존재하지 않는 파일은 제외
     */
    async loadFileList() {
      try {
        const data = await window.electronAPI.readExternalJson('filelist.json');
        if (!data || !Array.isArray(data.files) || data.files.length === 0) return;

        // 파일 존재 여부 확인 후 복원
        const validFiles = [];
        for (const f of data.files) {
          if (!f.file) continue;
          try {
            const stat = await window.electronAPI.getFileStat(f.file);
            if (stat) {
              validFiles.push(f);
            }
          } catch {
            // 파일이 존재하지 않으면 건너뜀
          }
        }

        if (validFiles.length > 0) {
          this.files = validFiles;
          // 저장된 인덱스가 유효한 범위인지 확인
          const savedIdx = data.selectedFileIndex ?? -1;
          this.selectedFileIndex = (savedIdx >= 0 && savedIdx < validFiles.length)
            ? savedIdx
            : 0;
        }
      } catch (e) {
        console.error('파일 리스트 복원 실패:', e);
      }
    },
  }
});
