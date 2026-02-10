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
 import config from './resources/config.json';
 import apiPython from './apiRequest';
import { mapWritableState, mapState, mapActions } from 'pinia';
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
import { createProgressPoller, pollAsPromise, createBatchPoller } from './composables/progressPoller';
import { setupConversionProgress } from './composables/conversionHelper';
import { 
  showMessage, showSuccess, showError, MESSAGES,
  normalizeFilePath, getFileName, getFilePath,
  convertMaskingEntries, createMaskingPayload,
  validateFrameRange, handleValidation,
  formatTime, formatDuration, parseDurationToSeconds, formatFps
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
     // 경로 정규화 (file:/// → 로컬 경로, 포워드 슬래시로 통일)
     normalizeWinPath(p) {
       if (!p) return '';
       let s = String(p);
       if (s.startsWith('file:///')) s = decodeURI(s.replace(/^file:\/\//, ''));
       // 포워드 슬래시로 통일 (Electron은 양쪽 슬래시 모두 지원)
       s = s.replace(/\\/g, '/').replace(/\/+$/, '');
       return s;
     },

     /**
      * files[index] 또는 {file, url, name} 오브젝트를 받아
      * 폴더 경로를 계산 → allConfig.path.video_path에 반영(변화 있을 때만) 
      * 저장은 디바운스+락으로 1회만.
      */
     async setVideoPathFromItem(item) {
       if (!item) return;

       // 1) 전체 경로값 우선순위(file → url(file:///) → name(경로 불명시 패스))
       let full = (typeof item.file === 'string' && item.file) ||
                 (typeof item.url === 'string'  && item.url)   ||
                 '';

       if (!full && typeof item.name === 'string') return; // 이름만 있으면 폴더를 확정 못 함

       full = this.normalizeWinPath(full);

       // url이 들어왔을 수도 있으니 다시 한 번 제거
       if (!full) return;

       // 2) 디렉토리 추출 (포워드/백슬래시 모두 지원)
       const dir = full.replace(/[/\\][^/\\]+$/, '');
       if (!dir) return;

       // 3) 변화 없으면 저장 스킵(메모리/UI만 동기화)
       this.allConfig = this.allConfig || {};
       this.allConfig.path = this.allConfig.path || {};
       const current = this.normalizeWinPath(this.allConfig.path.video_path || '');
       if (current === dir) {
         this.dirConfig.videoDir = dir;
         return;
       }

       // 4) 메모리/UI 반영
       this.allConfig.path.video_path = dir;
       this.dirConfig.videoDir = dir;

       // 5) 저장은 디바운스 + 재진입 방지
       clearTimeout(this._saveTimer);
       this._saveTimer = setTimeout(async () => {
         if (this._isSavingVideoPath) return;
         this._isSavingVideoPath = true;
         try {
           await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(this.allConfig)));
           console.log('[video_path 저장]', dir);
         } catch (e) {
           console.warn('video_path 저장 실패:', e);
         } finally {
           this._isSavingVideoPath = false;
         }
       }, 150);
     },

     //영상 경로 정규화
     normalizePath(p) {
       if (!p) return '';
       return String(p)
         .replace(/^file:\/+/, '') // file:/// 제거
         .replace(/\\/g, '/')      // 백슬래시 → 슬래시
         .replace(/\/+$/, '');     // 끝 슬래시 모두 제거
     },

     //csv파일 영상 경로대로 받아오기
     getSelectedVideoDir() {
       const sel = this.files[this.selectedFileIndex];
       if (!sel) return '';

       // 파일 선택 다이얼로그로 들어온 케이스(절대경로 보유)
       if (typeof sel.file === 'string' && sel.file) {
         return this.normalizePath(sel.file.replace(/[/\\][^/\\]+$/, ''));
       }

       // file:/// URL 케이스
       if (sel.url && sel.url.startsWith('file:///')) {
         const p = normalizeFilePath(sel.url);
         return this.normalizePath(p.replace(/[/\\][^/\\]+$/, ''));
       }

       // 그래도 없으면 설정된 비디오 기본 경로 힌트
       return this.normalizePath(this.dirConfig?.videoDir || this.selectedExportDir || this.desktopDir || '');
      },

      settingNoti(){
        window.electronAPI.showMessage('객체 탐지 설정이 변경되었습니다. 재시작 시 설정이 적용됩니다.');
      },

     // 세팅값 설정 
     async saveSettings(val) {
      try {
        this.allConfig = this.allConfig || {};
        this.allConfig.detect = this.allConfig.detect || {};
        this.allConfig.export = this.allConfig.export || {};
        this.allConfig.path   = this.allConfig.path   || {};

        if (this.isWaterMarking) {
          const hasWaterText = this.allConfig.export.watertext && this.allConfig.export.watertext.trim() !== '';
          const hasWaterImage = this.allConfig.export.waterimgpath && this.allConfig.export.waterimgpath.trim() !== '';
          
          if (!hasWaterText && !hasWaterImage) {
            window.electronAPI.showMessage('워터마크를 사용하려면 텍스트나 이미지 중 하나는 필수입니다.');
            return; // 저장 중단
          }
        }

        this.allConfig.detect.detectobj = this.getDetectObjValue();
        this.allConfig.export.maskingrange = this.getMaskingRangeValue();
        this.allConfig.export.watermarking = this.isWaterMarking ? 'yes' : 'no';

        this.allConfig.export.play_count = Number(this.drmInfo.drmPlayCount) || 0;
        if (this.drmInfo.drmExportPeriod) {
          const today = new Date();
          const target = new Date(this.drmInfo.drmExportPeriod);
          const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
          this.allConfig.export.play_date = String(Math.max(0, diffDays));
        }

        // 저장 경로(내보내기) – 선택했다면 반영
        if (this.selectedExportDir) {
          this.allConfig.path.video_masking_path = this.normalizePath(this.selectedExportDir);
        }

        // 2) 설정 저장 (ipcMain.handle('save-settings') 호출)
        await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(this.allConfig)));

        // 3) 모드 상태 초기화 및 모달 닫기
        this.currentMode = '';
        this.selectMode = true;
        this.showSettingModal = false;

        // 4) 사용자 안내
        if(val !== 'watermark') window.electronAPI.showMessage('설정을 저장했습니다.');
        

      } catch (err) {
        console.error('설정 저장 실패:', err);
        window.electronAPI.showMessage('설정 저장 중 오류: ' + (err?.message || err));
      }
    },

     // 내보내기 경로 찾기 핸들러
     async onClickFindDir() {
       try {
         // 폴더 선택 다이얼로그 (Electron preload에서 openDialog 사용)
         const result = await window.electronAPI.showOpenDialog({
           title: '내보내기 폴더 선택',
           properties: ['openDirectory', 'createDirectory'],
           defaultPath: this.desktopDir, 
         });
         if (result.canceled || !result.filePaths?.length) return;

         const dir = result.filePaths[0];
         this.selectedExportDir = this.normalizePath(dir);

         // settings에도 반영(즉시 저장)
         this.allConfig.path = this.allConfig.path || {};
         this.allConfig.path.video_masking_path = this.selectedExportDir;
         await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(this.allConfig)));
       } catch (e) {
         console.error('내보내기 폴더 선택 실패:', e);
         window.electronAPI.showMessage('폴더 선택 중 오류가 발생했습니다: ' + e.message);
       }
     },
     
     // 원본 파일이 경로 문자열로 들어온 경우 작동 시킴
     async convertAndPlayFromPath(file, cacheKey) {
       const conv = setupConversionProgress(this.conversion, file.name);
       try {
         const originalPath = getFilePath(file) || file.name;
         // 경로 구분자 정규화
         const normalizedPath = originalPath.replace(/\\/g, '/');
         const lastSlashIndex = normalizedPath.lastIndexOf('/');
         const dirPath = normalizedPath.substring(0, lastSlashIndex);
         const fileName = normalizedPath.substring(lastSlashIndex + 1);
         const baseName = fileName.replace(/\.[^.]+$/, '');
         
         // 같은 폴더 내에 '_converted'가 붙은 파일명 생성
         // 예: C:/Videos/test.mp4 -> C:/Videos/test_converted.mp4
         const outputFileName = `${baseName}_converted.mp4`;
         const outputPath = `${dirPath}/${outputFileName}`;
         
         // 윈도우 경로 형식으로 변환 (Electron IPC 전송용)
         const nativeOutputPath = outputPath.replace(/\//g, '\\');

         // 변환 옵션
         const seconds = this.parseDurationToSeconds(file.duration);
         const options = {
           videoCodec: 'libx264',
           crf: 23,
           duration: isNaN(seconds) ? undefined : seconds
         };

         // ★ 원본 “경로”를 그대로 입력으로 사용
         await window.electronAPI.convertVideo(originalPath, nativeOutputPath, options);

         // 진행률 이벤트 리스너 제거
         window.electronAPI.removeConversionProgressListener(progressHandler);

        const cleanPath = nativeOutputPath.replace(/\\/g, '/');
        const convertedUrl = `local-video://stream/${cleanPath}`;

        // [수정] 변환된 파일로 파일 목록(this.files) 업데이트
        let targetFile = file; // 기본값은 기존 파일 객체
        const fileIndex = this.files.indexOf(file);

        if (fileIndex !== -1) {
          try {
            // 변환된 파일의 정보를 새로 가져옴 (크기, 지속시간 등)
            const newStat = await window.electronAPI.getFileStat(nativeOutputPath);
            const newInfo = await window.electronAPI.getVideoInfo(nativeOutputPath);

            const newFileItem = {
              ...file, // 기존 선택 상태 등 유지
              name: outputFileName,
              file: nativeOutputPath, // 경로 업데이트
              url: convertedUrl,      // URL 업데이트
              size: newStat ? this.formatFileSize(newStat.size) : 'Unknown',
              duration: this.formatDuration(newInfo.duration),
              resolution: newInfo.resolution,
              frameRate: newInfo.frameRate ? `${newInfo.frameRate.toFixed(2)} fps` : 'Unknown',
              totalFrames: newInfo.totalFrames,
              codec: (newInfo.codec || '').toLowerCase(),
            };

            // 리스트에서 기존 파일을 새 파일로 교체 (화면 갱신 트리거)
            this.files.splice(fileIndex, 1, newFileItem);
            targetFile = newFileItem;

          } catch (updateErr) {
            console.error('파일 목록 업데이트 중 오류:', updateErr);
            // 정보 조회 실패 시 최소한 경로와 이름이라도 업데이트
            const newFileItem = {
              ...file,
              name: outputFileName,
              file: nativeOutputPath,
              url: convertedUrl
            };
            this.files.splice(fileIndex, 1, newFileItem);
            targetFile = newFileItem;
          }
        }

         // 캐시 & 재생
         this.conversionCache[cacheKey] = convertedUrl;
         this.currentVideoUrl = convertedUrl;
         this.updateVideoInfoFromElectron(file);
         this.video.play(); 
         this.videoPlaying = true;

         conv.cleanup();
         
         try {
           // 원본 파일 삭제 (기존 deleteTempFile API 활용)
           await window.electronAPI.deleteTempFile(originalPath);
           console.log('원본 파일 삭제 완료:', originalPath);
         } catch (deleteErr) {
           console.error('원본 파일 삭제 실패:', deleteErr);
           // 원본 삭제 실패는 사용자에게 알리거나 조용히 넘어감 (선택 사항)
         }
       } catch (err) {
         conv.fail();
         console.error('경로 변환 중 오류:', err);
         window.electronAPI.showMessage('파일 변환 중 오류가 발생했습니다: ' + err.message);
       }
     },

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
     // 선택 객체 탐지 (VideoCanvas에서 emit)
     async handleObjectDetect(payload) {
       const { x, y, frame, videoName } = payload;
       
       // 이미 선택 객체 탐지를 실행했는지 확인
       if (this.hasSelectedDetection) {
         window.electronAPI.showMessage('이미 선택 객체 탐지를 실행했습니다.');
         return;
       }
       
       // 비디오 일시정지
       this.video.pause();
       this.videoPlaying = false;
       this.hasSelectedDetection = true;
       
       // API 호출 및 폴링
       try {
         const postRes = await apiPython.post(`${config.autodetect}`, {
           Event: "2",
           VideoPath: this.files[this.selectedFileIndex].name,
           FrameNo: String(frame),
           Coordinate: `${x},${y}`
         });
         
         const jobId = postRes.data.job_id;
         
         // 선택 탐지 폴리 (재귀 setTimeout 모드)
         this._selectDetectionPoller = createProgressPoller({
           onComplete: async () => {
             this.isDetecting = false;
             await this.loadDetectionData();
             this.$refs.videoCanvas?.drawBoundingBoxes?.();
             window.electronAPI.showMessage('선택 객체 탐지가 완료되었습니다.');
             this._selectDetectionPoller = null;
           },
           onError: (error) => {
             this.isDetecting = false;
             window.electronAPI.showMessage('선택 객체 탐지 실패: ' + error.message);
             this._selectDetectionPoller = null;
           }
         }, { useInterval: false });
         
         this.isDetecting = true;
         this._selectDetectionPoller.start(jobId);
       } catch (err) {
         console.error('선택객체탐지 API 에러:', err);
         window.electronAPI.showMessage('선택 객체 탐지 실패: ' + err.message);
       }
     },

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
       this.totalTime = this.formatTime(videoInfo.duration);
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
     
     /* =======CSV 관련 메소드=========== */
     validateCSVForExport() {
      const selected = this.files[this.selectedFileIndex];
      if (!selected || !selected.name) {
        return { valid: false, message: "선택된 영상이 없습니다." };
      }

      const baseName = selected.name.replace(/\.[^/.]+$/, "");
      
      // 이미 로드된 maskingLogs 배열만 체크
      if (!this.maskingLogs || this.maskingLogs.length === 0) {
        return { 
          valid: false, 
          message: `원본 영상은 내보내기를 진행할 수 없습니다.\n먼저 반출(탐지) 작업을 완료한 뒤, 내보내기를 진행해주세요.` 
        };
      }
      
      return { 
        valid: true, 
        message: `검증 완료: ${this.maskingLogs.length}개의 탐지 데이터가 있습니다.` 
      };
    },
     // 탐지 데이터 입출력
     async loadDetectionData() {
       try {
         const selected = this.files[this.selectedFileIndex];
         if (!selected || !selected.name) {
           window.electronAPI.showMessage("먼저 영상을 선택해주세요.");
           return;
         }

         const videoName = selected.name;

         // file:// → 로컬 경로
         const fileUrlToPath = (u) => (u ? u.replace(/^file:\/\//, '') : '');

         // 실제 경로 우선순위: selected.file(절대경로) → url 변환 → 파일명
         const videoPath =
           (typeof selected.file === 'string' && selected.file) ||
           fileUrlToPath(selected.url) ||
           videoName;

         // JSON 우선 탐색 (CSV 폴백)
         const result = await window.electronAPI.loadJson({
           VideoName: videoName,
           VideoPath: videoPath,
           VideoDir:  this.getSelectedVideoDir(),
         });

         if (!result) {
           // 데이터 파일이 없으면 조용히 패스 (박스 비표시)
           this.maskingLogs = [];
           this.maskingLogsMap = {};
           this.dataLoaded = false;
           return;
         }

         this.maskingLogs = [];
         this.maskingLogsMap = {};

         if (result.format === 'json') {
           // JSON 형식: 프레임 딕셔너리에서 직접 구성
           const frames = result.data.frames || {};
           for (const [frameKey, entries] of Object.entries(frames)) {
             const frameNum = Number(frameKey);
             this.maskingLogsMap[frameNum] = [];
             for (const entry of entries) {
               const logEntry = {
                 frame: frameNum,
                 track_id: entry.track_id,
                 bbox: entry.bbox,
                 bbox_type: entry.bbox_type || 'rect',
                 score: entry.score,
                 class_id: entry.class_id,
                 type: entry.type,
                 object: entry.object,
               };
               this.maskingLogs.push(logEntry);
               this.maskingLogsMap[frameNum].push(logEntry);
             }
           }
         } else {
           // CSV 폴백: 간단한 문자열 파싱
           this.parseCSVLegacy(result.data);
         }

         console.log('maskingLogs:', this.maskingLogs.length, 'entries');
         this.dataLoaded = true;
       } catch (error) {
         console.log('탐지 데이터 로드 실패:', error.message);
       }
     },
     parseCSVLegacy(csvText) {
       const lines = csvText.split('\n').filter(l => l.trim());
       for (let i = 1; i < lines.length; i++) {
         const match = lines[i].match(/^(\d+),([^,]*),("?\[.*?\]"?),([^,]*),([^,]*),([^,]*),(.*)$/);
         if (match) {
           const frameNum = Number(match[1]);
           const entry = {
             frame: frameNum,
             track_id: match[2],
             bbox: match[3].replace(/^"|"$/g, ''),
             score: match[4] || null,
             class_id: match[5] || null,
             type: match[6] ? Number(match[6]) : null,
             object: match[7] ? Number(match[7]) : 1,
           };
           this.maskingLogs.push(entry);
           if (!this.maskingLogsMap[frameNum]) this.maskingLogsMap[frameNum] = [];
           this.maskingLogsMap[frameNum].push(entry);
         }
       }
     },

     async exportDetectionData() {
      if (this.dataLoaded) {
        console.log('데이터가 이미 로드된 상태이므로 저장을 생략합니다.');
        return;
      }
      const selectedFile = this.files[this.selectedFileIndex];
      const videoName = selectedFile?.name || 'default.mp4';

      const maskingData = this.maskingLogs.map(log => ({
        frame: log.frame ?? 0,
        track_id: log.track_id ?? "",
        bbox: typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox,
        bbox_type: log.bbox_type || (Array.isArray(log.bbox) && Array.isArray(log.bbox[0]) ? 'polygon' : 'rect'),
        score: log.score ?? null,
        class_id: log.class_id ?? null,
        type: log.type ?? 4,
        object: log.object ?? 1
      }));

       try {
          const result = await window.electronAPI.updateFilteredJson({
            videoName: videoName,
            data: maskingData
          });

          console.log('JSON 저장 성공:', result);
        } catch (error) {
          console.error("JSON 저장 오류:", error.message);
          window.electronAPI.showMessage('저장 중 오류가 발생했습니다: ' + error.message);
        }
      },
 
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
     saveMaskingEntry(frame, bbox) {
         const bboxType = Array.isArray(bbox) && Array.isArray(bbox[0]) ? 'polygon' : 'rect';
         const newEntry = { frame, track_id: this.maskBiggestTrackId, bbox, bbox_type: bboxType, type: 4, object: 1 };
       const exists = this.maskingLogs.some(
         log => log.frame === newEntry.frame &&
               log.track_id === newEntry.track_id &&
               JSON.stringify(log.bbox) === JSON.stringify(newEntry.bbox) &&
               log.object === newEntry.object
       );

       if (!exists) {
         this.maskingLogs.push(newEntry);
         this.addToMaskingLogsMap(newEntry);
         this.newMaskings.push(newEntry);
       }
     },
     saveManualMaskingEntry(frame, bbox) {
       const videoName = this.files[this.selectedFileIndex]?.name || "unknown.mp4";

         const trackId = this.manualBiggestTrackId;
         const newEntry = { frame, track_id: trackId, bbox, bbox_type: 'rect', type: 3, object: 1 };

       const index = this.maskingLogs.findIndex(
         log => log.frame === newEntry.frame && log.track_id === newEntry.track_id
       );

       if (index !== -1) {
         if (JSON.stringify(this.maskingLogs[index].bbox) !== JSON.stringify(newEntry.bbox)) {
           this.maskingLogs[index] = newEntry;
           this.rebuildMaskingLogsMap();
           const indexNew = this.newMaskings.findIndex(
             log => log.frame === newEntry.frame && log.track_id === newEntry.track_id
           );
           if (indexNew !== -1) {
             this.newMaskings[indexNew] = { ...newEntry, videoName };
           } else {
             this.newMaskings.push({ ...newEntry, videoName });
           }
         }
       } else {
         this.maskingLogs.push(newEntry);
         this.addToMaskingLogsMap(newEntry);
         this.newMaskings.push({ ...newEntry, videoName });
       }

       if (this.maskingLogs.length > 0) {
          this.dataLoaded = true;
        }
     },
     async sendBatchMaskingsToBackend() {
       if (!this.newMaskings.length) return;

       const selectedFile = this.files[this.selectedFileIndex];
       const videoName = selectedFile?.name || "default.mp4";

       const entries = convertMaskingEntries(this.newMaskings);

       try {
         const response = await window.electronAPI.updateJson({ videoName, entries });
         this.newMaskings = [];
       } catch (error) {
         console.error('JSON 업데이트 오류:', error);
       }
     },
     // maskingLogsMap 헬퍼 메서드
     rebuildMaskingLogsMap() {
       this.maskingLogsMap = {};
       for (const log of this.maskingLogs) {
         const f = Number(log.frame);
         if (!this.maskingLogsMap[f]) this.maskingLogsMap[f] = [];
         this.maskingLogsMap[f].push(log);
       }
     },
     addToMaskingLogsMap(entry) {
       const f = Number(entry.frame);
       if (!this.maskingLogsMap[f]) this.maskingLogsMap[f] = [];
       this.maskingLogsMap[f].push(entry);
     },
     /* =======탐지 데이터 관련 메소드 끝=========== */
 
     /* =======객체 탐지 관련 메소드=========== */
     // 자동 객체 탐지
     async autoObjectDetection() {
       try {
         if (this.selectedFileIndex < 0) {
           window.electronAPI.showMessage("영상을 선택하세요"); 
           return;
         }
 
 
         // 영상 멈춤
         this.video.pause();
         this.videoPlaying = false;
 
         const selectedFile = this.files[this.selectedFileIndex];
 
         const requestData = {
           VideoPath: selectedFile.name,
           Event: '1'
         };
 
         const response = await apiPython.post(`${config.autodetect}`, {
           VideoPath: selectedFile.name,
           Event: '1'
         });
 
         if (!response) {
           throw new Error(`자동 객체 탐지 실패`);
         }
 
         const jobId = response.data.job_id;
         if (!jobId) throw new Error('job_id 누락됨');
 
         this.progress = 0;
         this.isDetecting = true;
 
         // progressPoller 사용한 폴리
         this._detectionPoller = createProgressPoller({
           onProgress: (data) => {
             this.progress = Math.floor(data.progress);
             if (this.$refs.progressBar) {
               this.$refs.progressBar.style.width = this.progress + '%';
             }
             if (this.$refs.progressLabel) {
               this.$refs.progressLabel.textContent = this.progress + '%';
             }
           },
           onComplete: (data) => {
             this.isDetecting = false;
             if (data.error) {
               console.error('서버에서 에러 응답:', data.error);
               window.electronAPI.showMessage('객체 탐지 중 오류 발생: ' + data.error);
               return;
             }
             this.currentMode = '';
             this.selectMode = true;
             this.loadDetectionData();
           },
           onError: (err) => {
             console.error('진행 상황 조회 오류:', err);
             this.isDetecting = false;
             window.electronAPI.showMessage('객체 탐지 중 오류 발생: ' + err.message);
           }
         });
         this._detectionPoller.start(jobId);
 
       } catch (error) {
         console.error('자동 객체 탐지 실패:', error);
         window.electronAPI.showMessage('자동 객체 탐지 실패: ' + error.message);
       }
     },
     async executeMultiAutoDetection() {
        this.video.pause();
        this.videoPlaying = false;
        this.fileProgressMap = {};
        
        const selectedFiles = this.files.filter((_, index) => this.autoDetectionSelections[index]);
        
        // 동시에 처리할 최대 파일 수
        const CONCURRENCY_LIMIT = Number(this.allConfig.detect.concurrency_limit) ?? 3;
        
        // 동시성 제한 함수
        const processWithLimit = async (files, limit) => {
            const results = [];
            const executing = new Set();
            
            for (const file of files) {
                const promise = this.performAutoDetectionForFile(file, true)
                    .catch(err => console.error(`파일 처리 실패: ${file.name}`, err));
                
                executing.add(promise);
                results.push(promise);
                
                // promise가 완료되면 Set에서 제거
                promise.finally(() => executing.delete(promise));
                
                // 동시 실행 수가 제한에 도달하면 하나가 완료될 때까지 대기
                if (executing.size >= limit) {
                    await Promise.race(executing);
                }
            }
            
            return Promise.allSettled(results);
        };
        
        await processWithLimit(selectedFiles, CONCURRENCY_LIMIT);
        
        setTimeout(() => {
            this.currentMode = '';
            this.showMultiAutoDetectionModal = false;
            this.loadDetectionData();
        }, 1000);
    },
     async performAutoDetectionForFile(file, isMulti = false) {
       try {
           // 1. 진행률 초기화
           this.fileProgressMap[file.name] = 0;
           
           // 2. API 요청
         const requestData = {
             VideoPath: file.name,
           Event: '1'
         };
           
         const response = await apiPython.post(`${config.autodetect}`, {
           VideoPath: isMulti ? file.file : file.name,
           Event: '1'
         });
   
         if (!response) {
             throw new Error(`자동 객체 탐지 실패`);
         }
   
           const jobId = response.data.job_id;
           
           // 3. 폴리 (pollAsPromise 사용)
           return pollAsPromise(jobId, {
             onProgress: (data) => {
               this.fileProgressMap[file.name] = Math.floor(data.progress);
             },
             onError: () => {
               this.fileProgressMap[file.name] = -1; // 에러 상태 표시
             }
           });
       } catch (error) {
         console.error(`자동 객체 탐지 오류 (${file.name}):`, error);
           this.fileProgressMap[file.name] = -1; // 에러 상태 표시
           throw error;
       }
     },
     toggleAllAutoDetectionSelection() {
         const newValue = !this.allAutoDetectionSelected;
         this.autoDetectionSelections = this.files.map(() => newValue);
     },
 
     // 선택 객체 탐지
     resetSelectionDetection() {
       // 비디오가 바뀔 때마다 플래그 리셋
       this.hasSelectedDetection = false;
     },
 
     // 가장 큰 track_id 추적
     // checkBiggestTrackId 메서드는 VideoCanvas 컴포넌트로 이동
     /* =======객체 탐지 관련 메소드 끝=========== */
 
     /* =======파일 관리 관련 메소드=========== */
     // 파일 선택/삭제
     async selectFile(index) {
      this.startNewSession();
      this.selectedFileIndex = index;

      await this.setVideoPathFromItem(this.files[index]);

      const file = this.files[index];

      if (this.video && file) {
        this.maskingLogs = [];
        this.maskingLogsMap = {};
        this.dataLoaded = false;

        // ? 파일 확장자 확인 및 변환 처리
        const fileExtension = (file.name.split('.').pop() || '').toLowerCase();
        const isHEVC = /^(hevc|h265)$/.test((file.codec || '').toLowerCase()); 

        if (fileExtension === 'mp4' && !isHEVC) {
          // MP4 파일은 바로 재생
          this.currentVideoUrl = file.url;
          
          this.updateVideoInfoFromElectron(file);
          
          this.video.play();
          this.videoPlaying = true;
        } else { //  비MP4 또는 HEVC → 변환 후 재생
          // 다른 형식은 변환 후 재생
          const cacheKey = `${file.name}_${file.size}`;
          
          if (this.conversionCache[cacheKey]) {
            // 이미 변환된 파일이 캐시에 있으면 바로 재생
            this.currentVideoUrl = this.conversionCache[cacheKey];
            
            this.updateVideoInfoFromElectron(file);
            
            this.video.play();
            this.videoPlaying = true;
          } else {
            // 파일이 File 객체(브라우저 input)로 들어온 경우와, 경로 문자열(파일 다이얼로그)로 들어온 경우를 구분
            if (file.file instanceof File) {
              await this.convertAndPlay(file, cacheKey); // 브라우저 <input>에서 온 File
            } else {
              await this.convertAndPlayFromPath(file, cacheKey); // Electron 다이얼로그(경로/URL/이름) 
            }
          }
        }

        this.loadDetectionData();
        this.selectMode = true;
      }
    },
    deleteFile() {
      if (this.selectedFileIndex >= 0 && this.selectedFileIndex < this.files.length) {
        const fileToDelete = this.files[this.selectedFileIndex];
        
        // ? 변환 캐시 정리
        if (fileToDelete) {
          const cacheKey = `${fileToDelete.name}_${fileToDelete.size}`;
          if (this.conversionCache[cacheKey]) {
            URL.revokeObjectURL(this.conversionCache[cacheKey]);
            delete this.conversionCache[cacheKey];
          }
        }
        
        URL.revokeObjectURL(this.files[this.selectedFileIndex].url);
        this.files.splice(this.selectedFileIndex, 1);
        
        if (this.files.length > 0) {
          this.selectFile(Math.min(this.selectedFileIndex, this.files.length - 1));
        } else {
          this.selectedFileIndex = -1;
          this.resetVideoInfo();
        }
      }
    },

     async triggerFileInput() {
      const selectionMode = await window.electronAPI.showSelectionModeDialog();
      if (selectionMode === 2) return; // 취소

      const defaultPath = (this.dirConfig.videoDir || '').trim();
      const isFolderMode = (selectionMode === 1);

      const dialogOptions = {
        title: isFolderMode ? '영상 폴더 선택' : '영상 파일 선택',
        defaultPath: defaultPath || undefined,
        properties: isFolderMode 
          ? ['openDirectory']                // 폴더 선택 모드
          : ['openFile', 'multiSelections'], // 파일 선택 모드
      };

      if (!isFolderMode) {
        dialogOptions.filters = [
          { name: 'Videos', extensions: ['mp4','avi','mkv','mov','wmv','flv','webm'] }
        ];
      }

      const { canceled, filePaths : selectedPaths } = await window.electronAPI.showVideoDialog(dialogOptions);
      if (canceled || !selectedPaths?.length) return;

      let filesToProcess = [];

      if (isFolderMode) {
        this.isProcessing = true; 
        this.processingMessage = "폴더 내 영상 검색 중...";

        // 폴더 선택 시: 선택된 폴더(들) 내부 영상 파일 스캔
        try {
          for (const folderPath of selectedPaths) {
            const videoFiles = await window.electronAPI.scanDirectory(folderPath);
            filesToProcess.push(...videoFiles);
          }
        } catch (err) {
          console.error(err);
        } finally {
          this.isProcessing = false;
        }

        if (filesToProcess.length === 0) {
          window.electronAPI.showMessage('선택한 폴더에 영상 파일이 없습니다.');
          return;
        }
      } else {
        // 파일 선택 시: 선택된 파일 그대로 사용
        filesToProcess = selectedPaths;
      }

      if (filesToProcess.length > 0) {
        await this.setVideoPathFromItem({ file: filesToProcess[0] });
      }

      if (isFolderMode || filesToProcess.length > 1) {
        this.isFolderLoading = true;
        this.folderLoadTotal = filesToProcess.length;
        this.folderLoadCurrent = 0;
        this.folderLoadProgress = 0;
      }

      for (const p of filesToProcess) {
        let name = p.split(/[/\\]/).pop();
        let targetPath = p;
        let sizeText = '';

        // 파일을 videoDir로 복사 (원본이 videoDir에 없는 경우)
        try {
          const copyResult = await window.electronAPI.copyVideoToDir(p);
          if (copyResult && copyResult.success) {
            targetPath = copyResult.filePath;
            name = copyResult.fileName;
            console.log('[파일 추가] 복사 완료:', copyResult.message);
          }
        } catch (copyError) {
          console.error('[파일 추가] 복사 실패:', copyError);
          window.electronAPI.showMessage('파일 복사 중 오류가 발생했습니다: ' + copyError.message);
          continue; // 복사 실패 시 다음 파일로
        }

        // macOS/Windows 모두 local-video:// 프로토콜 사용
        const cleanPath = targetPath.replace(/\\/g, '/');
        const url = `local-video://stream/${cleanPath}`;

        try {
          const stat = await window.electronAPI.getFileStat(targetPath);
          if (stat && typeof stat.size === 'number') {
            sizeText = this.formatFileSize(stat.size);
          }
        } catch (e) {
          console.warn('파일 크기 조회 실패:', targetPath, e);
        }

        const fileItem = {
          name,
          size: sizeText,
          url,
          duration: '분석 중...',
          resolution: '분석 중...',
          frameRate: '분석 중...',
          totalFrames: '분석 중...',
          selected: false,
          file : targetPath
        };
        this.files.push(fileItem);
        const fileIndex = this.files.length - 1;

        if (this.selectedFileIndex === -1) {
          this.selectedFileIndex = fileIndex;
          this.updateFileInfoDisplay(fileItem);
        }

        // [추가] 복구 작업 진행률 표시를 위한 핸들러 등록
        const progressHandler = (event, data) => {
            this.conversion.inProgress = true;
            this.conversion.progress = data.progress;
            // 현재 파일 이름을 표시하며 복구 중임을 알림
            this.conversion.currentFile = `[복구 중] ${name}`;
        };
        window.electronAPI.onConversionProgress(progressHandler);

        try {
          const info = await window.electronAPI.getVideoInfo(targetPath);
          
          this.files[fileIndex].duration    = this.formatDuration(info.duration);
          this.files[fileIndex].resolution  = info.resolution;
          this.files[fileIndex].frameRate   = info.frameRate ? `${info.frameRate.toFixed(2)} fps` : '알 수 없음';
          this.files[fileIndex].totalFrames = info.totalFrames;
          this.files[fileIndex].codec       = (info.codec || '').toLowerCase();

          if (this.selectedFileIndex === fileIndex) {
              this.updateFileInfoDisplay(this.files[fileIndex]);
          }
        } catch (e) {
          console.error('비디오 정보 조회 실패:', e);

          this.files[fileIndex].duration = '알 수 없음';
          // ... existing code ...
          if (this.selectedFileIndex === fileIndex) {
            this.updateFileInfoDisplay(this.files[fileIndex]);
          }
        } finally {
          // [추가] 작업 완료 후 핸들러 제거 및 진행률 UI 초기화
          window.electronAPI.removeConversionProgressListener(progressHandler);
          this.conversion.inProgress = false;
          this.conversion.progress = 0;
        }

        if (this.isFolderLoading) {
          this.folderLoadCurrent++;
          this.folderLoadProgress = Math.floor((this.folderLoadCurrent / this.folderLoadTotal) * 100);
          
          // UI 렌더링을 위해 약간의 지연을 줄 수도 있음 (선택사항)
          // await new Promise(r => requestAnimationFrame(r));
        }
      }

      this.isFolderLoading = false;
      this.folderLoadCurrent = 0;
      this.folderLoadTotal = 0;
      this.folderLoadProgress = 0;

      if (this.files.length > 0) {
        const lastIndex = this.files.length - 1;
        this.selectFile(lastIndex);
      }
    },
     async onFileSelected(event) {
      const selectedFiles = Array.from(event.target.files);
      
      if (selectedFiles.length === 0) return;
      
      // 선택된 파일들을 files 배열에 추가
      for (const file of selectedFiles) {
        try {
          // 파일을 videoDir로 복사하기 위해 임시 저장
          const arrayBuffer = await file.arrayBuffer();
          const tempFilePath = await window.electronAPI.saveTempFile(arrayBuffer, file.name);
          
          // 파일을 videoDir로 복사
          let targetPath = tempFilePath;
          let displayName = file.name;
          try {
            const copyResult = await window.electronAPI.copyVideoToDir(tempFilePath);
            if (copyResult && copyResult.success) {
              targetPath = copyResult.filePath;
              displayName = copyResult.fileName;
              console.log('[파일 추가] 복사 완료:', copyResult.message);
            }
          } catch (copyError) {
            console.error('[파일 추가] 복사 실패:', copyError);
          } finally {
            // 임시 파일 삭제
            await window.electronAPI.deleteTempFile(tempFilePath);
          }
          
          // 파일 URL 생성 (복사된 경로 사용)
          const cleanPath = targetPath.replace(/\\/g, '/');
          const fileUrl = `local-video://stream/${cleanPath}`;
          
          // 파일 정보 객체 생성 (초기값)
          const fileInfo = {
            name: displayName,
            size: this.formatFileSize(file.size),
            url: fileUrl,
            duration: '분석 중...',
            resolution: '분석 중...',
            frameRate: '분석 중...',
            totalFrames: '분석 중...',
            file: targetPath // 복사된 경로 저장
          };
          
          // files 배열에 추가
          this.files.push(fileInfo);
          const fileIndex = this.files.length - 1;
          
          // 첫 번째 파일이거나 현재 선택된 파일이 없으면 자동 선택
          if (this.selectedFileIndex === -1 || this.files.length === 1) {
            this.selectedFileIndex = fileIndex;
            // 초기 파일 정보 설정 (분석 중 상태)
            this.updateFileInfoDisplay(fileInfo);
          }
          
          try {
            const videoInfo = await window.electronAPI.getVideoInfo(targetPath);
            
            // 파일 정보 업데이트
            this.files[fileIndex].duration    = this.formatDuration(videoInfo.duration);
            this.files[fileIndex].resolution  = videoInfo.resolution || '알 수 없음';
            this.files[fileIndex].frameRate   = videoInfo.frameRate ? `${videoInfo.frameRate.toFixed(2)} fps` : '알 수 없음';
            this.files[fileIndex].totalFrames = videoInfo.totalFrames || '알 수 없음';
            this.files[fileIndex].codec       = (videoInfo.codec || '').toLowerCase();
            
            // 현재 선택된 파일의 정보가 업데이트되면 화면에 반영
            if (this.selectedFileIndex === fileIndex) {
              this.updateFileInfoDisplay(this.files[fileIndex]);
              
              // 프레임 레이트 설정
              if (videoInfo.frameRate) {
                this.frameRate = videoInfo.frameRate;
              }
              
              // 재생 시간 설정
              const durationSeconds = this.parseDurationToSeconds(this.files[fileIndex].duration);
              if (durationSeconds > 0) {
                this.videoDuration = durationSeconds;
                this.trimStartTime = 0;
                this.trimEndTime = durationSeconds;
                this.totalTime = this.files[fileIndex].duration;
              }
            }
            
          } catch (infoError) {
            console.error('비디오 정보 추출 실패:', infoError);
            
            // 실패 시 알 수 없음으로 설정
            this.files[fileIndex].duration = '알 수 없음';
            this.files[fileIndex].resolution = '알 수 없음';
            this.files[fileIndex].frameRate = '알 수 없음';
            this.files[fileIndex].totalFrames = '알 수 없음';
            
            // 현재 선택된 파일이면 화면에 반영
            if (this.selectedFileIndex === fileIndex) {
              this.updateFileInfoDisplay(this.files[fileIndex]);
            }
          }
          
        } catch (error) {
          console.error('파일 처리 중 오류:', error);
        }
      }
      
      // 마지막으로 추가된 파일 자동 선택 및 비디오 로드
      if (this.files.length > 0) {
        const lastIndex = this.files.length - 1;
        this.selectFile(lastIndex);
      }
      
      // 파일 input 초기화
      event.target.value = '';
    },


     // 파일 정보 관리
     formatFileSize(bytes) {
       if (bytes === 0) return '0MB';
       const sizes = ['B', 'KB', 'MB', 'GB'];
       const i = Math.floor(Math.log(bytes) / Math.log(1024));
       return `${(bytes / Math.pow(1024, i)).toFixed(1)}${sizes[i]}`;
     },
     formatTime(seconds) {
       if (!seconds || isNaN(seconds)) return '00:00';
       const minutes = Math.floor(seconds / 60);
       const secs = Math.floor(seconds % 60);
       return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
     },
     updateFileInfoDisplay(fileInfo) {
      this.fileInfoItems[0].value = fileInfo.name;
      this.fileInfoItems[1].value = fileInfo.size;
      this.fileInfoItems[2].value = fileInfo.duration;
      this.fileInfoItems[3].value = fileInfo.resolution;
      this.fileInfoItems[4].value = fileInfo.frameRate;
      this.fileInfoItems[5].value = fileInfo.totalFrames;
    },
     resetVideoInfo() {
       this.fileInfoItems[0].value = 'Name';
       this.fileInfoItems[1].value = '0MB';
       this.fileInfoItems[2].value = '00:00';
       this.fileInfoItems[3].value = '1080p';
       this.fileInfoItems[4].value = '30fps';
       this.fileInfoItems[5].value = '300';
       this.currentTime = '00:00';
       this.totalTime = '00:00';
       this.progress = 0;
       this.currentVideoUrl = '';
     },

     updateVideoInfoFromElectron(file) {
      // 이미 Electron API로 추출된 정보가 있는 경우 사용
      if (file.duration !== '분석 중...' && file.duration !== '알 수 없음') {
        this.fileInfoItems[0].value = file.name;
        this.fileInfoItems[1].value = file.size;
        this.fileInfoItems[2].value = file.duration;
        this.fileInfoItems[3].value = file.resolution;
        this.fileInfoItems[4].value = file.frameRate;
        this.fileInfoItems[5].value = file.totalFrames;
        
        // 프레임 레이트 파싱
        const frameRateMatch = file.frameRate.match(/(\d+\.?\d*)/);
        if (frameRateMatch) {
          this.frameRate = parseFloat(frameRateMatch[1]);
        }
        
        // 재생 시간 파싱
        const durationSeconds = this.parseDurationToSeconds(file.duration);
        if (durationSeconds > 0) {
          this.videoDuration = durationSeconds;
          this.trimStartTime = 0;
          this.trimEndTime = durationSeconds;
          this.totalTime = file.duration;
        }
      }
    },

    // 지속시간 문자열을 초로 변환
    parseDurationToSeconds(durationStr) {
      if (!durationStr || durationStr === '알 수 없음' || durationStr === '분석 중...') return 0;
      
      const parts = durationStr.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
      }
      
      return 0;
    },

    // 초를 지속시간 문자열로 변환
    formatDuration(seconds) {
      if (isNaN(seconds) || seconds === 0) return '00:00:00';
      
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    },
    async convertAndPlay(file, cacheKey) {
      const conv = setupConversionProgress(this.conversion, file.name);
      try {
        // 파일을 임시 경로에 저장
        const arrayBuffer = await file.file.arrayBuffer();
        const tempInputPath = await window.electronAPI.saveTempFile(arrayBuffer, file.name);
        
        // 출력 파일 경로 생성
        const fileName = file.name.split('.')[0];
        const tempOutputPath = await window.electronAPI.getTempPath(`${fileName}_converted.mp4`);
        
        // 변환 옵션 설정
        const options = {
          videoCodec: 'libx264',
          crf: 28,
          duration: this.parseDurationToSeconds(file.duration)
        };
        
        // FFmpeg로 변환 실행
        await window.electronAPI.convertVideo(tempInputPath, tempOutputPath, options);
        await window.electronAPI.deleteTempFile(tempInputPath);
        
        // 변환된 파일을 Blob으로 읽어오기
        const convertedBuffer = await window.electronAPI.getTempFileAsBlob(tempOutputPath);
        const convertedBlob = new Blob([convertedBuffer], { type: 'video/mp4' });
        const convertedUrl = URL.createObjectURL(convertedBlob);
        
        // 캐시에 저장
        this.conversionCache[cacheKey] = convertedUrl;
        
        // 변환된 비디오 재생
        this.currentVideoUrl = convertedUrl;
        
        this.updateVideoInfoFromElectron(file);
        
        this.video.play();
        this.videoPlaying = true;
        
        conv.cleanup();
        
        // 임시 파일 정리
        await window.electronAPI.deleteTempFile(tempOutputPath);
        
      } catch (error) {
        conv.fail();
        console.error('변환 중 오류 발생:', error);
        window.electronAPI.showMessage('파일 변환 중 오류가 발생했습니다: ' + error.message); 
      }
    },
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
         window.electronAPI.showMessage("선택된 파일이 없습니다."); 
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
           window.electronAPI.showMessage("자르기 오류: " + error.message); 
         } finally {
           this.isProcessing = false;
         }
       }
     },
 
     // 합치기
     mergeVideo() {
       if (this.sessionCroppedFiles.length === 0) {
         window.electronAPI.showMessage("구간 편집 할 자른 파일이 없습니다. 먼저 자르기 작업을 진행해주세요."); 
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
         
          const baseDirWin = this.normalizeWinPath(this.dirConfig.videoDir || '');
          const absolutePath = data.absolutePath ? this.normalizeWinPath(data.absolutePath) : `${baseDirWin}/${data.fileName}`;
          //const fileUrl = `file:///${this.normalizeWinPath(absolutePath)}`;

    
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
          
          window.electronAPI.showMessage(`구간 편집 완료: ${data.fileName}`); 
          
        } catch (error) {
          console.error("합치기 실행 중 오류 발생:", error);
          window.electronAPI.showMessage("구간 편집 실행 중 오류가 발생했습니다: " + error.message); 
        }
      } finally {
        this.isProcessing = false;
      }
    },

    // 비디오 정보 분석 헬퍼 함수 (새로 추가)
    async analyzeVideoInfo(fileIndex, filePath) {
      try {
        const videoInfo = await window.electronAPI.getVideoInfo(filePath);

        try {
          const fileStat = await window.electronAPI.statFile(filePath);
          this.files[fileIndex].size = fileStat.size;
        } catch (sizeError) {
          console.warn('파일 크기 조회 실패:', sizeError);
        }
        
        // 파일 정보 업데이트
        this.files[fileIndex].duration = this.formatDuration(videoInfo.duration);
        this.files[fileIndex].resolution = videoInfo.resolution || '알 수 없음';
        this.files[fileIndex].frameRate = videoInfo.frameRate ? `${videoInfo.frameRate.toFixed(2)} fps` : '알 수 없음';
        this.files[fileIndex].totalFrames = videoInfo.totalFrames || '알 수 없음';
        
        // 현재 선택된 파일이면 화면에 반영
        if (this.selectedFileIndex === fileIndex) {
          this.updateFileInfoDisplay(this.files[fileIndex]);
          
          if (videoInfo.frameRate) {
            this.frameRate = videoInfo.frameRate;
          }
          
          const durationSeconds = this.parseDurationToSeconds(this.files[fileIndex].duration);
          if (durationSeconds > 0) {
            this.videoDuration = durationSeconds;
            this.trimStartTime = 0;
            this.trimEndTime = durationSeconds;
            this.totalTime = this.files[fileIndex].duration;
          }
        }
        
      } catch (error) {
        console.error('비디오 정보 분석 실패:', error);
        // 실패 시 기본값 설정
        this.files[fileIndex].duration = '알 수 없음';
        this.files[fileIndex].resolution = '알 수 없음';
        this.files[fileIndex].frameRate = '알 수 없음';
        this.files[fileIndex].totalFrames = '알 수 없음';
      }
    },

 
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
     async onWatermarkImageUpload(e) {
      try {
        // Electron 파일 선택 다이얼로그 호출
        const result = await window.electronAPI.showOpenDialog({
          title: '워터마크 이미지 선택',
          filters: [
            { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png'] }
          ],
          properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return; // 사용자가 취소했거나 파일을 선택하지 않음
        }

        const selectedFilePath = result.filePaths[0];
        const fileName = selectedFilePath.split('\\').pop() || selectedFilePath.split('/').pop();
        
        console.log('선택된 파일 경로:', selectedFilePath);
        console.log('파일명:', fileName);
        
        this.waterMarkImageName = fileName;

        try {
          // 파일 복사하지 않고 원본 경로 그대로 사용
          // 미리보기용 이미지 로드 (원본 경로에서 직접)
          const imageData = await window.electronAPI.loadWatermark(selectedFilePath);
          this.watermarkImage = imageData.dataUrl;
          this.watermarkImageLoaded = false;
          this.preloadWatermarkImage();
          
          // 원본 파일의 실제 경로를 config.ini에 저장
          this.allConfig.export.waterimgpath = selectedFilePath;
          await this.saveSettings('watermark');
          
          window.electronAPI.showMessage('워터마크 이미지가 등록되었습니다.');
          
        } catch (error) {
          console.error("워터마크 이미지 처리 실패:", error);
          window.electronAPI.showMessage('워터마크 이미지 처리에 실패했습니다: ' + error.message);
        }

      } catch (error) {
        console.error("파일 선택 실패:", error);
        window.electronAPI.showMessage('파일 선택에 실패했습니다: ' + error.message);
      }
    },

    // 워터마크 이미지 삭제
    async onWatermarkImageDelete() {
      try {
        // 워터마크 이미지 관련 상태 초기화
        this.waterMarkImageName = '';
        this.watermarkImage = null;
        this.watermarkImageLoaded = false;
        this.cachedWatermarkImage = null;
        
        // config.ini에서 경로 제거
        this.allConfig.export.waterimgpath = '';
        
        // 설정 저장
        await this.saveSettings('watermark');
        
        // 캔버스 다시 그리기 (워터마크 제거 반영)
        this.$refs.videoCanvas?.drawBoundingBoxes?.();
        
        window.electronAPI.showMessage('워터마크 이미지가 삭제되었습니다.');
      } catch (error) {
        console.error('워터마크 이미지 삭제 실패:', error);
        window.electronAPI.showMessage('워터마크 이미지 삭제에 실패했습니다: ' + error.message);
      }
    },
    
     applyWatermark() {
       this.$refs.videoCanvas?.drawBoundingBoxes?.(); // 즉시 반영
       this.closeWatermarkModal();
     },
     preloadWatermarkImage() {
         if (!this.watermarkImage || this.watermarkImageLoaded) return;
         
         this.cachedWatermarkImage = new Image();
         this.cachedWatermarkImage.onload = () => {
           this.watermarkImageLoaded = true;
         };
         this.cachedWatermarkImage.src = this.watermarkImage;
     },
     closeWatermarkModal() {
       this.showWatermarkModal = false;
     },
     /* =======워터마크 관리 관련 메소드 끝=========== */
 
     /* =======설정 관리 관련 메소드=========== */
     // 설정 로드/저장
     async getExportConfig() {
       try {
         // 1) 설정 읽기
         const settings = await window.electronAPI.getSettings();
         this.allConfig = settings || {};
         this.allConfig.detect = this.allConfig.detect || {};
         this.allConfig.export = this.allConfig.export || {};
         this.allConfig.path   = this.allConfig.path   || {};

         // 2) 바탕화면 경로 확보 (+ 간단 정규화)
         this.desktopDir = await window.electronAPI.getDesktopDir();
         const normalize = (p) => (p || '').replace(/[\\/]+$/, '');
         const desktop = normalize(this.desktopDir);

         // 2-1) 값이 없을 때만 초기화 후 저장
         let needSave = false;
         if (!this.allConfig.path.video_path) {
           this.allConfig.path.video_path = desktop;
           needSave = true;
         }
         if (!this.allConfig.path.video_masking_path) {
           this.allConfig.path.video_masking_path = desktop;
           needSave = true;
         }
         if (needSave) {
           await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(this.allConfig)));
         }

         // 3) UI 경로 매핑(중복 제거)
         const openDir   = normalize(this.allConfig.path.video_path || desktop);
         const exportDir = normalize(this.allConfig.path.video_masking_path || desktop);
         this.dirConfig.videoDir = openDir;
         this.selectedExportDir  = exportDir;

         // 4) 워터마킹 토글
         this.isWaterMarking = this.allConfig.export.watermarking === 'yes';

         // 5) 자동객체탐지 대상 매핑
         const detect = String(this.allConfig.detect.detectobj ?? '');
         this.settingAutoClasses = { person: false, car: false, motorcycle: false, plate: false };
         switch (detect) {
           case '0':  this.settingAutoClasses.person = true; break;
           case '1':  this.settingAutoClasses.car = true; break;
           case '2':  this.settingAutoClasses.motorcycle = true; break;
           case '3':  this.settingAutoClasses.plate = true; break;
           case '4':  this.settingAutoClasses.person = this.settingAutoClasses.car = true; break;
           case '5':  this.settingAutoClasses.person = this.settingAutoClasses.motorcycle = true; break;
           case '6':  this.settingAutoClasses.person = this.settingAutoClasses.plate = true; break;
           case '7':  this.settingAutoClasses.car = this.settingAutoClasses.motorcycle = true; break;
           case '8':  this.settingAutoClasses.car = this.settingAutoClasses.plate = true; break;
           case '9':  this.settingAutoClasses.motorcycle = this.settingAutoClasses.plate = true; break;
           case '10': this.settingAutoClasses.person = this.settingAutoClasses.car = this.settingAutoClasses.motorcycle = true; break;
           case '11': this.settingAutoClasses.person = this.settingAutoClasses.car = this.settingAutoClasses.plate = true; break;
           case '12': this.settingAutoClasses.person = this.settingAutoClasses.motorcycle = this.settingAutoClasses.plate = true; break;
           case '13': this.settingAutoClasses.car = this.settingAutoClasses.motorcycle = this.settingAutoClasses.plate = true; break;
           case '14': this.settingAutoClasses.person = this.settingAutoClasses.car = this.settingAutoClasses.motorcycle = true; break;
         }

         // 6) 내보내기 마스킹 범위 매핑
         switch (String(this.allConfig.export.maskingrange ?? '0')) {
           case '0': this.settingExportMaskRange = 'none'; break;
           case '1': this.settingExportMaskRange = 'bg'; break;
           case '2': this.settingExportMaskRange = 'selected'; break;
           case '3': this.settingExportMaskRange = 'unselected'; break;
           default:  this.settingExportMaskRange = 'none';
         }

         // 7) 워터마크 이미지 미리보기
         if (this.allConfig.export.waterimgpath) {
          try {
            // 전체 경로에서 직접 로드
            const imageData = await window.electronAPI.loadWatermark(this.allConfig.export.waterimgpath);
            const fileName = this.allConfig.export.waterimgpath.split(/[/\\]/).pop();
            this.waterMarkImageName = fileName;
            this.watermarkImage = imageData.dataUrl;
            this.preloadWatermarkImage();
          } catch (imgError) {
            console.warn('워터마크 이미지 로드 실패:', imgError);
            // 경로가 잘못되었거나 파일이 없는 경우 설정 초기화
            this.allConfig.export.waterimgpath = '';
            this.waterMarkImageName = '';
            this.watermarkImage = null;
          }
         }

         // 8) DRM UI 값(안전 가드)
         const addDays = Number.parseInt(this.allConfig.export.play_date, 10);
         const safeDays = Number.isFinite(addDays) ? Math.max(0, addDays) : 0;
         const base = new Date();
         base.setHours(0,0,0,0);
         base.setDate(base.getDate() + safeDays);
         this.drmInfo.drmExportPeriod = this.formatDateToYMD(base);
         this.drmInfo.drmPlayCount = this.allConfig.export.play_count ?? 99;

         console.log('✅ getExportConfig loaded:', this.allConfig);
       } catch (error) {
         console.error('설정 파일 불러오기 실패:', error);
         window.electronAPI.showMessage('설정 파일을 불러 올 수 없습니다. 관리자에게 문의해 주세요.');
       }
     },



    formatDateToYMD(date) {
      if (!date) return null;
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
 
     // 설정 값 변환
     getDetectObjValue() {
         const { person, car, motorcycle, plate } = this.settingAutoClasses;
 
         if (person && !car && !motorcycle && !plate) return "0";
         if (car && !person && !motorcycle && !plate) return "1";
         if (motorcycle && !person && !car && !plate) return "2";
         if (plate && !person && !car && !motorcycle) return "3";
         if (person && car && !motorcycle && !plate) return "4";
         if (person && motorcycle && !car && !plate) return "5";
         if (person && plate && !car && !motorcycle) return "6";
         if (car && motorcycle && !person && !plate) return "7";
         if (car && plate && !person && !motorcycle) return "8";
         if (motorcycle && plate && !person && !car) return "9";
         if (person && car && motorcycle && !plate) return "10";
         if (person && car && plate && !motorcycle) return "11";
         if (person && motorcycle && plate && !car) return "12";
         if (car && motorcycle && plate && !person) return "13";
         if (person && car && motorcycle && plate) return "14";
     },
     getMaskingRangeValue() {
         switch(this.settingExportMaskRange) {
           case 'none': return "0";
           case 'bg': return "1";
           case 'selected': return "2";
           case 'unselected': return "3";
           default: return "0";
         }
     },
 
     // 설정 모달
     closeSettingModal() {
        this.currentMode = '';
        this.selectMode = true;
        this.showSettingModal = false;
      },
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
          window.electronAPI.showMessage("선택된 객체가 없습니다."); 
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
        
        window.electronAPI.showMessage(`${modifiedCount}개 객체의 상태가 변경되었습니다.`); 
      } else {
        window.electronAPI.showMessage("변경할 객체를 찾을 수 없습니다.");
      }
    },
     deleteObjectByTrackId(trackId) {
         if (!trackId) {
           window.electronAPI.showMessage("선택된 객체가 없습니다."); 
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

           window.electronAPI.showMessage(`${deletedCount}개의 객체가 삭제되었습니다. (track_id: ${trackId})`);
         } else {
           window.electronAPI.showMessage("삭제할 객체를 찾을 수 없습니다.");
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
             window.electronAPI.showMessage('객체 삭제 중 오류가 발생했습니다.');
           });

           window.electronAPI.showMessage(`${deletedCount}개의 객체가 삭제되었습니다.`);
         } else {
           window.electronAPI.showMessage("삭제할 객체가 없습니다.");
         }
     },
     /* =======컨텍스트 메뉴 및 객체 관리 관련 메소드 끝=========== */
 
     /* =======마스킹 프리뷰 관련 메소드=========== */
     // startMaskPreview, stopMaskPreview, applyEffectFull 메서드는 VideoCanvas 컴포넌트로 이동
     /* =======마스킹 프리뷰 관련 메소드 끝=========== */
 
     /* =======내보내기 관련 메소드=========== */
     // 내보내기 실행
     async sendExportRequest() {
       // 0) 사전 체크
       if (this.selectedFileIndex < 0) {
         window.electronAPI.showMessage("영상을 선택해주세요.");
         return;
       }

       // 1) 출력 경로 보정 및 설정 저장
       try {
         if (!this.selectedExportDir || !String(this.selectedExportDir).trim()) {
           try {
             this.selectedExportDir = await window.electronAPI.getDesktopDir();
           } catch {
             this.selectedExportDir = (this.dirConfig?.videoDir || 'C:/Users/Public/Videos');
           }
         } 

         // settings에 경로 반영
         this.allConfig.path = this.allConfig.path || {};
         //this.allConfig.path.video_path = this.selectedExportDir;

         // DRM 날짜/횟수 반영
         const today = new Date();
         const selectedDate = new Date(this.drmInfo.drmExportPeriod);
         const timeDifference = selectedDate.getTime() - today.getTime();
         const daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
         this.allConfig.export.play_date = daysDifference;
         this.allConfig.export.play_count = this.drmInfo.drmPlayCount;

         // 설정 저장
         const configToSave = JSON.parse(JSON.stringify(this.allConfig));
         await window.electronAPI.saveSettings(configToSave);
       } catch (error) {
         console.error('설정 저장 실패:', error);
         window.electronAPI.showMessage('설정 저장에 실패했습니다: ' + error.message);
       }

       // 2) CSV 검증 (전체마스킹 예외 허용)
       const validateResult = this.validateCSVForExport();
       if (!validateResult.valid && this.exportAllMasking === 'No') {
         window.electronAPI.showMessage(validateResult.message);
         this.currentMode = '';
         this.exporting = false;
         this.selectMode = true;
         return;
       } else if (!this.dataLoaded && this.exportAllMasking === 'No') {
         window.electronAPI.showMessage("원본 영상은 내보내기를 진행할 수 없습니다.\n먼저 반출(탐지) 작업을 완료한 뒤, 내보내기를 진행해주세요.");
         this.currentMode = '';
         this.exporting = false;
         this.selectMode = true;
         return;
       }

       // 3) UI 상태 초기화 + 비디오 일시정지
       if (this.video) {this.video.pause(); this.videoPlaying = false;}
       this.exporting = true;           // 모달 ON (중요)
       this.exportProgress = 0;
       this.exportMessage = "내보내는 중...";
       if (this.$refs.progressBar2)   this.$refs.progressBar2.style.width = '0%';
       if (this.$refs.progressLabel2) this.$refs.progressLabel2.textContent = '0%';

       let jobId;

       // 4) 분기: 원본파일저장 vs 암호화 파일저장
       if (this.exportFileNormal) {
         // 4-1) 일반 내보내기 요청 (OutputDir 포함)
         try {
           const res = await apiPython.post(`${config.autodetect}`, {
             Event: "3",
             VideoPath: this.files[this.selectedFileIndex].name,
             AllMasking: this.exportAllMasking,               // 'Yes' 또는 'No'
             OutputDir: this.selectedExportDir,               // 추가: 출력 경로
             maskingrange: this.getMaskingRangeValue?.()      // 선택: 서버에서 쓰면 전달
           });
           if (!res) throw new Error("내보내기 요청 실패");
           jobId = res.data?.job_id;
           if (!jobId) throw new Error("job_id가 없습니다.");
         } catch (err) {
           this.exporting = false;
           window.electronAPI.showMessage("내보내기 요청 실패: " + err.message);
           return;
         }

         // 4-2) 진행률 폴리
         this._startExportPolling(jobId);
 
       } else {
         // 4-3) 암호화 파일 저장
         const userInfo = { userId: 'test' }; // TODO: 실제 사용자 정보 연동

         if (!this.exportFilePassword) { 
           this.exporting = false;
           window.electronAPI.showMessage('암호화 파일저장을 위해서는 재생암호를 입력해주세요.');
           return;
         }

         try {
           // 출력 경로 함께 전달
           const response = await window.electronAPI.encryptFile({
             file: this.files[this.selectedFileIndex].name,
             videoPw: this.exportFilePassword,
             userId: userInfo.userId,
             outputDir: this.selectedExportDir     // 추가: 출력 경로
           });

           if (response?.success) {
             jobId = response.data;
             // 암호화 낸볂내기 폴리 (비밀번호 초기화 콜백 추가)
             this._startExportPolling(jobId, () => { this.exportFilePassword = ''; });
           } else {
             this.exporting = false;
             window.electronAPI.showMessage('암호화 처리 실패: ' + (response?.data || '원인 불명'));
           }
         } catch (error) {
           console.error('암호화 요청 오류:', error);
           this.exporting = false;
           window.electronAPI.showMessage('암호화 요청 중 오류가 발생했습니다: ' + error.message);
         }
       }
     },

     
     //검증
     validatePasswordCharacters(password) {
       const asciiOnly = /^[\x00-\x7F]*$/;
       return asciiOnly.test(password);
     },
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
     /**
      * 낸볂내기 폴리 공통 핼퍼
      * @param {string} jobId - 작업 ID
      * @param {Function} extraOnComplete - 추가 완료 콜백 (선택적)
      */
     _startExportPolling(jobId, extraOnComplete) {
       this._exportPoller = createProgressPoller({
         onProgress: (data) => {
           this.exportProgress = Math.floor(data.progress || 0);
           this.exportMessage = `낸볂내는 중... ${this.exportProgress}%`;
           if (this.$refs.progressBar2) {
             this.$refs.progressBar2.style.width = this.exportProgress + '%';
           }
           if (this.$refs.progressLabel2) {
             this.$refs.progressLabel2.textContent = this.exportProgress + '%';
           }
         },
         onComplete: (data) => {
           if (data.error) {
             console.error('서버 에러:', data.error);
             window.electronAPI.showMessage('낸볂내기 중 오류 발생: ' + data.error);
             this.exporting = false;
             this.exportProgress = 0;
             return;
           }
           this.exportMessage = '낸볂내기 완료!';
           this.copyJsonWithExport(this.files[this.selectedFileIndex].name, this.selectedExportDir);
           this.currentMode = '';
           this.selectMode = true;
           this.exporting = false;
           this.exportProgress = 0;
           if (extraOnComplete) extraOnComplete();
         },
         onError: (err) => {
           this.exporting = false;
           window.electronAPI.showMessage('폴리 중 오류: ' + err.message);
         }
       });
       this._exportPoller.start(jobId);
     },

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
             window.electronAPI.showMessage(`전체 마스킹을 설정합니다 (${typeText})`); 
           } else {
             this.exportAllMasking = 'No';
             this.currentMode = '';      
             this.selectMode = true;
             window.electronAPI.showMessage('전체 마스킹을 해제합니다');
           }
         }
         else if (item === '미리보기') {
         this.isBoxPreviewing = !this.isBoxPreviewing;
         const msg = this.isBoxPreviewing ? '미리보기 시작' : '미리보기 중지';
         if(!this.isBoxPreviewing) {
           this.selectMode = true;
         }
         window.electronAPI.showMessage(msg);
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

     async batchProcessing() {
      try {
        if(this.files.length === 0) {
          window.electronAPI.showMessage('영상 파일을 선택해주세요.');
          return;
        }

        this.isBatchProcessing = true;
        this.totalFiles = this.files.length;
        this.currentFileIndex = 0;
        this.currentFileName = '';
        this.phase = 'init';
        this.currentFileProgress = 0;

        const response = await apiPython.post(`${config.batchProcessing}`, {
          VideoPaths: this.files.map(file => file.file)
        });
        this.batchJobId = response.data.job_id;

        this.startBatchPolling();
        
      } catch (error) {
        console.error('일괄처리 오류:', error);
        window.electronAPI.showMessage('일괄처리 오류: ' + error.message);
      }
     },

     startBatchPolling() {
       this._batchPoller = createBatchPoller({
         onProgress: (data) => {
           this.currentFileIndex = data.current || 0;
           this.totalFiles = data.total || this.files.length;
           this.currentFileName = data.current_video || '';
           this.phase = data.phase || '';
           this.currentFileProgress = data.progress || 0;
         },
         onComplete: () => {
           this.phase = 'complete';
           window.electronAPI.showMessage('일괄처리가 완료되었습니다.');
           this.loadDetectionData();
           setTimeout(() => {
             this.resetBatchState();
           }, 1500);
         },
         onError: (err) => {
           window.electronAPI.showMessage('일괄처리 중 오류 발생: ' + err.message);
         }
       });
       this._batchPoller.start(this.batchJobId);
     },

    stopBatchPolling() {
      if (this._batchPoller) {
        this._batchPoller.stop();
        this._batchPoller = null;
      }
    },

    cancelBatchProcessing() {
      this.resetBatchState();
    },

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