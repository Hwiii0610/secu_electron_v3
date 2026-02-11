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
      'detectionResults', 'isDetecting', 'detectionIntervalId',
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
    getMaxPlaybackRate() {
        return this.video && this.video.duration < 10 ? 2.5 : 3.5;
      },
     // ─── 파일 관리 → composables/fileManager.js 위임 ───
     async setVideoPathFromItem(item) { return this._fileManager.setVideoPathFromItem(item); },
     getSelectedVideoDir() { return this._fileManager.getSelectedVideoDir(); },

     settingNoti() { this._settings.settingNoti(); },
     async saveSettings(val) { return this._settings.saveSettings(val); },
     async onClickFindDir() { return this._settings.onClickFindDir(); },
     
     async convertAndPlayFromPath(file, cacheKey) { return this._fileManager.convertAndPlayFromPath(file, cacheKey); },

     /* 키보드 단축키 관련 메소드 */
     handleKeyDown(event) {
      if(this.isInputFocused()) return;
      if(!this.video || this.selectedFileIndex < 0) return;

      // 단축키 실행
        switch (event.code) {
          case 'ArrowRight':
            event.preventDefault();
            if(this.video.playbackRate < this.getMaxPlaybackRate()){
              this.setPlaybackRate('fast');
            }
            break;
          case 'ArrowLeft':
            event.preventDefault();
            if(this.video.playbackRate > 0.5){
              this.setPlaybackRate('slow');
            }
            break;
          case 'Space':
            event.preventDefault();
            this.togglePlay();
            break;
          case 'KeyA':
            event.preventDefault();
            this.jumpBackward();
            break;
          case 'KeyD':
            event.preventDefault();
            this.jumpForward();
            break;
        }
      },
      isInputFocused() {
        const activeElement = document.activeElement;
        return activeElement && (
          activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA' || 
          activeElement.isContentEditable
        );
      },


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

     /* ==========비디오 제어 관련 메소드=========== */
     // 비디오 생명주기
     onVideoLoaded() {
       // VideoCanvas 컴포넌트에 위임
       this.$refs.videoCanvas?.onVideoLoaded?.();
     },
     async onVideoEnded() {
       this.videoPlaying = false;
       
       if (this.newMaskings.length > 0) {
         await this.sendBatchMaskingsToBackend();
       }
       
       // VideoCanvas 컴포넌트에 위임
       this.$refs.videoCanvas?.onVideoEnded?.();
     },
 
     // 재생 제어
     togglePlay() {
       if (this.video) {
         if (this.video.paused) {
           // CSV 파일이 로드된 경우에는 자동으로 CSV를 내보내지 않음
           if (!this.dataLoaded && this.currentMode === 'mask' && this.maskingLogs.length > 0) {
           }
           this.video.play();
           this.videoPlaying = true;
         } else {
           this.video.pause();
           this.videoPlaying = false;
         }
       }
     },
     jumpBackward() {
       if (this.video && this.frameRate > 0) {
         const frameTime = 1 / this.frameRate;
         this.video.currentTime = Math.max(0, this.video.currentTime - frameTime);
       }
     },
     jumpForward() {
       if (this.video && this.video.duration && this.frameRate > 0) {
         const frameTime = 1 / this.frameRate;
         this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + frameTime);
       }
     },
     setPlaybackRate(rate) {
      if (this.video) {
        // 영상 길이에 따라 최대 속도 결정
        const maxRate = this.video.duration < 10 ? 2.5 : 3.5;
        
        if(rate === 'slow'){
          this.video.playbackRate = Math.max(0.5, this.video.playbackRate - 0.5);
        }else{
          this.video.playbackRate = Math.min(maxRate, this.video.playbackRate + 0.5);
        }
        // 반응형 변수도 함께 업데이트
        this.currentPlaybackRate = this.video.playbackRate;
      }
    },
 
     // 화면 제어
     zoomIn() {
       this.zoomLevel += 0.1;
       if (this.video) {
         this.video.style.transform = `scale(${this.zoomLevel})`;
       }
     },
     zoomOut() {
       this.zoomLevel = Math.max(0.5, this.zoomLevel - 0.1);
       if (this.video) {
         this.video.style.transform = `scale(${this.zoomLevel})`;
       }
     },
 
     // 진행률 제어
     updateVideoProgress() {
       if (this.video && this.video.duration) {
         this.video.currentTime = (this.progress / 100) * this.video.duration;
       }
     },
     /* ==========비디오 관련 메소드 끝=========== */
 
     
 

 
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
 
     /* =======비디오 편집 관련 메소드=========== */
     // 자르기
     async trimVideo() {
       if (!this.video) return;
       if (this.trimStartTime >= this.trimEndTime) {
         console.error("잘못된 자르기 범위입니다. 시작점은 끝점보다 작아야 합니다.");
         return;
       }
       const selectedFile = this.files[this.selectedFileIndex];
       if (!selectedFile) {
         showMessage(MESSAGES.EDIT.NO_FILE_SELECTED); 
         return;
       }
       if (confirm("자르시겠습니까?")) {
         this.isProcessing = true;
         this.processingMessage = '비디오를 자르는 중입니다.'
 
         try {
          const data = await window.electronAPI.trimVideo({
              videoName: selectedFile.name,
              startTime: this.trimStartTime,
              endTime: this.trimEndTime
            });
           
           // 현재 세션의 timeFolder 설정
           if (!this.currentTimeFolder) {
             this.currentTimeFolder = data.timeFolder;
           }
           
           // 세션별 자른 파일 목록에 추가
           this.sessionCroppedFiles.push({
             name: data.fileName,
             size: this.formatFileSize(data.fileSize),
             filePath: data.filePath,
             timeFolder: data.timeFolder
           });
           
         } catch (error) {
           console.error("자르기 실행 중 오류 발생:", error);
           showError(error, MESSAGES.EDIT.TRIM_ERROR('').replace(/:.*/, ': ')); 
         } finally {
           this.isProcessing = false;
         }
       }
     },
 
     // 합치기
     mergeVideo() {
       if (this.sessionCroppedFiles.length === 0) {
         showMessage(MESSAGES.EDIT.NO_CROPPED_FILES); 
         return;
       }
       this.showMergeModal = true;
       this.mergeSelections = this.sessionCroppedFiles.map(() => false);
     },
     async executeMerge() {
       try {
         const selectedFiles = this.sessionCroppedFiles.filter((_, index) => this.mergeSelections[index]);
         
        //  if (selectedFiles.length < 2) {
        //    window.electronAPI.showMessage("합치기 위해서는 최소 2개 이상의 파일을 선택해야 합니다."); 
        //    return;
        //  }
         
         this.isProcessing = true;
         this.processingMessage = '구간 편집 중입니다...'

         try{
         // 파일 경로 배열 전송 (crop/시간폴더/파일명 형태)
         const data = await window.electronAPI.mergeVideos({
            filePaths: selectedFiles.map(file => file.filePath)
          });
         
          const baseDirWin = normalizeFilePath(this.dirConfig.videoDir || '');
          const absolutePath = data.absolutePath ? normalizeFilePath(data.absolutePath) : `${baseDirWin}/${data.fileName}`;
          //const fileUrl = `file:///${normalizeFilePath(absolutePath)}`;

    
          const newFile = {
            name: data.fileName,
            size: this.formatFileSize(data.fileSize),
            url: absolutePath,
            isServerFile: true,
            duration: '분석 중...',
            resolution: '분석 중...',
            frameRate: '분석 중...',
            totalFrames: '분석 중...',
          }

          this.files.push(newFile);
          const newIndex = this.files.length - 1;
          
          this.selectFile(newIndex);
          this.analyzeVideoInfo(newIndex, absolutePath);

          this.showMergeModal = false;
          this.allSelected = false;
          
          showMessage(MESSAGES.EDIT.MERGE_COMPLETED(data.fileName)); 
          
        } catch (error) {
          console.error("합치기 실행 중 오류 발생:", error);
          showError(error, MESSAGES.EDIT.MERGE_ERROR('').replace(/:.*/, ': ')); 
        }
      } finally {
        this.isProcessing = false;
      }
    },

    async analyzeVideoInfo(fileIndex, filePath) { return this._fileManager.analyzeVideoInfo(fileIndex, filePath); },

 
     // 모달 제어
     closeMergeModal() {
       this.showMergeModal = false;
       this.allSelected = false;
     },
     toggleSelectAll() {
       const newValue = !this.allSelected;
       this.mergeSelections = this.sessionCroppedFiles.map(() => newValue);
       this.allSelected = newValue;
     },
     updateAllSelected() {
       this.allSelected = this.mergeSelections.every(selection => selection);
     },
     startNewSession() {
       this.currentTimeFolder = null;
       this.sessionCroppedFiles = [];
     },
 
     // 마우스 이벤트
     onMarkerMouseDown(markerType, event) {
       event.preventDefault();
       this.trimDragging = markerType;
     },
     onMarkerMouseMove(event) {
       if (!this.trimDragging || !this.videoDuration) return;
       const sliderRect = this.$el.querySelector('.slider-container').getBoundingClientRect();
       let posX = event.clientX - sliderRect.left;
       posX = Math.max(0, Math.min(posX, sliderRect.width));
       const newTime = (posX / sliderRect.width) * this.videoDuration;
       if (this.trimDragging === 'start') {
         this.trimStartTime = Math.min(newTime, this.trimEndTime - 0.1);
       } else if (this.trimDragging === 'end') {
         this.trimEndTime = Math.max(newTime, this.trimStartTime + 0.1);
       }
     },
     onMarkerMouseUp() {
       this.trimDragging = null;
     },
     /* =======비디오 편집 관련 메소드 끝=========== */
 
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
 
     /* =======컨텍스트 메뉴 및 객체 관리 관련 메소드=========== */
     // 컨텍스트 메뉴
     handleContextMenuAction(action) {
       this.contextMenuVisible = false;
       switch (action) {
         case 'set-frame':
             this.frameMaskStartInput = this.currentFrame;
             this.frameMaskEndInput = this.fileInfoItems[5].value;
           this.showMaskFrameModal = true;
           break;
         case 'toggle-identified':
           this.setSelectedObject(this.selectedShape);
           break;
 
         case 'delete-selected':
             // 선택된 객체 삭제 (클릭한 특정 객체의 track_id 기반)
             this.deleteObjectByTrackId(this.selectedShape);
           break;
             
           case 'delete-all-types':
             // 전체객체탐지 결과 삭제
             if (confirm('모든 객체탐지 결과를 삭제하시겠습니까?')) {
               this.deleteObjectsByType(null); // null은 타입 구분 없이 모두 삭제
             }
           break;
             
           case 'delete-auto':
             // 자동객체탐지 결과만 삭제 (type: 0, 1, 2 등)
             if (confirm('자동객체탐지 결과를 삭제하시겠습니까?')) {
               this.deleteObjectsByType(1); 
             }
             break;
             
           case 'delete-select':
             // 선택객체탐지 결과만 삭제 (일반적으로 type: 2)
             if (confirm('선택객체탐지 결과를 삭제하시겠습니까?')) {
               this.deleteObjectsByType(2);
             }
             break;
             
           case 'delete-masking':
             // 영역마스킹 결과만 삭제 (type: 4)
             if (confirm('영역마스킹 결과를 삭제하시겠습니까?')) {
               this.deleteObjectsByType(4);
             }
             break;
             
           case 'delete-manual':
             // 수동객체탐지 결과만 삭제 (type: 3)
             if (confirm('수동객체탐지 결과를 삭제하시겠습니까?')) {
               this.deleteObjectsByType(3);
             }
             break;
         }
     },
     // findTrackIdAtPosition 메서드는 VideoCanvas 컴포넌트로 이동
 
     // 객체 조작
     setSelectedObject(trackId) {
      if (!trackId) {
          showMessage(MESSAGES.DETECTION.NO_SELECTION); 
          return;
        }

      let modifiedCount = 0;
  
      // trackId와 일치하는 객체들의 object 값 토글
      this.maskingLogs = this.maskingLogs.map(log => {
        if (log.track_id === trackId) {
          modifiedCount++;
          // object 값이 1이면 2로, 2면 1로, 없거나 다른 값이면 1로 설정
          return {
            ...log,
            object: log.object === 1 ? 2 : (log.object === 2 ? 1 : 1)
          };
        }
        return log;
      });
      
      if (modifiedCount > 0) {
        // maskingLogsMap 갱신 (중요!)
        this.rebuildMaskingLogsMap();
        
        // 즉시 화면 업데이트
        this.$refs.videoCanvas?.drawBoundingBoxes?.();
        
        // 변경된 데이터를 서버에 전송
        const videoName = this.files[this.selectedFileIndex]?.name || "unknown.mp4";

          window.electronAPI.updateFilteredJson({
            videoName: videoName,
            data: JSON.parse(JSON.stringify(this.maskingLogs))
          })
        .then(result => {
          // 업데이트 완료
        })
        .catch(error => {
          console.error('JSON 업데이트 오류:', error);
        });
        
        showMessage(MESSAGES.DETECTION.STATUS_CHANGED(modifiedCount)); 
      } else {
        showMessage(MESSAGES.DETECTION.OBJECT_NOT_FOUND);
      }
    },
     deleteObjectByTrackId(trackId) {
         if (!trackId) {
           showMessage(MESSAGES.DETECTION.NO_SELECTION); 
           return;
         }
         
         const beforeCount = this.maskingLogs.length;
         this.maskingLogs = this.maskingLogs.filter(log => log.track_id !== trackId);
         this.rebuildMaskingLogsMap();
         const deletedCount = beforeCount - this.maskingLogs.length;

         if (deletedCount > 0) {
           const videoName = this.files[this.selectedFileIndex]?.name || "unknown.mp4";

           window.electronAPI.updateFilteredJson({
             videoName: videoName,
             data: JSON.parse(JSON.stringify(this.maskingLogs))
           })
           .then(result => {
             this.$refs.videoCanvas?.drawBoundingBoxes?.();
           })
           .catch(error => {
             console.error('JSON 업데이트 오류:', error);
           });

           showMessage(MESSAGES.MASKING.DELETED(deletedCount, trackId));
         } else {
           showMessage(MESSAGES.MASKING.DELETE_FAILED);
         }
     },
     deleteObjectsByType(type) {
         const beforeCount = this.maskingLogs.length;

         if (type === null) {
           this.maskingLogs = [];
         } else {
           this.maskingLogs = this.maskingLogs.filter(log => log.type != type);
         }
         this.rebuildMaskingLogsMap();

         const deletedCount = beforeCount - this.maskingLogs.length;

         if (deletedCount > 0) {
           const videoName = this.files[this.selectedFileIndex]?.name || "unknown.mp4";

           window.electronAPI.updateFilteredJson({
             videoName: videoName,
             data: JSON.parse(JSON.stringify(this.maskingLogs))
           })
           .then(result => {
             this.$refs.videoCanvas?.drawBoundingBoxes?.();
           })
           .catch(error => {
             console.error('JSON 업데이트 오류:', error);
             showMessage(MESSAGES.MASKING.DELETE_ERROR);
           });

           showMessage(MESSAGES.MASKING.DELETED(deletedCount, ''));
         } else {
           showMessage(MESSAGES.MASKING.NO_DATA);
         }
     },
     /* =======컨텍스트 메뉴 및 객체 관리 관련 메소드 끝=========== */
 
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
           
           this.logMasking();
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
             this.checkBiggestTrackId(3);
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
             this.checkBiggestTrackId(4);
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
 
 <style scoped>
 .batch-processing-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.batch-processing-modal-content {
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 24px;
  min-width: 450px;
  color: #fff;
}

.batch-processing-modal .modal-header {
  margin-bottom: 20px;
  border-bottom: 1px solid #444;
  padding-bottom: 12px;
}

.batch-processing-modal .modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.batch-info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.info-label {
  color: #888;
}

.info-value {
  color: #fff;
  font-weight: 500;
}

.progress-section {
  margin-top: 16px;
}

.progress-label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.batch-progress-bar-container,
.file-progress-bar-container {
  width: 100%;
  height: 24px;
  background: #333;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.batch-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #2196F3, #4CAF50);
  border-radius: 12px;
  transition: width 0.3s ease;
}

.file-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #FF9800, #FFC107);
  border-radius: 12px;
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.batch-processing-modal .modal-footer {
  margin-top: 24px;
  text-align: right;
}

.batch-processing-modal .action-button.cancel {
  background: #f44336;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.batch-processing-modal .action-button.cancel:hover {
  background: #d32f2f;
}
</style>