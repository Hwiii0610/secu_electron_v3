import { contextBridge, ipcRenderer } from 'electron';

// Window controls API를 렌더러 프로세스에 노출
contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  saveTempFile: (arrayBuffer, fileName) => ipcRenderer.invoke('save-temp-file', arrayBuffer, fileName),
  deleteTempFile: (filePath) => ipcRenderer.invoke('delete-temp-file', filePath),
  getVideoInfo: (videoPath) => ipcRenderer.invoke('get-video-info', videoPath),
  convertVideo: (inputPath, outputPath, options) => ipcRenderer.invoke('convert-video', inputPath, outputPath, options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  getTempPath: (fileName) => ipcRenderer.invoke('get-temp-path', fileName),
  getTempFileAsBlob: (filePath) => ipcRenderer.invoke('get-temp-file-as-blob', filePath),
  getFileStat: (filePath) => ipcRenderer.invoke('stat-file', filePath),

  /*파일 탐색기 바탕화면 설정*/
  getDesktopDir: () => ipcRenderer.invoke('get-desktop-dir'),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showVideoDialog: (options) => ipcRenderer.invoke('show-video-dialog', options),
  loadCsv: (payload) => ipcRenderer.invoke('load-csv', payload),

  /* 기존 웹에 요청하는 메소드 */
  loadCsv: (requestData) => ipcRenderer.invoke('load-csv', requestData),
  saveCsv: (payload) => ipcRenderer.invoke('save-csv', payload),
  updateCsv: (maskingList) => ipcRenderer.invoke('update-csv', maskingList),
  updateFilteredCsv: (payload) => ipcRenderer.invoke('update-filtered-csv', payload),
  trimVideo: (requestBody) => ipcRenderer.invoke('trim-video', requestBody),
  mergeVideos: (requestBody) => ipcRenderer.invoke('merge-videos', requestBody),
  saveWatermark: (payload) => ipcRenderer.invoke('save-watermark', payload),
  loadWatermark: (filename) => ipcRenderer.invoke('load-watermark', filename),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  encryptFile: (requestData) => ipcRenderer.invoke('encrypt-file', requestData),
  /* 기존 웹에 요청하는 메소드 끝 */

  readExternalJson: (filename) => ipcRenderer.invoke('read-external-json', filename),
  writeExternalJson: (filename, data) => ipcRenderer.invoke('write-external-json', filename, data),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  showMessage: (message) => ipcRenderer.invoke('show-message', message),
  confirmMessage: (message) => ipcRenderer.invoke('confirm-message', message),
  areaMaskingMessage: (message) => ipcRenderer.invoke('area-masking-message', message),

  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showVideoDialog: (options) => ipcRenderer.invoke('show-video-dialog', options),

  // [추가] 폴더 스캔 및 선택 모드 다이얼로그
  scanDirectory: (folderPath) => ipcRenderer.invoke('scan-directory', folderPath),
  showSelectionModeDialog: () => ipcRenderer.invoke('show-selection-mode-dialog'),
  
  // 워터마크 이미지 복사
  copyWatermarkImage: (payload) => ipcRenderer.invoke('copy-watermark-image', payload),

  
  // 변환 진행률 이벤트 리스너
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', callback);
  },

  onMainLog: (callback) => ipcRenderer.on('main-log', (event, data) => callback(data)),

  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  exportHardwareId: (hardwareId) => ipcRenderer.invoke('export-hardware-id', hardwareId),

  selectLicenseFile: () => ipcRenderer.invoke('select-license-file'),
  validateLicense: (licenseKey, licenseFilePath) => ipcRenderer.invoke('validate-license', licenseKey, licenseFilePath), 
  
  removeConversionProgressListener: (callback) => {
    ipcRenderer.removeListener('conversion-progress', callback);
  }
});