<template>
  <div class="container" tabindex="-1" ref="appContainer" role="application" aria-label="SecuWatcher 영상 분석 애플리케이션">
    <!-- Splash Screen -->
    <div v-if="uiState.isLoading" class="splash-screen" role="status" aria-live="polite">
      <img src="./assets/SECUWATCHER_LOGO.png" alt="SecuWatcher" class="splash-logo" />
      <p class="splash-text">SecuWatcher Export</p>
      <div class="splash-loader"></div>
    </div>


    <div class="app-layout">
      <!-- 좌측 사이드바 -->
      <SideBar
        :handleMenuItemClick="menuHandler.handleMenuItemClick"
        :isFilePanelOpen="isFilePanelOpen"
        @toggle-file-panel="toggleFilePanel"
      />

      <!-- 메인 영역 -->
      <div class="main-area">
        <!-- 상단 컨텍스트바 -->
        <ContextBar />

        <!-- 비디오 영역 -->
        <div class="video-wrapper" role="region" aria-label="비디오 재생 영역">
          <VideoCanvas
            ref="videoCanvas"
            :video-src="currentVideoUrl"
            :selected-file="files[selectedFileIndex]"
            :watermark-image="watermarkImage"
            :cached-watermark-image="cachedWatermarkImage"
            :watermark-image-loaded="watermarkImageLoaded"
            @object-detect="detectionManager.handleObjectDetect"
            @masking-batch="handleMaskingBatch"
            @context-menu="handleContextMenu"
            @track-menu="handleTrackMenu"
            @video-loaded="handleVideoLoaded"
            @video-ended="handleVideoEnded"
            @hover-change="hoveredBoxId = $event"
            @seeked="detectionManager.notifySeek()"
          />
          <DetectingPopup ref="detectingPopup" @cancel-detection="detectionManager.cancelDetection()" />
          <ContextMenu @action="objectManager.handleContextMenuAction" />
          <TrackMenu @action="handleTrackMenuAction" />

          <!-- 파일 추가 시 중복 파일 알림 (우측 상단 노티) -->
          <transition name="file-noti-fade">
            <div v-if="fileNoti.visible" class="file-noti-overlay">
              <div class="file-noti-card">
                <div class="file-noti-header">
                  <span class="file-noti-icon">⚠</span>
                  <span class="file-noti-title">중복 파일 {{ fileNoti.skippedFiles.length }}건 건너뜀</span>
                  <button class="file-noti-close" @click="fileNoti.visible = false">&times;</button>
                </div>
                <ul class="file-noti-list">
                  <li v-for="(fname, idx) in fileNoti.skippedFiles" :key="idx">{{ fname }}</li>
                </ul>
              </div>
            </div>
          </transition>

          <VideoControls
            @update-progress="videoController.updateVideoProgress()"
            @marker-mousedown="videoEditor.onMarkerMouseDown"
            @zoom-in="videoController.zoomIn()"
            @zoom-out="videoController.zoomOut()"
            @jump-backward="videoController.jumpBackward()"
            @jump-forward="videoController.jumpForward()"
            @toggle-play="videoController.togglePlay()"
            @set-playback-rate="videoController.setPlaybackRate"
            @trim-video="videoEditor.trimVideo()"
            @merge-video="videoEditor.mergeVideo()"
          />
        </div>
        <!-- 파일 패널 (main-area 내부, 사이드바 겹침 방지) -->
        <transition name="slide-panel">
          <FilePanel
            v-show="isFilePanelOpen"
            @select-file="fileManager.selectFile"
            @trigger-file-input="fileManager.triggerFileInput()"
            @delete-file="fileManager.deleteFile()"
            @close="toggleFilePanel"
          />
        </transition>
      </div>
    </div>

    <!-- 모달 컴포넌트 -->
    <MultiDetectionModal @execute="detectionManager.executeMultiAutoDetection()" />
    <BatchProcessingModal />

    <MaskingAreaModal
      :is-visible="uiState.showMaskingAreaModal"
      :is-processing="uiState.isProcessing"
      @confirm="uiState.closeMaskingAreaModal()"
      @cancel="uiState.closeMaskingAreaModal()"
      @confirm-selection="handleMaskingAreaSelection"
    />

    <div v-show="toastVisible" class="toast" :class="toastTypeClass" role="status" aria-live="assertive" aria-label="알림">
      {{ toastMsg }}
    </div>

    <ExportModal @send-export="exportManager.sendExportRequest()" @find-dir="settingsManager.onClickFindDir()" />

    <MergeModal
      :show="uiState.showMergeModal"
      :selections="uiState.mergeSelections"
      :allSelected="uiState.allSelected"
      @close="uiState.closeMergeModal()"
      @execute="videoEditor.executeMerge()"
      @update:selections="uiState.mergeSelections = $event"
      @update:allSelected="uiState.allSelected = $event"
    />

    <SettingsModal @save="settingsManager.saveSettings" @close="showSettingModal = false" @setting-noti="settingsManager.settingNoti()" />
    <WatermarkModal @apply="settingsManager.applyWatermark()" @upload-image="settingsManager.onWatermarkImageUpload()" @delete-image="settingsManager.onWatermarkImageDelete()" />
    <ProcessingModal :isProcessing="uiState.isProcessing" :processingMessage="uiState.processingMessage" />
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
import MaskingAreaModal from './components/modals/MaskingAreaModal.vue';
import ExportModal from './components/modals/ExportModal.vue';
import SettingsModal from './components/modals/SettingsModal.vue';
import WatermarkModal from './components/modals/WatermarkModal.vue';
import SideBar from './components/SideBar.vue';
import ContextBar from './components/ContextBar.vue';
import ContextMenu from './components/ContextMenu.vue';
import TrackMenu from './components/TrackMenu.vue';
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
import { createUIState } from './composables/uiState';
import { createMenuHandler } from './composables/menuHandler';
import { createKeyboardManager } from './composables/keyboardManager';
import { convertMaskingEntries, formatTime } from './utils';

export default {
  name: 'Export',
  components: {
    ProcessingModal, FolderLoadingModal, DetectingPopup, BatchProcessingModal,
    MultiDetectionModal, MergeModal, MaskingAreaModal, ExportModal,
    SettingsModal, WatermarkModal, SideBar, ContextBar, ContextMenu, TrackMenu,
    VideoControls, FilePanel, VideoCanvas,
  },
  data() {
    // 더미 함수 - 초기화 전 임시 사용
    const noop = () => {};
    const asyncNoop = async () => {};
    
    return {
      currentVideoUrl: '',
      // 파일 추가 중복 알림 상태
      fileNoti: {
        visible: false,
        skippedFiles: [],
      },
      video: null,
      // 토스트 전용 반응성 상태
      toastVisible: false,
      toastMsg: '',
      toastTypeClass: '',
      // Composables (초기값 설정으로 null 오류 방지)
      uiState: {
        isLoading: true,
        isProcessing: false,
        processingMessage: '',
        showToast: false,
        toastMessage: '',
        toastType: 'info',
        showMaskingAreaModal: false,
        showMergeModal: false,
        mergeSelections: [],
        allSelected: false,
        closeMaskingAreaModal: noop,
        closeMergeModal: noop,
        setLoading: noop,
        showProcessing: noop,
        hideProcessing: noop,
        showToastMessage: noop,
      },
      menuHandler: {
        handleMenuItemClick: noop,
      },
      keyboardManager: null,
      isFilePanelOpen: true,
      fileManager: {
        selectFile: asyncNoop,
        deleteFile: noop,
        triggerFileInput: asyncNoop,
        onFileSelected: asyncNoop,
      },
      detectionManager: {
        cancelDetection: noop,
        handleObjectDetect: noop,
        executeMultiAutoDetection: asyncNoop,
        autoObjectDetection: asyncNoop,
        resetSelectionDetection: noop,
        loadDetectionData: asyncNoop,
        validateCSVForExport: () => false,
      },
      exportManager: {
        batchProcessing: asyncNoop,
        sendExportRequest: asyncNoop,
      },
      videoController: {
        updateVideoProgress: noop,
        onMarkerMouseDown: noop,
        zoomIn: noop,
        zoomOut: noop,
        jumpBackward: noop,
        jumpForward: noop,
        togglePlay: noop,
        setPlaybackRate: noop,
        handleKeyDown: noop,
        isInputFocused: () => false,
        jumpToTrackStart: noop,
        jumpToTrackEnd: noop,
      },
      videoEditor: {
        onMarkerMouseDown: noop,
        onMarkerMouseMove: noop,
        onMarkerMouseUp: noop,
        trimVideo: asyncNoop,
        mergeVideo: asyncNoop,
        executeMerge: asyncNoop,
        startNewSession: noop,
      },
      objectManager: {
        handleContextMenuAction: noop,
      },
      maskingManager: null,
      settingsManager: null,
    };
  },
  computed: {
    ...mapWritableState(useVideoStore, [
      'currentTime', 'totalTime', 'progress', 'videoPlaying', 'zoomLevel',
      'frameRate', 'videoDuration', 'currentPlaybackRate', 'currentFrame',
      'previousFrame', 'trimStartTime', 'trimEndTime', 'trimDragging',
      'conversion', 'conversionCache', 'frameStepMode'
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
      'detectionEventType', 'hasSelectedDetection', 'manualBiggestTrackId', 'maskBiggestTrackId',
      'hoveredBoxId', 'showMultiAutoDetectionModal', 'autoDetectionSelections'
    ]),
    ...mapWritableState(useModeStore, [
      'currentMode', 'selectMode', 'isBoxPreviewing', 'exportAllMasking',
      'maskMode', 'maskCompleteThreshold', 'maskingPoints', 'isDrawingMask',
      'isPolygonClosed', 'contextMenuVisible', 'contextMenuPosition', 'selectedShape',
      'trackMenuVisible', 'trackMenuPosition', 'trackMenuTrackId'
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
    ...mapState(useDetectionStore, ['allAutoDetectionSelected', 'isBusy']),
    frameStepLabel() {
      const t = this.$i18n?.t || ((key) => key);
      const modes = ['frameMode.1', 'frameMode.1s', 'frameMode.5s', 'frameMode.10s'];
      return t(modes[this.frameStepMode] || modes[0]);
    },
  },

  async created() {
    window.electronAPI.onMainLog((data) => console.log('main-log', data));

    this.settingsManager = createSettingsManager({
      getStores: () => ({
        file: useFileStore(),
        mode: useModeStore(),
        config: useConfigStore(),
        detection: useDetectionStore()
      }),
      getCallbacks: () => ({ drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.() })
    });

    await this.settingsManager.getExportConfig();

    // 저장된 파일 리스트 복원
    const fileStore = useFileStore();
    await fileStore.loadFileList();

    this._handleVideoContextMenu = (event) => event.preventDefault();
    document.getElementById('video').addEventListener('contextmenu', this._handleVideoContextMenu);
  },

  mounted() {
    this.$nextTick(() => {
      this.video = this.$refs.videoCanvas?.$refs.videoPlayer;
    });

    // Initialize composables with dependency injection
    const storesGetter = () => ({
      video: useVideoStore(),
      file: useFileStore(),
      detection: useDetectionStore(),
      mode: useModeStore(),
      config: useConfigStore(),
      export: useExportStore()
    });

    const getVideo = () => this.video;
    const getVideoDir = () => this.fileManager.getSelectedVideoDir();

    // Initialize keyboard manager
    this.menuHandler = createMenuHandler({
      getStores: storesGetter,
      getCallbacks: () => ({
        triggerFileInput: () => this.fileManager.triggerFileInput(),
        autoObjectDetection: () => this.detectionManager.autoObjectDetection(),
        resetSelectionDetection: () => this.detectionManager.resetSelectionDetection(),
        openMaskingAreaModal: () => { this.uiState.showMaskingAreaModal = true; },
        drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.(),
        batchProcessing: () => this.exportManager.batchProcessing()
      })
    });

    this.keyboardManager = createKeyboardManager({ menuHandler: this.menuHandler });
    this.keyboardManager.initKeyboard();

    this.maskingManager = createMaskingDataManager({
      getStores: () => ({ detection: useDetectionStore(), mode: useModeStore(), file: useFileStore(), video: useVideoStore() }),
      getVideo
    });

    this.fileManager = createFileManager({
      getStores: storesGetter,
      getVideo,
      getCallbacks: () => ({
        startNewSession: () => this.videoEditor.startNewSession(),
        loadDetectionData: () => this.detectionManager.loadDetectionData()
      }),
      getAppLocals: () => ({ currentVideoUrl: this.currentVideoUrl, isProcessing: this.uiState?.isProcessing, processingMessage: this.uiState?.processingMessage }),
      setAppLocal: (key, val) => { if (key === 'currentVideoUrl') this.currentVideoUrl = val; else if (key in this.uiState) this.uiState[key] = val; },
      getLocale: () => this.$i18n?.locale || 'ko'
    });

    this.detectionManager = createDetectionManager({
      getStores: storesGetter,
      getVideo,
      getVideoDir,
      drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.()
    });

    this.exportManager = createExportManager({
      getStores: storesGetter,
      getVideo,
      getCallbacks: () => ({
        validateCSVForExport: () => this.detectionManager.validateCSVForExport(),
        getMaskingRangeValue: () => this.settingsManager.getMaskingRangeValue(),
        loadDetectionData: () => this.detectionManager.loadDetectionData(),
        copyJsonWithExport: (name, dir) => window.electronAPI.copyJsonWithExport({ videoName: name, outputDir: dir })
      }),
      getRefs: () => ({ progressBar2: this.$refs.progressBar2, progressLabel2: this.$refs.progressLabel2 })
    });

    this.videoController = createVideoController({
      getStores: storesGetter,
      getVideo
    });

    this.objectManager = createObjectManager({
      getStores: storesGetter,
      getCallbacks: () => ({
        drawBoundingBoxes: () => this.$refs.videoCanvas?.drawBoundingBoxes?.(),
        rebuildMaskingLogsMap: () => useDetectionStore().rebuildMaskingLogsMap()
      }),
      getLocals: () => ({ currentFrame: this.currentFrame, fileInfoItems5Value: this.fileInfoItems[5]?.value }),
      setLocal: (key, val) => { this[key] = val; }
    });

    this.videoEditor = createVideoEditor({
      getStores: () => ({ video: useVideoStore(), file: useFileStore() }),
      getVideo,
      getCallbacks: () => ({
        selectFile: (idx) => this.fileManager.selectFile(idx),
        formatFileSize: (bytes) => this.fileManager.formatFileSize(bytes),
        analyzeVideoInfo: (idx, path) => this.fileManager.analyzeVideoInfo(idx, path)
      }),
      getAppLocals: () => ({ showMergeModal: this.uiState.showMergeModal, mergeSelections: this.uiState.mergeSelections, allSelected: this.uiState.allSelected, isProcessing: this.uiState.isProcessing, processingMessage: this.uiState.processingMessage }),
      setAppLocal: (key, val) => { if (key in this.uiState) this.uiState[key] = val; },
      getSliderEl: () => this.$el.querySelector('.slider-container'),
      getGenerateSprites: () => (segIds) => this.$refs.videoCanvas?.generateTimelineSprites(segIds)
    });

    const uiStateRaw = createUIState({
      getStores: storesGetter,
      getVideo
    });
    // showToast를 래핑하여 App.vue의 반응성 상태와 동기화
    const originalShowToast = uiStateRaw.showToast;
    const self = this;
    uiStateRaw.showToastMessage = (message, type = 'info') => {
      self.toastVisible = true;
      self.toastMsg = message;
      self.toastTypeClass = 'toast--' + type;
      clearTimeout(self._toastTimeout);
      self._toastTimeout = setTimeout(() => {
        self.toastVisible = false;
      }, 3000);
    };
    uiStateRaw.showToast = uiStateRaw.showToastMessage;
    this.uiState = uiStateRaw;

    // Event listeners
    window.addEventListener('mousemove', this.onMarkerMouseMove);
    window.addEventListener('mouseup', this.onMarkerMouseUp);
    window.addEventListener('mousedown', this.handleGlobalMouseDown);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('trigger-file-input', this.handleTriggerFileInput);
    window.addEventListener('show-toast', this.handleShowToast);
    window.addEventListener('show-file-noti', this.handleFileNoti);

    this.$nextTick(() => this.$refs.appContainer?.focus({ preventScroll: true }));

    this.$watch('exportAllMasking', newVal => {
      if (newVal === 'Yes') this.$refs.videoCanvas?.startMaskPreview?.();
      else this.$refs.videoCanvas?.stopMaskPreview?.();
    });

    this.uiState.setLoading(false);
  },

  beforeUnmount() {
    window.removeEventListener('mousemove', this.onMarkerMouseMove);
    window.removeEventListener('mouseup', this.onMarkerMouseUp);
    window.removeEventListener('show-file-noti', this.handleFileNoti);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('mousedown', this.handleGlobalMouseDown);
    window.removeEventListener('trigger-file-input', this.handleTriggerFileInput);
    window.removeEventListener('show-toast', this.handleShowToast);

    const videoElement = document.getElementById('video');
    if (videoElement && this._handleVideoContextMenu) {
      videoElement.removeEventListener('contextmenu', this._handleVideoContextMenu);
    }

    if (this.keyboardManager) {
      this.keyboardManager.destroyKeyboard();
    }

    this.$refs.videoCanvas?.stopMaskPreview?.();
    Object.values(this.conversionCache).forEach(url => URL.revokeObjectURL(url));
  },

  methods: {
    toggleFilePanel() {
      this.isFilePanelOpen = !this.isFilePanelOpen;
    },

    handleKeyDown(event) {
      this.videoController.handleKeyDown(event);
    },

    onMarkerMouseMove(event) {
      this.videoEditor.onMarkerMouseMove(event);
    },

    onMarkerMouseUp() {
      this.videoEditor.onMarkerMouseUp();
    },

    handleGlobalMouseDown(e) {
      const menu = document.querySelector('.context-menu');
      if (menu && !menu.contains(e.target)) {
        this.contextMenuVisible = false;
      }
      if (!this.videoController?.isInputFocused()) {
        this.$refs.appContainer?.focus({ preventScroll: true });
      }
    },
    handleTriggerFileInput() {
      this.fileManager.triggerFileInput();
    },

    handleShowToast(e) {
      const { message, type } = e.detail || {};
      if (message) this.uiState.showToast(message, type || 'info');
    },

    handleFileNoti(e) {
      const { skippedFiles } = e.detail || {};
      if (skippedFiles && skippedFiles.length > 0) {
        this.fileNoti.skippedFiles = skippedFiles;
        this.fileNoti.visible = true;
        // 8초 후 자동 닫기
        clearTimeout(this._fileNotiTimeout);
        this._fileNotiTimeout = setTimeout(() => {
          this.fileNoti.visible = false;
        }, 8000);
      }
    },

    async handleMaskingBatch(entries) {
      if (!entries.length) return;
      const videoName = this.files[this.selectedFileIndex]?.name || 'default.mp4';
      const data = JSON.parse(JSON.stringify(convertMaskingEntries(entries)));
      try {
        await window.electronAPI.updateJson({ videoName, entries: data });
      } catch (error) {
        console.error('JSON 업데이트 오류:', error);
      }
    },

    handleContextMenu(payload) {
      const { trackId, clientX, clientY } = payload;
      if (!trackId) return;
      this.contextMenuVisible = true;
      this.contextMenuPosition = { x: clientX, y: clientY };
      this.selectedShape = trackId;
    },

    handleTrackMenu(payload) {
      const { trackId, clientX, clientY } = payload;
      if (!trackId) return;
      this.trackMenuVisible = true;
      this.trackMenuPosition = { x: clientX, y: clientY };
      this.trackMenuTrackId = trackId;
    },

    handleTrackMenuAction(action) {
      const trackId = this.trackMenuTrackId;
      this.trackMenuVisible = false;
      if (!trackId) return;
      if (action === 'jump-to-start') {
        this.videoController.jumpToTrackStart(trackId);
      } else if (action === 'jump-to-end') {
        this.videoController.jumpToTrackEnd(trackId);
      }
    },

    handleVideoLoaded(videoInfo) {
      this.videoDuration = videoInfo.duration;
      this.totalTime = formatTime(videoInfo.duration);
    },

    handleVideoEnded() {
      this.videoPlaying = false;
    },

    async handleMaskingAreaSelection(selection) {
      this.maskingManager.checkBiggestTrackId();
      this.currentMode = 'mask';
      this.selectMode = true;
      this.maskMode = selection.modeLabel === 'polygon' ? 'polygon' : 'rectangle';
      if (this.video) {
        this.video.pause();
        this.videoPlaying = false;
      }
      this.uiState.showMaskingAreaModal = false;
    },
  }
};
</script>
