<template>
  <div class="container">
    <TopMenuBar @menu-click="handleMenuItemClick" />
 

    <div class="wrapper">
      <!-- 좌측 메인 컨테이너 -->
     <div class="video-wrapper">
       <!-- 비디오 영역 -->
       <div class="video-container">
         <VideoCanvas
           ref="videoCanvas"
           :video-src="currentVideoUrl"
           :selected-file="files[selectedFileIndex]"
           :watermark-image="watermarkImage"
           :cached-watermark-image="cachedWatermarkImage"
           :watermark-image-loaded="watermarkImageLoaded"
           @object-detect="handleObjectDetect"
           @masking-batch="handleMaskingBatch"
           @context-menu="handleContextMenu"
           @video-loaded="handleVideoLoaded"
           @video-ended="handleVideoEnded"
           @hover-change="hoveredBoxId = $event"
         />
       </div>
       <!--  컨텍스트 메뉴 영역 -->
       <ContextMenu @action="handleContextMenuAction" />
 
       <!-- 하단 컨트롤 바 -->
       <VideoControls
         @update-progress="updateVideoProgress"
         @marker-mousedown="onMarkerMouseDown"
         @zoom-in="zoomIn"
         @zoom-out="zoomOut"
         @jump-backward="jumpBackward"
         @jump-forward="jumpForward"
         @toggle-play="togglePlay"
         @set-playback-rate="setPlaybackRate"
         @trim-video="trimVideo"
         @merge-video="mergeVideo"
       />
     </div>
 
     <!-- 우측 파일 정보 컨테이너 -->
     <FilePanel
       @select-file="selectFile"
       @trigger-file-input="triggerFileInput"
       @delete-file="deleteFile"
     />
 
    </div>
 
     <!-- 다중파일 자동 객체 탐지 모달 (새로 추가) -->
    <!-- 모달 컴포넌트 -->
    <MultiDetectionModal @execute="executeMultiAutoDetection" />
    <DetectingPopup ref="detectingPopup" />
    <BatchProcessingModal />

    <div v-if="showToast" class="toast">
      {{ toastMessage }}
    </div>

    <ExportModal @send-export="sendExportRequest" @find-dir="onClickFindDir" />

    <MergeModal
      :show="showMergeModal"
      :selections="mergeSelections"
      :allSelected="allSelected"
      @close="closeMergeModal"
      @execute="executeMerge"
      @update:selections="mergeSelections = $event"
      @update:allSelected="allSelected = $event"
    />

    <MaskFrameModal @confirm="confirmMaskFrameRange" @cancel="cancelMaskFrameRange" />
    <SettingsModal @save="saveSettings" @close="closeSettingModal" @setting-noti="settingNoti" />
    <WatermarkModal @apply="applyWatermark" @upload-image="onWatermarkImageUpload" @delete-image="onWatermarkImageDelete" />
    <ProcessingModal :isProcessing="isProcessing" :processingMessage="processingMessage" />
    <FolderLoadingModal />
 </div>
 </template>
 
 <script>
import { mapWritableState, mapState } from 'pinia';
import { useVideoStore } from './stores/videoStore';
import { useFileStore } from './stores/fileStore';
import { useDetectionStore } from './stores/detectionStore';
import { useModeStore } from './stores/modeStore';
import { useConfigStore } from './stores/configStore';
import { useExportStore } from './stores/exportStore';
import ProcessingModal from './components/modals/ProcessingModal.vue';
import FolderLoadingModal from './components/modals/FolderLoadingModal.vue';
import DetectingPopup from './components/modals/DetectingPopup.vue';
import BatchProcessingModal from './components/modals/BatchProcessingModal.vue';
import MultiDetectionModal from './components/modals/MultiDetectionModal.vue';
import MergeModal from './components/modals/MergeModal.vue';
import MaskFrameModal from './components/modals/MaskFrameModal.vue';
import ExportModal from './components/modals/ExportModal.vue';
import SettingsModal from './components/modals/SettingsModal.vue';
import WatermarkModal from './components/modals/WatermarkModal.vue';
import TopMenuBar from './components/TopMenuBar.vue';
import ContextMenu from './components/ContextMenu.vue';
import VideoControls from './components/VideoControls.vue';
import FilePanel from './components/FilePanel.vue';
import VideoCanvas from './components/VideoCanvas.vue';
import { createMaskingDataManager } from './composables/maskingData';
import { createFileManager } from './composables/fileManager';
import { createDetectionManager } from './composables/detectionManager';
import { createExportManager } from './composables/exportManager';
import { createSettingsManager } from './composables/settingsManager';
import { createVideoController } from './composables/videoController';
import { createObjectManager } from './composables/objectManager';
import { createVideoEditor } from './composables/videoEditor';
import {
  showMessage, showError, MESSAGES,
  normalizeFilePath, convertMaskingEntries,
  validateFrameRange, handleValidation,
  formatTime
} from './utils';
 
 export default {
   name: 'Export',
   components: {
     ProcessingModal,
     FolderLoadingModal,
     DetectingPopup,
     BatchProcessingModal,
     MultiDetectionModal,
     MergeModal,
     MaskFrameModal,
     ExportModal,
     SettingsModal,
     WatermarkModal,
     TopMenuBar,
     ContextMenu,
     VideoControls,
     FilePanel,
     VideoCanvas,
   },
  data() {
    return {
      _isSavingVideoPath: false,
      _saveTimer: null,
      isProcessing: false,
      processingMessage: '',
      isMasking: false,
      maskCanvas: null,
      maskCtx: null,
      tmpCanvas: null,
      tmpCtx: null,
      maskPreviewAnimationFrame: null,
      toastMessage: '',
      showToast: false,
      ffmpeg: null,
      ffmpegLoaded: false,
      showMergeModal: false,
      mergeSelections: [],
      allSelected: false,
      // VideoCanvas 연동
      currentVideoUrl: '',  // VideoCanvas에 전달할 비디오 URL
      video: null,          // VideoCanvas의 video 엘리먼트 참조 (캐시)
    };
  },
  computed: {
    // --- Pinia Store 매핑 ---
    ...mapWritableState(useVideoStore, [
      'currentTime', 'totalTime', 'progress', 'videoPlaying', 'zoomLevel',
      'frameRate', 'videoDuration', 'currentPlaybackRate', 'currentFrame',
      'previousFrame', 'trimStartTime', 'trimEndTime', 'trimDragging',
      'conversion', 'conversionCache'
    ]),
    ...mapWritableState(useFileStore, [
      'files', 'selectedFileIndex', 'fileInfoItems', 'sessionCroppedFiles',
      'currentTimeFolder', 'selectedExportDir', 'desktopDir', 'dirConfig',
      'fileProgressMap', 'isFolderLoading', 'folderLoadCurrent', 'folderLoadTotal',
      'folderLoadProgress', 'showVideoListModal', 'serverVideoList'
    ]),
    ...mapWritableState(useDetectionStore, [
      'maskingLogs', 'maskingLogsMap', 'newMaskings', 'dataLoaded',
      'detectionResults', 'isDetecting', 'detectionProgress', 'detectionIntervalId',
      'hasSelectedDetection', 'manualBiggestTrackId', 'maskBiggestTrackId',
      'hoveredBoxId', 'maskFrameStart', 'maskFrameEnd', 'showMaskFrameModal',
      'frameMaskStartInput', 'frameMaskEndInput', 'showMultiAutoDetectionModal',
      'autoDetectionSelections'
    ]),
    ...mapWritableState(useModeStore, [
      'currentMode', 'selectMode', 'isBoxPreviewing', 'exportAllMasking',
      'maskMode', 'maskCompleteThreshold', 'maskingPoints', 'isDrawingMask',
      'isPolygonClosed', 'manualBox', 'isDrawingManualBox', 'isDraggingManualBox',
      'dragOffset', 'contextMenuVisible', 'contextMenuPosition', 'selectedShape'
    ]),
    ...mapWritableState(useConfigStore, [
      'allConfig', 'selectedSettingTab', 'showSettingModal', 'isWaterMarking',
      'settingAutoClasses', 'settingExportMaskRange', 'drmInfo',
      'showWatermarkModal', 'watermarkImage', 'waterMarkImageName',
      'cachedWatermarkImage', 'watermarkImageLoaded'
    ]),
    ...mapWritableState(useExportStore, [
      'exporting', 'exportProgress', 'exportProgressTimer', 'exportMessage',
      'exportFileNormal', 'exportFilePassword', 'showPassword',
      'isBatchProcessing', 'currentFileIndex', 'totalFiles', 'currentFileName',
      'phase', 'currentFileProgress', 'batchJobId', 'batchIntervalId'
    ]),
    // --- Store getters (read-only) ---
    ...mapState(useDetectionStore, ['allAutoDetectionSelected']),
    // --- Local computed ---
    allVideoSelected() {
      return this.serverVideoList.length > 0 &&
        this.serverVideoList.every(video => video.selected);
    },
    // sliderBackground, trimStartPosition, trimEndPosition → videoStore getters
    // phaseText, overallProgress → exportStore getters
  },
     async created(){
      window.electronAPI.onMainLog((data) => {
        console.log('main-log', data);
      });

       // settings 컴포저블은 created에서 필요 (getExportConfig 호출 전)
       this._settings = createSettingsManager({
         getStores: () => ({
           file: useFileStore(),
           mode: useModeStore(),
           config: useConfigStore(),
           detection: useDetectionStore()
         }),
         getCallbacks: () => ({
           drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.()
         })
       });

       await this.getExportConfig();
       document.getElementById('video').addEventListener('contextmenu', function (event) {
         event.preventDefault();
       });
     },
     
     mounted() {
       // VideoCanvas가 렌더링된 후 video 엘리먼트 참조 설정
       this.$nextTick(() => {
         this.video = this.$refs.videoCanvas?.$refs.videoPlayer;
       });

       // 마스킹 데이터 컴포저블 초기화
       this._masking = createMaskingDataManager({
         getStores: () => ({
           detection: useDetectionStore(),
           mode: useModeStore(),
           file: useFileStore(),
           video: useVideoStore()
         }),
         getVideo: () => this.video
       });

       // 파일 관리 컴포저블 초기화
       this._fileManager = createFileManager({
         getStores: () => ({
           file: useFileStore(),
           video: useVideoStore(),
           detection: useDetectionStore(),
           mode: useModeStore(),
           config: useConfigStore()
         }),
         getVideo: () => this.video,
         getCallbacks: () => ({
           startNewSession: () => this.startNewSession(),
           loadDetectionData: () => this.loadDetectionData()
         }),
         getAppLocals: () => ({
           currentVideoUrl: this.currentVideoUrl,
           isProcessing: this.isProcessing,
           processingMessage: this.processingMessage
         }),
         setAppLocal: (key, val) => { this[key] = val; }
       });

       // 탐지 관리 컴포저블 초기화
       this._detection = createDetectionManager({
         getStores: () => ({
           file: useFileStore(),
           video: useVideoStore(),
           detection: useDetectionStore(),
           mode: useModeStore(),
           config: useConfigStore()
         }),
         getVideo: () => this.video,
         getVideoDir: () => this.getSelectedVideoDir(),
         drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.()
       });

       this._export = createExportManager({
         getStores: () => ({
           file: useFileStore(),
           video: useVideoStore(),
           detection: useDetectionStore(),
           mode: useModeStore(),
           config: useConfigStore(),
           export: useExportStore()
         }),
         getVideo: () => this.video,
         getCallbacks: () => ({
           validateCSVForExport: () => this.validateCSVForExport(),
           getMaskingRangeValue: () => this._settings.getMaskingRangeValue(),
           loadDetectionData: () => this.loadDetectionData(),
           copyJsonWithExport: (name, dir) => window.electronAPI.copyJsonWithExport({ videoName: name, outputDir: dir })
         }),
         getRefs: () => ({
           progressBar2: this.$refs.progressBar2,
           progressLabel2: this.$refs.progressLabel2
         })
       });

       // 비디오 제어 컴포저블 초기화
       this._videoController = createVideoController({
         getStores: () => ({
           video: useVideoStore(),
           detection: useDetectionStore(),
           mode: useModeStore(),
           file: useFileStore()
         }),
         getVideo: () => this.video
       });

       // 객체 관리 컴포저블 초기화
       this._objectManager = createObjectManager({
         getStores: () => ({
           detection: useDetectionStore(),
           file: useFileStore(),
           mode: useModeStore()
         }),
         getCallbacks: () => ({
           drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.(),
           rebuildMaskingLogsMap: () => useDetectionStore().rebuildMaskingLogsMap()
         }),
         getLocals: () => ({
           currentFrame: this.currentFrame,
           fileInfoItems5Value: this.fileInfoItems[5]?.value
         }),
         setLocal: (key, val) => { this[key] = val; }
       });

       // 비디오 편집 컴포저블 초기화
       this._videoEditor = createVideoEditor({
         getStores: () => ({
           video: useVideoStore(),
           file: useFileStore()
         }),
         getVideo: () => this.video,
         getCallbacks: () => ({
           selectFile: (idx) => this.selectFile(idx),
           formatFileSize: (bytes) => this.formatFileSize(bytes),
           analyzeVideoInfo: (idx, path) => this.analyzeVideoInfo(idx, path)
         }),
         getAppLocals: () => ({
           showMergeModal: this.showMergeModal,
           mergeSelections: this.mergeSelections,
           allSelected: this.allSelected,
           isProcessing: this.isProcessing,
           processingMessage: this.processingMessage
         }),
         setAppLocal: (key, val) => { this[key] = val; },
         getSliderEl: () => this.$el.querySelector('.slider-container')
       });

       window.addEventListener('resize', this.handleResize);
       window.addEventListener('mousemove', this.onMarkerMouseMove);
       window.addEventListener('mouseup', this.onMarkerMouseUp);
       window.addEventListener('mousedown', this.handleGlobalMouseDown); // 클릭 대신 mousedown

       // 키보드 이벤트 리스너 추가
       window.addEventListener('keydown', this.handleKeyDown);

       // 전체마스킹 토글 감시 → 자동으로 프리뷰 시작/중지
       this.$watch('exportAllMasking', newVal => {
         if (newVal === 'Yes') {
         this.$refs.videoCanvas?.startMaskPreview?.();
       } else {
         this.$refs.videoCanvas?.stopMaskPreview?.();
       }
       });
     },
     beforeUnmount() {
       window.removeEventListener('resize', this.handleResize);
       window.removeEventListener('mousemove', this.onMarkerMouseMove);
       window.removeEventListener('mouseup', this.onMarkerMouseUp);

       // 키보드 이벤트 리스너 제거
       window.removeEventListener('keydown', this.handleKeyDown);
 
       window.removeEventListener('mousedown', this.handleGlobalMouseDown);
       
       // 마스킹 프리뷰 정리
       this.$refs.videoCanvas?.stopMaskPreview?.();
      Object.values(this.conversionCache).forEach(url => {
        URL.revokeObjectURL(url);
      });
     },
   methods: {
    // ─── 비디오 제어 → composables/videoController.js 위임 ───
    getMaxPlaybackRate() { return this._videoController.getMaxPlaybackRate(); },
     // ─── 파일 관리 → composables/fileManager.js 위임 ───
     async setVideoPathFromItem(item) { return this._fileManager.setVideoPathFromItem(item); },
     getSelectedVideoDir() { return this._fileManager.getSelectedVideoDir(); },

     settingNoti() { this._settings.settingNoti(); },
     async saveSettings(val) { return this._settings.saveSettings(val); },
     async onClickFindDir() { return this._settings.onClickFindDir(); },
     
     async convertAndPlayFromPath(file, cacheKey) { return this._fileManager.convertAndPlayFromPath(file, cacheKey); },

     /* 키보드 단축키 → composables/videoController.js 위임 */
     handleKeyDown(event) { this._videoController.handleKeyDown(event); },
     isInputFocused() { return this._videoController.isInputFocused(); },


     /* ==========VideoCanvas 이벤트 핸들러=========== */
     async handleObjectDetect(payload) { return this._detection.handleObjectDetect(payload); },

     // 배치 마스킹 동기화 (VideoCanvas에서 emit)
     async handleMaskingBatch(entries) {
       if (!entries.length) return;
       
       const videoName = this.files[this.selectedFileIndex]?.name || 'default.mp4';
       const data = convertMaskingEntries(entries);
       
       try {
         await window.electronAPI.updateJson({ videoName, entries: data });
       } catch (error) {
         console.error('JSON 업데이트 오류:', error);
       }
     },

     // 컨텍스트 메뉴 (VideoCanvas에서 emit)
     handleContextMenu(payload) {
       const { x, y, trackId, clientX, clientY, shapeClicked } = payload;
       this.contextMenuVisible = true;
       this.contextMenuPosition = { x: clientX, y: clientY };
       this.selectedShape = trackId;
     },

     // 비디오 로드 완료 (VideoCanvas에서 emit)
     handleVideoLoaded(videoInfo) {
       this.videoDuration = videoInfo.duration;
       this.totalTime = formatTime(videoInfo.duration);
     },

     // 비디오 종료 (VideoCanvas에서 emit)
     handleVideoEnded() {
       this.videoPlaying = false;
     },
     /* ==========VideoCanvas 이벤트 핸들러 끝=========== */

     /* ==========비디오 제어 → composables/videoController.js 위임 =========== */
     async onVideoLoaded() {
       this.$refs.videoCanvas?.onVideoLoaded?.();
       
       // 비디오 로드 완료 후, 기존 탐지 데이터(JSON)가 있으면 자동으로 로드 및 표시
       await this.loadDetectionData();
       if (this.dataLoaded) {
         this.$refs.videoCanvas?.drawBoundingBoxes?.();
         console.log('[비디오로드] 기존 탐지 데이터 자동 표시');
       }
     },
     async onVideoEnded() {
       this.videoPlaying = false;
       if (this.newMaskings.length > 0) {
         await this.sendBatchMaskingsToBackend();
       }
       this.$refs.videoCanvas?.onVideoEnded?.();
     },
     togglePlay() { this._videoController.togglePlay(); },
     jumpBackward() { this._videoController.jumpBackward(); },
     jumpForward() { this._videoController.jumpForward(); },
     setPlaybackRate(rate) { this._videoController.setPlaybackRate(rate); },
     zoomIn() { this._videoController.zoomIn(); },
     zoomOut() { this._videoController.zoomOut(); },
     updateVideoProgress() { this._videoController.updateVideoProgress(); },
     /* ==========비디오 제어 위임 끝=========== */
 
     
 

 
     /* =======캔버스/마스킹 관련 메소드 끝========= */
     
     /* =======탐지 데이터 관련 메소드 → composables/detectionManager.js 위임 =========== */
     validateCSVForExport() { return this._detection.validateCSVForExport(); },
     async loadDetectionData() { return this._detection.loadDetectionData(); },
     parseCSVLegacy(csvText) { this._detection.parseCSVLegacy(csvText); },
     async exportDetectionData() { return this._detection.exportDetectionData(); },
 
     // 마스킹 로그 관리 (VideoCanvas로 이동)
     /*logMasking() {
       let bbox = null;

       if (this.maskMode === 'rectangle' && this.maskingPoints.length === 2) {
         const p0 = this.maskingPoints[0];
         const p1 = this.maskingPoints[1];
         const minX = Math.min(p0.x, p1.x);
         const minY = Math.min(p0.y, p1.y);
         const maxX = Math.max(p0.x, p1.x);
         const maxY = Math.max(p0.y, p1.y);
         bbox = [minX, minY, maxX, maxY];
       } else if (this.maskMode === 'polygon' && this.maskingPoints.length > 0 && this.isPolygonClosed) {
         bbox = this.maskingPoints.map(p => [p.x, p.y]);
       }
 
       const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
 
 
     const excludedFrame = currentFrame;
 
     if (this.maskFrameStart !== null && this.maskFrameEnd !== null) {
       for (let f = this.maskFrameStart; f <= this.maskFrameEnd; f++) {
          // if (f === excludedFrame) {
          //   continue;
          // }
         this.saveMaskingEntry(f, bbox);
       }
     }
     }, 
     // 마스킹 데이터 관리 → composables/maskingData.js 위임
     saveMaskingEntry(frame, bbox) { this._masking.saveMaskingEntry(frame, bbox); },
     saveManualMaskingEntry(frame, bbox) { this._masking.saveManualMaskingEntry(frame, bbox); },
     async sendBatchMaskingsToBackend() { return this._masking.sendBatchMaskingsToBackend(); },
     rebuildMaskingLogsMap() { useDetectionStore().rebuildMaskingLogsMap(); },
     addToMaskingLogsMap(entry) { useDetectionStore().addToMaskingLogsMap(entry); },
     /* =======탐지 데이터 관련 메소드 끝=========== */
 
     /* =======객체 탐지 관련 메소드 → composables/detectionManager.js 위임 =========== */
     autoObjectDetection() { this._detection.autoObjectDetection(); },
     executeMultiAutoDetection() { this._detection.executeMultiAutoDetection(); },
     performAutoDetectionForFile(file, isMulti) { return this._detection.performAutoDetectionForFile(file, isMulti); },
     toggleAllAutoDetectionSelection() { this._detection.toggleAllAutoDetectionSelection(); },
     resetSelectionDetection() { this._detection.resetSelectionDetection(); },
     /* =======객체 탐지 관련 메소드 끝=========== */
 
     /* =======파일 관리 관련 메소드 → composables/fileManager.js 위임 =========== */
     async selectFile(index) { return this._fileManager.selectFile(index); },
     deleteFile() { this._fileManager.deleteFile(); },
     async triggerFileInput() { return this._fileManager.triggerFileInput(); },
     async onFileSelected(event) { return this._fileManager.onFileSelected(event); },
     formatFileSize(bytes) { return this._fileManager.formatFileSize(bytes); },
     updateFileInfoDisplay(fileInfo) { this._fileManager.updateFileInfoDisplay(fileInfo); },
     resetVideoInfo() { this._fileManager.resetVideoInfo(); },
     updateVideoInfoFromElectron(file) { this._fileManager.updateVideoInfoFromElectron(file); },
     async convertAndPlay(file, cacheKey) { return this._fileManager.convertAndPlay(file, cacheKey); },
     /* =======파일 관리 관련 메소드 끝=========== */
 
     /* =======비디오 편집 → composables/videoEditor.js 위임 =========== */
     async trimVideo() { return this._videoEditor.trimVideo(); },
     mergeVideo() { this._videoEditor.mergeVideo(); },
     async executeMerge() { return this._videoEditor.executeMerge(); },
     async analyzeVideoInfo(fileIndex, filePath) { return this._fileManager.analyzeVideoInfo(fileIndex, filePath); },
     closeMergeModal() { this._videoEditor.closeMergeModal(); },
     toggleSelectAll() { this._videoEditor.toggleSelectAll(); },
     updateAllSelected() { this._videoEditor.updateAllSelected(); },
     startNewSession() { this._videoEditor.startNewSession(); },
     onMarkerMouseDown(markerType, event) { this._videoEditor.onMarkerMouseDown(markerType, event); },
     onMarkerMouseMove(event) { this._videoEditor.onMarkerMouseMove(event); },
     onMarkerMouseUp() { this._videoEditor.onMarkerMouseUp(); },
     /* =======비디오 편집 위임 끝=========== */
 
     /* =======워터마크 관리 관련 메소드=========== */
     // drawWatermarkPreview, getWatermarkCoords, getScale 메서드는 VideoCanvas 컴포넌트로 이동
 
     // 워터마크 설정
     async onWatermarkImageUpload() { return this._settings.onWatermarkImageUpload(); },
     async onWatermarkImageDelete() { return this._settings.onWatermarkImageDelete(); },
     applyWatermark() { this._settings.applyWatermark(); },
     preloadWatermarkImage() { this._settings.preloadWatermarkImage(); },
     closeWatermarkModal() { this._settings.closeWatermarkModal(); },
     /* =======워터마크 관리 관련 메소드 끝=========== */
 
     /* =======설정 관리 관련 메소드 → composables/settingsManager.js 위임 =========== */
     async getExportConfig() { return this._settings.getExportConfig(); },
     formatDateToYMD(date) { return this._settings.formatDateToYMD(date); },
     getDetectObjValue() { return this._settings.getDetectObjValue(); },
     getMaskingRangeValue() { return this._settings.getMaskingRangeValue(); },
     closeSettingModal() { this._settings.closeSettingModal(); },
     /* =======설정 관리 관련 메소드 끝=========== */
 
     /* =======컨텍스트 메뉴 및 객체 관리 → composables/objectManager.js 위임 =========== */
     handleContextMenuAction(action) { this._objectManager.handleContextMenuAction(action); },
     setSelectedObject(trackId) { this._objectManager.setSelectedObject(trackId); },
     deleteObjectByTrackId(trackId) { this._objectManager.deleteObjectByTrackId(trackId); },
     deleteObjectsByType(type) { this._objectManager.deleteObjectsByType(type); },
     /* =======컨텍스트 메뉴 및 객체 관리 위임 끝=========== */
 
     /* =======마스킹 프리뷰 관련 메소드=========== */
     // startMaskPreview, stopMaskPreview, applyEffectFull 메서드는 VideoCanvas 컴포넌트로 이동
     /* =======마스킹 프리뷰 관련 메소드 끝=========== */
 
     /* =======내보내기 관련 메소드 → composables/exportManager.js 위임 =========== */
     async sendExportRequest() { return this._export.sendExportRequest(); },
     validatePasswordCharacters(password) { return this._export.validatePasswordCharacters(password); },
     /* =======내보내기 관련 메소드 끝=========== */
 
     /* =======프레임 범위 마스킹 관련 메소드=========== */
     confirmMaskFrameRange() {
           const validation = validateFrameRange(
             this.frameMaskStartInput, 
             this.frameMaskEndInput, 
             this.fileInfoItems[5]?.value
           );
           
           if (!handleValidation(validation, showMessage)) {
             return;
           }
           this.maskFrameStart = this.frameMaskStartInput;
           this.maskFrameEnd = this.frameMaskEndInput;
           this.showMaskFrameModal = false;
           
           this._masking.logMasking();
           this.sendBatchMaskingsToBackend();
           this.exportDetectionData();
           this.loadDetectionData();

            this.maskingPoints = [];           // 추가
            this.isPolygonClosed = false;      // 추가
            this.maskFrameStart = null;        // 추가
            this.maskFrameEnd = null;          // 추가
           
          this.currentMode = '';
     },
     cancelMaskFrameRange() {
       this.showMaskFrameModal = false;
     },
     /* =======프레임 범위 마스킹 관련 메소드 끝=========== */
 
     /* =======유틸리티/헬퍼 관련 메소드=========== */

     //비밀번호 표시 / 숨기기
     togglePasswordVisibility() {
      this.showPassword = !this.showPassword;
     },
     // 기하학적 계산
     // isPointInPolygon, getBBoxString 메서드는 VideoCanvas 컴포넌트로 이동
 
     // 이벤트 처리
     handleGlobalMouseDown(e) {
         const menu = document.querySelector('.context-menu');
         if (menu && !menu.contains(e.target)) {
           this.contextMenuVisible = false;
         }
     },
     async handleMenuItemClick(item) {
       this.selectMode = false; // 먼저 전역 클릭 가능 여부 초기화
       this.currentMode = ''; // 모드 초기화
 
 
       if (item === '불러오기') {
         this.triggerFileInput();
       } 
         else if (item === '자동객체탐지') {
           // 다중파일 옵션이 활성화되어 있다면 모달 열기
             if (this.allConfig.detect.multifiledetect !== 'no') {
             // files 배열 크기만큼 체크박스 배열 초기화
             this.autoDetectionSelections = this.files.map(() => false);
             this.showMultiAutoDetectionModal = true;
           } else {
             // 기존 단일 파일 자동객체탐지 실행
             this.autoObjectDetection();
           }
         } 
         else if (item === '선택객체탐지') {
           // 이미 실행했던 탐지 플래그를 초기화하여 새 탐지 허용
           this.resetSelectionDetection();
           this.currentMode = 'select';
           this.selectMode = true;
         }
         else if (item === '수동객체탐지') {
           this.currentMode = 'manual';     // 모드 설정
           this.selectMode = true;          // 클릭 활성화
           this.manualBox = null;           // 새 마스킹 초기화
           this.isDrawingManualBox = false; // 드래그 상태 초기화
             this._masking.checkBiggestTrackId(3);
         }
         else if (item === '영역마스킹') {
           this.currentMode = 'mask';
           this.selectMode = true;
           const isPolygon = await window.electronAPI.areaMaskingMessage("영역 마스킹 방식을 선택해주세요.");
           if (isPolygon === 2) {
            this.currentMode = '';
            return;
           }
           this.maskMode = isPolygon === 0 ? 'polygon' : 'rectangle';
             this.video.pause();
             this.videoPlaying = false;
             this._masking.checkBiggestTrackId(4);
         } 
         else if (item === '전체마스킹') {
           if (this.exportAllMasking === 'No') {
             this.exportAllMasking = 'Yes';
             const typeText = this.allConfig.export.maskingtool === '0' ? '모자이크' : '블러';
             this.currentMode = '';      
             this.selectMode = true;
             showMessage(MESSAGES.MASKING.ALL_ENABLED(typeText)); 
           } else {
             this.exportAllMasking = 'No';
             this.currentMode = '';      
             this.selectMode = true;
             showMessage(MESSAGES.MASKING.ALL_DISABLED);
           }
         }
         else if (item === '미리보기') {
         this.isBoxPreviewing = !this.isBoxPreviewing;
         const msg = this.isBoxPreviewing ? '미리보기 시작' : '미리보기 중지';
         if(!this.isBoxPreviewing) {
           this.selectMode = true;
         }
         showMessage(msg);
         // 강제 리드로우
         this.$refs.videoCanvas?.drawBoundingBoxes?.();
       } 
         else if (item === '내보내기') {
             this.exporting = true;
       }
       else if (item === '일괄처리') {
          this.batchProcessing();
         } 
         else if (item === '설정') {
           // 설정 모달 열기
           this.showSettingModal = true;
         }
     },

     async batchProcessing() { return this._export.batchProcessing(); },
     startBatchPolling() { this._export.startBatchPolling(); },
     stopBatchPolling() { this._export.stopBatchPolling(); },
     cancelBatchProcessing() { this._export.cancelBatchProcessing(); },
     resetBatchState() { this._export.resetBatchState(); },
 
     // 다중 선택 관리
     toggleSelectAllVideos() {
         const newState = !this.allVideoSelected;
         this.serverVideoList.forEach(video => {
           video.selected = newState;
         });
     },
     closeMultiAutoDetectionModal() {
       this.showMultiAutoDetectionModal = false;
     },
     closeExportingModal() {
       this.exporting = false;
     },
     /* =======유틸리티/헬퍼 관련 메소드 끝=========== */
   }
 };
 </script>
 
 <!-- batch-processing-modal 스타일은 BatchProcessingModal.vue scoped style로 이동 완료 -->