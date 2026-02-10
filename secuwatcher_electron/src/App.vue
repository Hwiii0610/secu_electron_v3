<template>
  <div class="container">
    <TopMenuBar @menu-click="handleMenuItemClick" />
 

    <div class="wrapper">
      <!-- 좌측 메인 컨테이너 -->
     <div class="video-wrapper">
       <!-- 비디오 영역 -->
       <div class="video-container">
         <video id="video" ref="videoPlayer" class="video-player"></video>
         
         <div v-if="conversion.inProgress" class="conversion-overlay">
            <div class="conversion-info">
              <h4>{{ conversion.currentFile }} 변환 중...</h4>
              <div class="conversion-progress-bar">
                <div class="conversion-progress-fill" :style="{ width: conversion.progress + '%' }"></div>
              </div>
              <p>진행률: {{ conversion.progress }}%</p>
              <p>재생을 위해 MP4로 변환하고 있습니다.</p>
            </div>
          </div>
 
         <!-- preview 전용 캔버스 하나만 남기고, v-show로 토글 -->
         <canvas
           ref="maskPreview"
           class="mask-preview-canvas"
           :style="{ display: exportAllMasking === 'Yes' ? 'block' : 'none' }"
         ></canvas>
 
         <canvas
           ref="maskingCanvas"
           id="canvas"
           @click="onCanvasClick"
           @mousedown="onCanvasMouseDown"
           @mousemove="onCanvasMouseMove"
           @mouseup="onCanvasMouseUp"
           @contextmenu.prevent="onCanvasContextMenu"
           :style="{ pointerEvents: selectMode ? 'auto' : 'none' }"
         ></canvas>
 
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
       this.video = this.$refs.videoPlayer;
       if (this.video) {
         this.video.addEventListener('loadedmetadata', this.onVideoLoaded);
         this.video.addEventListener('ended', this.onVideoEnded);
         this.startAnimationLoop();
       }
       window.addEventListener('resize', this.resizeCanvas);
       window.addEventListener('mousemove', this.onMarkerMouseMove);
       window.addEventListener('mouseup', this.onMarkerMouseUp);
       window.addEventListener('mousedown', this.handleGlobalMouseDown); // 클릭 대신 mousedown

       // 키보드 이벤트 리스너 추가
       window.addEventListener('keydown', this.handleKeyDown);

       // 전체마스킹 토글 감시 → 자동으로 프리뷰 시작/중지
       this.$watch('exportAllMasking', newVal => {
         if (newVal === 'Yes') {
         this.startMaskPreview();
       } else {
         this.stopMaskPreview();
       }
       });
     },
     beforeUnmount() {
       if (this.video) {
         this.video.removeEventListener('loadedmetadata', this.onVideoLoaded);
         this.video.removeEventListener('ended', this.onVideoEnded);
       }
       window.removeEventListener('resize', this.resizeCanvas);
       window.removeEventListener('mousemove', this.onMarkerMouseMove);
       window.removeEventListener('mouseup', this.onMarkerMouseUp);

       // ? 키보드 이벤트 리스너 제거
       window.removeEventListener('keydown', this.handleKeyDown);
 
       window.removeEventListener('mousedown', this.handleGlobalMouseDown);
           // 마스킹 프리뷰 정리
           this.stopMaskPreview();
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
         const p = decodeURI(sel.url).replace(/^file:\/+/, '');
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
       try {
         this.conversion.inProgress = true;
         this.conversion.progress = 0;
         this.conversion.currentFile = file.name;

         // 진행률 이벤트 리스너
         const progressHandler = (event, data) => {
           this.conversion.progress = data.progress;
         };
         window.electronAPI.onConversionProgress(progressHandler);

         const originalPath = file.file || file.path || file.url?.replace(/^file:\/\//, '') || file.name;
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
         this.video.src = convertedUrl;
         this.video.load();
         this.updateVideoInfoFromElectron(file);
         this.video.play(); 
         this.videoPlaying = true;

         this.conversion.inProgress = false;
         
         try {
           // 원본 파일 삭제 (기존 deleteTempFile API 활용)
           await window.electronAPI.deleteTempFile(originalPath);
           console.log('원본 파일 삭제 완료:', originalPath);
         } catch (deleteErr) {
           console.error('원본 파일 삭제 실패:', deleteErr);
           // 원본 삭제 실패는 사용자에게 알리거나 조용히 넘어감 (선택 사항)
         }
       } catch (err) {
         console.error('경로 변환 중 오류:', err);
         window.electronAPI.showMessage('파일 변환 중 오류가 발생했습니다: ' + err.message);
         this.conversion.inProgress = false;
         this.conversion.progress = 0;
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


     /* ==========비디오 제어 관련 메소드=========== */
     // 비디오 생명주기
     onVideoLoaded() {
      if (this.video) {
          this.video.playbackRate = 1;
          this.currentPlaybackRate = 1;
        }
         // 임시 처리용 캔버스
         this.tmpCanvas = document.createElement('canvas');
         this.tmpCtx    = this.tmpCanvas.getContext('2d');
         this.resizeCanvas();
         this.drawBoundingBoxes();
 
         this.resizeCanvas();
 
         // 마스크 프리뷰용 캔버스 초기화
         this.maskCanvas = this.$refs.maskPreview;
         this.maskCtx    = this.maskCanvas.getContext('2d');
 
         // 캔버스 해상도/스타일 동기화
         this.resizeMaskCanvas();
         window.addEventListener('resize', this.resizeMaskCanvas);
     },
     async onVideoEnded() {
       this.videoPlaying = false;
 
       if (this.newMaskings.length > 0) {
         await this.sendBatchMaskingsToBackend();  // 호출 필요
       }
 
       const canvas = this.$refs.maskingCanvas;
       if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
       this.manualBox = null;
       this.drawBoundingBoxes();
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
     formatTime(seconds) {
       if (!seconds || isNaN(seconds)) return '00:00';
       const minutes = Math.floor(seconds / 60);
       const secs = Math.floor(seconds % 60);
       return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
     },
     /* ==========비디오 관련 메소드 끝=========== */
 
     // 마우스 위치에 있는 바울링 박스 확인
     checkHoveredBox(e) {
       if (!this.$refs.videoPlayer || !this.$refs.maskingCanvas) return;
       
       const clickPoint = this.convertToOriginalCoordinates(e);
       const currentFrame = this.getCurrentFrameNormalized() + 1;
       
       // 겹치는 모든 박스 저장 { track_id, area }
       let overlappingBoxes = [];
       
       // 1) detectionResults에서 확인 (자동객체탐지 결과)
       const currentFrameBoxes = this.detectionResults.filter(item => item.frame === Math.floor(this.video.currentTime * this.frameRate));
       for (const result of currentFrameBoxes) {
         if (result.bbox) {
           const coords = result.bbox.split(',').map(Number);
           if (coords.length === 4 && coords.every(num => !isNaN(num))) {
             const [x, y, w, h] = coords;
             if (clickPoint.x >= x && clickPoint.x <= x + w &&
                 clickPoint.y >= y && clickPoint.y <= y + h) {
               overlappingBoxes.push({
                 track_id: result.track_id,
                 area: w * h
               });
             }
           }
         }
       }
       
       // 2) maskingLogs에서 확인 (탐지 데이터)
       if (this.dataLoaded) {
         const logs = this.maskingLogsMap[currentFrame] || [];
         for (const log of logs) {
           try {
             const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
             // 사각형 형식 [x0, y0, x1, y1]
             if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
               const [x0, y0, x1, y1] = bboxData;
               if (clickPoint.x >= x0 && clickPoint.x <= x1 &&
                   clickPoint.y >= y0 && clickPoint.y <= y1) {
                 overlappingBoxes.push({
                   track_id: log.track_id,
                   area: (x1 - x0) * (y1 - y0)
                 });
               }
             }
             // 다각형 형식은 바울링 박스로 체크
             else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
               const xs = bboxData.map(point => point[0]);
               const ys = bboxData.map(point => point[1]);
               const minX = Math.min(...xs);
               const minY = Math.min(...ys);
               const maxX = Math.max(...xs);
               const maxY = Math.max(...ys);
               if (clickPoint.x >= minX && clickPoint.x <= maxX &&
                   clickPoint.y >= minY && clickPoint.y <= maxY) {
                 overlappingBoxes.push({
                   track_id: log.track_id,
                   area: (maxX - minX) * (maxY - minY)
                 });
               }
             }
           } catch (error) {
             // 파싱 오류 무시
           }
         }
       }
       
       // 면적이 가장 작은 박스 선택 (내부 박스 우선)
       let foundBoxId = null;
       if (overlappingBoxes.length > 0) {
         overlappingBoxes.sort((a, b) => a.area - b.area);
         foundBoxId = overlappingBoxes[0].track_id;
       }
       
       // 호버 상태 변경 시에만 다시 그리기
       if (this.hoveredBoxId !== foundBoxId) {
         this.hoveredBoxId = foundBoxId;
         this.drawBoundingBoxes();
       }
     },
     
     /* =======캔버스/마스킹 관련 메소드========= */
     // 캔버스 크기 조절
     resizeCanvas() {
       const canvas = this.$refs.maskingCanvas;
       const video = this.$refs.videoPlayer;
       if (canvas && video) {
         const rect = video.getBoundingClientRect();
         const displayedWidth = rect.width;
         const displayedHeight = rect.height;
         canvas.width = displayedWidth;
         canvas.height = displayedHeight;
         canvas.style.width = displayedWidth + 'px';
         canvas.style.height = displayedHeight + 'px';
         this.drawBoundingBoxes();
       }
     },
     resizeMaskCanvas() {
         if (!this.video || !this.maskCanvas) return;
 
         // 1) 내부 픽셀 해상도 를 비디오 원본 해상도로
         const origW = this.video.videoWidth;
         const origH = this.video.videoHeight;
         this.maskCanvas.width  = origW;
         this.maskCanvas.height = origH;
         this.tmpCanvas.width   = origW;
         this.tmpCanvas.height  = origH;
 
         // CSS 위치/크기: getBoundingClientRect() 로 화면에 그려진 정확한 위치/크기 가져오기
       const rect = this.video.getBoundingClientRect();
       Object.assign(this.maskCanvas.style, {
         position:      'absolute',
         top:           `${rect.top + window.scrollY}px`,
         left:          `${rect.left + window.scrollX}px`,
         width:         `${rect.width}px`,
         height:        `${rect.height}px`,
         pointerEvents: 'none',
         zIndex:        5
       });
     },
 
     // 마우스 이벤트 처리
     async onCanvasClick(e) {
       // 1) 공통 체크
       if (!this.selectMode) return;
       const canvas = this.$refs.maskingCanvas;
       if (!canvas || !this.video) return;
 
       // 2) 마스킹 모드?다각형 처리
       if (this.currentMode === 'mask' && this.maskMode === 'polygon') {
         const point = this.convertToOriginalCoordinates(e);
         // 이미 닫힌 다각형이면 무시
         if (this.isPolygonClosed) return;
 
         if (this.maskingPoints.length >= 3) {
           const first = this.maskingPoints[0];
           const dx = first.x - point.x, dy = first.y - point.y;
           if (Math.hypot(dx, dy) < this.maskCompleteThreshold) {
             this.isPolygonClosed = true;
             this.maskingPoints.push({ ...first });
             this.drawPolygon();
             // 프레임 범위가 지정된 후라면 우클릭 메뉴에서 저장
             if (this.maskFrameStart == null || this.maskFrameEnd == null) {
               this.logMasking();
             }
             return;
           }
         }
 
         this.maskingPoints.push(point);
         this.drawPolygon();
         return;
       }
 
       // 3) 선택 객체 탐지 모드
       if (this.currentMode === 'select') {
         if (this.hasSelectedDetection) {
           window.electronAPI.showMessage('이미 선택 객체 탐지를 실행했습니다.');
             return;
           }
 
             // 영상 멈춤
         this.video.pause();
         this.videoPlaying = false;
 
           this.hasSelectedDetection = true;
         // (A) 좌표 변환
         const origW = this.video.videoWidth;
         const origH = this.video.videoHeight;
         const dispW = this.video.clientWidth;
         const dispH = this.video.clientHeight;
         const scale = Math.min(dispW / origW, dispH / origH);
         const drawW = origW * scale, drawH = origH * scale;
         const offsetX = (dispW - drawW) / 2, offsetY = (dispH - drawH) / 2;
 
         const rect   = canvas.getBoundingClientRect();
         const clickX = e.clientX - rect.left;
         const clickY = e.clientY - rect.top;
         const originalX = Math.floor((clickX - offsetX) / scale);
         const originalY = Math.floor((clickY - offsetY) / scale);
         const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
 
         // (B) API 엔드포인트 & 페이로
         try {
           // (C) POST 요청
           const postRes = await apiPython.post(`${config.autodetect}`, {
            Event:      "2",
            VideoPath:  this.files[this.selectedFileIndex].name,
            FrameNo:    String(currentFrame),
            Coordinate: `${originalX},${originalY}`
           });
           if (!postRes) throw new Error(`POST 실패`);
           if (!postRes.data.job_id) throw new Error("? job_id 없음");
           const jobId = postRes.data.job_id;
 
           this.progress    = 0;
           this.isDetecting = true;
 
           // 안전한 폴링 중지 함수
           const stopPolling = () => {
             if (this.detectionIntervalId) {
               clearInterval(this.detectionIntervalId);
               this.detectionIntervalId = null;
             }
             this.isDetecting = false;
           };
 
           // (D) 1초마다 진행상황 폴링
           this.detectionIntervalId = setInterval(async () => {
             try {
               const progRes = await apiPython.get(`${config.progress}/${jobId}`);
                 // GET 요청이 실패하면 "선택한 객체가 없습니다" 팝업
               if (!progRes) {
                 clearInterval(this.detectionIntervalId);
                 this.isDetecting = false;
                 window.electronAPI.showMessage('선택한 객체가 없습니다.');
                 return;
               }
               
               const progJson = progRes.data;
 
               this.progress = Math.floor(progJson.progress || 0);
               if (this.$refs.progressBar)   this.$refs.progressBar.style.width = this.progress + '%';
               if (this.$refs.progressLabel) this.$refs.progressLabel.textContent = this.progress + '%';
 
               if (progJson.error) {
                 throw new Error(progJson.error);
               }
 
               if (progJson.progress >= 100 || progJson.status === 'completed') {
                       this.currentMode = '';
                 stopPolling();
 
                       if(progJson.error){
                         console.error("? 서버에서 에러 응답:", progJson.error);
                         window.electronAPI.showMessage("객체 탐지 중 오류 발생: " + progJson.error);
                         return;
                       }
 
                       this.loadDetectionData();
               }
             } catch (err) {
               console.error("? 선택 객체 탐지 중 오류:", err);
               stopPolling();
               window.electronAPI.showMessage("객체 탐지 중 오류 발생: " + err.message);
             }
           }, 1000);
 
         } catch (err) {
           console.error('? 선택객체탐지 API 에러:', err);
           window.electronAPI.showMessage('선택 객체 탐지 실패: ' + err.message);
         }
       }
     },
      onCanvasMouseDown(e) {
       // 왼쪽 버튼이 아니라면 아무 것도 하지 않음 (우클릭 방지)
       if (e.button !== 0) return;
 
       if (this.currentMode === 'mask' && this.maskMode === 'rectangle') {
         const point = this.convertToOriginalCoordinates(e);
         this.maskingPoints = [point];
         this.isDrawingMask = true;
       }
       
       if (this.currentMode === 'manual') {
         const click = this.convertToOriginalCoordinates(e);
 
         // 사각형이 없는 경우: 새로 만들기 시작
         if (!this.manualBox) {
           this.manualBox = { x: click.x, y: click.y, w: 0, h: 0 };
           this.isDrawingManualBox = true;
           return;
         }
 
         const { x, y, w, h } = this.manualBox;
         const withinBox = (
           click.x >= x && click.x <= x + w &&
           click.y >= y && click.y <= y + h
         );
 
         if (withinBox) {
           // 이미 있는 박스를 클릭하면 이동
           this.isDraggingManualBox = true;
           this.dragOffset = { x: click.x - x, y: click.y - y };
         } else {
           // 박스 외부 클릭하면 새 박스 만들기 시작
           this.manualBox = { x: click.x, y: click.y, w: 0, h: 0 };
           this.isDrawingManualBox = true;
         }
       }
     },
     onCanvasMouseMove(e) {
       if (e.button !== 0) return;
       
       // 마우스 위치에 있는 박스 확인 (호버 효과용)
       this.checkHoveredBox(e);
       
       if (this.currentMode === 'manual') {
         const current = this.convertToOriginalCoordinates(e);
         let updated = false;
 
         // 크기 조절 중
         if (this.isDrawingManualBox && this.manualBox) {
           this.manualBox.w = current.x - this.manualBox.x;
           this.manualBox.h = current.y - this.manualBox.y;
           updated = true;
         }
 
         // 위치 이동 중
         else if (this.isDraggingManualBox && this.manualBox) {
       // 사각형의 위치를 업데이트하고, 이동하는 좌표마다 저장 호출
         this.manualBox.x = current.x - this.dragOffset.x;
         this.manualBox.y = current.y - this.dragOffset.y;
         const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
         const bbox = this.getBBoxString(this.manualBox);
         this.saveManualMaskingEntry(currentFrame, bbox);
       }
           this.drawBoundingBoxes();
         }
 
       if (this.currentMode === 'mask' && this.maskMode === 'rectangle' && this.isDrawingMask) {
         const point = this.convertToOriginalCoordinates(e);
         if (this.maskingPoints.length === 1) {
           this.maskingPoints.push(point);
         } else {
           this.maskingPoints[1] = point;
         }
         this.drawRectangle();
       }
     },
     onCanvasMouseUp(e) {
       if (e.button !== 0) return;
 
       if (this.currentMode === 'manual') {
       // 1) 정지 상태에서 그린 박스 → 자동재생 (manualBox 유지)
       if (this.isDrawingManualBox) {
         this.isDrawingManualBox = false;
 
         const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
         const bbox = this.getBBoxString(this.manualBox);
         this.saveManualMaskingEntry(currentFrame, bbox);
 
               if (this.newMaskings.length > 0) {
                 this.sendBatchMaskingsToBackend();
               }
 
         this.video.play();
         this.videoPlaying = true;
       }
 
       // 2) 영상 재생 중 박스를 드래그로 이동 → 마우스 업 시 삭제
       else if (this.isDraggingManualBox) {
         this.isDraggingManualBox = false;
 
         const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
         const bbox = this.getBBoxString(this.manualBox);
         this.saveManualMaskingEntry(currentFrame, bbox);
 
               if (this.newMaskings.length > 0) {
                 this.sendBatchMaskingsToBackend();
               }
 
         // 이 프레임까지 저장한 후에 manualBox 제거
         this.manualBox = null;
 
         // 캔버스 클리어 후 마스킹 다시 그리기
         const canvas = this.$refs.maskingCanvas;
         if (canvas) {
           canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
         }
         this.drawBoundingBoxes();
 
         // 자동 재생 유지
               this.currentMode = '';
         this.video.play();
         this.videoPlaying = true;
       }
       }
 
       if (this.currentMode === 'mask' && this.maskMode === 'rectangle' && this.isDrawingMask) {
         const endPoint = this.convertToOriginalCoordinates(e);
         if (this.maskingPoints.length === 1) {
           this.maskingPoints.push(endPoint);
         } else {
           this.maskingPoints[1] = endPoint;
         }
         this.isDrawingMask = false;
 
         const start = this.maskingPoints[0];
         const dx = Math.abs(start.x - endPoint.x);
         const dy = Math.abs(start.y - endPoint.y);
         if (dx < 5 && dy < 5) {
           this.maskingPoints = [];
           return;
         }
 
         this.drawRectangle();
               //this.video.play();
               //this.videoPlaying = true; 
       }
     },
     onCanvasContextMenu(e) {
       e.stopPropagation();  
         
       if (this.selectedFileIndex < 0) {
         console.log("선택된 파일이 없습니다");
         return;
       }
       if (this.currentMode !== 'mask' && this.currentMode !== '') return;
 
       const clickPoint = this.convertToOriginalCoordinates(e);
       // 호버된 객체가 있으면 우선 사용, 없으면 위치에서 찾기
       const trackId = this.hoveredBoxId || this.findTrackIdAtPosition(clickPoint);
 
       let shapeClicked = false;
       if (this.maskMode === 'rectangle' && this.maskingPoints.length === 2) {
         const [p0, p1] = this.maskingPoints;
         const minX = Math.min(p0.x, p1.x);
         const maxX = Math.max(p0.x, p1.x);
         const minY = Math.min(p0.y, p1.y);
         const maxY = Math.max(p0.y, p1.y);
         if (clickPoint.x >= minX && clickPoint.x <= maxX && clickPoint.y >= minY && clickPoint.y <= maxY) {
           shapeClicked = true;
         }
       } else if (this.maskMode === 'polygon' && this.maskingPoints.length >= 3 && this.isPolygonClosed) {
         if (this.isPointInPolygon(clickPoint, this.maskingPoints)) {
           shapeClicked = true;
         }
       }
         if (this.selectedFileIndex >= 0) {
           shapeClicked = true;
         }
          
         setTimeout(() => {
           this.contextMenuVisible = true;
           this.contextMenuPosition = { x: e.clientX, y: e.clientY };
           
           this.selectedShape = trackId;
         }, 0);
     },
 
     // 그리기 메소드
     drawBoundingBoxes() {
      const video = this.$refs.videoPlayer;
      const canvas = this.$refs.maskingCanvas;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.drawDetectionBoxes(ctx, video);  
      // 워터마크 렌더링 코드 제거 (모자이크/블러 처리 후로 이동)
      
      if (this.currentMode === 'manual' && this.manualBox) {
        const ctx = canvas.getContext('2d');
        const { x, y, w, h } = this.manualBox;

        const topLeft = this.convertToCanvasCoordinates({ x, y });
        const bottomRight = this.convertToCanvasCoordinates({ x: x + w, y: y + h });

        const rectX = topLeft.x;
        const rectY = topLeft.y;
        const rectW = bottomRight.x - topLeft.x;
        const rectH = bottomRight.y - topLeft.y;

        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
      }

      // CSV 파일로 불러온 마스킹 정보 그리기 (모자이크/블러 처리)
      const currentFrame = this.getCurrentFrameNormalized() + 1;
      if (this.dataLoaded) {
        this.drawCSVMasks(ctx, currentFrame);
      }

      if (this.currentMode === 'mask') {
        if (this.maskFrameStart !== null && this.maskFrameEnd !== null &&
            (currentFrame < this.maskFrameStart || currentFrame > this.maskFrameEnd)) {
          return;
        }
        if (this.maskMode === 'polygon' && this.maskingPoints.length > 0) {
          this.drawPolygon();
        }
        if (this.maskMode === 'rectangle' && this.maskingPoints.length === 2) {
          this.drawRectangle();
        }
      }

      // 워터마크를 모든 효과 처리 후 마지막에 그리기
      if(this.isWaterMarking && this.isBoxPreviewing){ // 미리보기 모드 + 워터마킹 사용 되었을 때만 작용
        this.drawWatermarkPreview(ctx, canvas);  // 워터마크 렌더링
      }
    },

     drawCSVMasks(ctx, currentFrame) {
       const video = this.$refs.videoPlayer;
       const tmp   = this.tmpCanvas;
       const tmpCtx= this.tmpCtx;
 
       // 원본 해상도
       const origW = video.videoWidth;
       const origH = video.videoHeight;
 
       // 1) tmpCanvas에 원본 프레임 그려두기
       tmp.width  = origW;
       tmp.height = origH;
       tmpCtx.clearRect(0, 0, origW, origH);
       tmpCtx.drawImage(video, 0, 0, origW, origH);
 
       // 2) 비디오가 화면에 실제 표시되는 크기/위치 구하기
       const rect = video.getBoundingClientRect();
       const dispW   = rect.width;
       const dispH   = rect.height;
       const scale   = Math.min(dispW / origW, dispH / origH);
       const offsetX = (dispW - origW * scale) / 2;
       const offsetY = (dispH - origH * scale) / 2;
 
       // 3) 이 프레임에 해당하는 로그만 골라냄 (O(1) 조회)
       const logs = this.maskingLogsMap[currentFrame] || [];
 
       // 4) 설정값
       const range = this.settingExportMaskRange; // 'none','selected','bg','unselected'
       const type  = this.allConfig.export.maskingtool === '0' ? 'mosaic' : 'blur';  // 'mosaic' or 'blur'
       const lvl   = Number(this.allConfig.export.maskingstrength); // 1~5
 
       // 5) 헬퍼: 원본 좌표 → 캔버스 픽셀 좌표
       function toCanvas(x, y) {
         return {
           x: x * scale + offsetX,
           y: y * scale + offsetY
         };
       }
 
       // 6) 헬퍼: 모자이크/블러 처리
       function applyMosaic(sx, sy, sw, sh, dx, dy, dw, dh) {
           const tileW = Math.max(1, Math.floor(dw / (lvl + 4)));
           const tileH = Math.max(1, Math.floor(dh / (lvl + 4)));
         ctx.drawImage(tmp, sx, sy, sw, sh, dx, dy, tileW, tileH);
         ctx.drawImage(ctx.canvas, dx, dy, tileW, tileH, dx, dy, dw, dh);
         ctx.imageSmoothingEnabled = false;
       }
       function applyBlur(sx, sy, sw, sh, dx, dy, dw, dh) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 원본 영역을 임시 캔버스에 복사
        tempCtx.drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);
        
        // 전체에 블러 적용
        tempCtx.filter = `blur(${lvl + 4}px)`;
        tempCtx.drawImage(tempCanvas, 0, 0);
        
        // 결과를 목적지에 그리기
        ctx.drawImage(tempCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
       }
       function applyEffect(sx, sy, sw, sh, dx, dy, dw, dh) {
         if (type === 'mosaic') applyMosaic(sx, sy, sw, sh, dx, dy, dw, dh);
         else                  applyBlur(  sx, sy, sw, sh, dx, dy, dw, dh);
       }
       
 
 
       if (this.exportAllMasking === 'Yes') {
             applyEffect(0, 0, origW, origH, offsetX, offsetY, origW * scale, origH * scale);
             return;
           }
 
       // 7) 분기별 처리
         if(this.isBoxPreviewing){ // 미리보기 상태에만 분기 작동 이외에는 바로 바운딩 박스 처리
           switch (range) {
             case 'none':
               break;
 
             case 'selected':
               // 지정 객체만 마스킹
               logs
               .filter(log => String(log.object) === '1')
               .forEach(log => {
                 try {
                   const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
                   
                   // 사각형 형식 [x0, y0, x1, y1] 처리
                   if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
                     const [x0, y0, x1, y1] = bboxData;
                     const sw = x1 - x0, sh = y1 - y0;
                     const p0 = toCanvas(x0, y0);
                     const dw = sw * scale, dh = sh * scale;
                     applyEffect(x0, y0, sw, sh, p0.x, p0.y, dw, dh);
                   }
                   // 다각형 형식 [[x1,y1], [x2,y2], ...] 처리
                   else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
                     // 1) 다각형 바운딩 박스 계산
                     const xs = bboxData.map(point => point[0]);
                     const ys = bboxData.map(point => point[1]);
                     const minX = Math.min(...xs);
                     const minY = Math.min(...ys);
                     const maxX = Math.max(...xs);
                     const maxY = Math.max(...ys);
                     const bboxW = maxX - minX;
                     const bboxH = maxY - minY;
                     
                     // 2) 임시 캔버스 생성 (바운딩 박스 크기)
                     const extractCanvas = document.createElement('canvas');
                     const extractCtx = extractCanvas.getContext('2d');
                     extractCanvas.width = bboxW;
                     extractCanvas.height = bboxH;
                     
                     // 3) 다각형 패스를 임시 캔버스 좌표계로 변환하여 클리핑
                     extractCtx.beginPath();
                     extractCtx.moveTo(bboxData[0][0] - minX, bboxData[0][1] - minY);
                     for (let i = 1; i < bboxData.length; i++) {
                       extractCtx.lineTo(bboxData[i][0] - minX, bboxData[i][1] - minY);
                     }
                     extractCtx.closePath();
                     extractCtx.clip();
                     
                     // 4) 클리핑된 영역에 원본 이미지 그리기
                     extractCtx.drawImage(tmp, minX, minY, bboxW, bboxH, 0, 0, bboxW, bboxH);
                     
                     // 5) 효과 적용된 캔버스 생성
                     const effectCanvas = document.createElement('canvas');
                     const effectCtx = effectCanvas.getContext('2d');
                     effectCanvas.width = bboxW;
                     effectCanvas.height = bboxH;
                     
                     if (type === 'mosaic') {
                       // 모자이크 효과
                       const tileW = Math.max(1, Math.floor(bboxW / (lvl + 4)));
                       const tileH = Math.max(1, Math.floor(bboxH / (lvl + 4)));
                       
                       effectCtx.drawImage(extractCanvas, 0, 0, bboxW, bboxH, 0, 0, tileW, tileH);
                       effectCtx.drawImage(effectCtx.canvas, 0, 0, tileW, tileH, 0, 0, bboxW, bboxH);
                       effectCtx.imageSmoothingEnabled = false;
                     } else {
                       // 블러 효과
                       effectCtx.filter = `blur(${lvl + 4}px)`;
                       effectCtx.drawImage(extractCanvas, 0, 0);
                       effectCtx.filter = 'none';
                     }
                     
                     // 6) 메인 캔버스에 클리핑해서 그리기
                     ctx.save();
                     ctx.beginPath();
                     const firstPoint = toCanvas(bboxData[0][0], bboxData[0][1]);
                     ctx.moveTo(firstPoint.x, firstPoint.y);
                     
                     for (let i = 1; i < bboxData.length; i++) {
                       const point = toCanvas(bboxData[i][0], bboxData[i][1]);
                       ctx.lineTo(point.x, point.y);
                     }
                     
                     ctx.closePath();
                     ctx.clip();
                     
                     // 7) 효과 적용된 이미지를 메인 캔버스에 그리기
                     const canvasPos = toCanvas(minX, minY);
                     ctx.drawImage(effectCanvas, 
                       0, 0, bboxW, bboxH,
                       canvasPos.x, canvasPos.y, bboxW * scale, bboxH * scale
                     );
                     
                     ctx.restore();
                   }
                 } catch (error) {
                   console.error("selected 케이스 bbox 파싱 에러:", error, log.bbox);
                 }
               });
               break;
             case 'bg':
               // 배경만 마스킹
               // 1) 전체 프레임 마스킹
               applyEffect(0, 0, origW, origH, offsetX, offsetY, origW * scale, origH * scale);
               // 2) 박스 영역만 원본으로 복원
               logs
               .filter(log => String(log.object) === '1')
               .forEach(log => {
                 try {
                   const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
                   
                   // 사각형 형식 [x0, y0, x1, y1] 처리
                   if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
                     const [x0, y0, x1, y1] = bboxData;
                     const sw = x1 - x0, sh = y1 - y0;
                     const p0 = toCanvas(x0, y0);
                     ctx.drawImage(tmp, x0, y0, sw, sh, p0.x, p0.y, sw * scale, sh * scale);
                   }
                   // 다각형 형식 [[x1,y1], [x2,y2], ...] 처리
                   else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
                     // 다각형 클리핑으로 정확한 영역만 복원
                     ctx.save();
                     
                     // 클리핑 패스 생성 (캔버스 좌표계)
                     ctx.beginPath();
                     const firstPoint = toCanvas(bboxData[0][0], bboxData[0][1]);
                     ctx.moveTo(firstPoint.x, firstPoint.y);
                     
                     for (let i = 1; i < bboxData.length; i++) {
                       const point = toCanvas(bboxData[i][0], bboxData[i][1]);
                       ctx.lineTo(point.x, point.y);
                     }
                     
                     ctx.closePath();
                     ctx.clip(); // 클리핑 영역 설정
                     
                     // 클리핑된 영역에만 원본 이미지 그리기
                     ctx.drawImage(tmp, 
                       0, 0, origW, origH,  // 원본 전체
                       offsetX, offsetY, origW * scale, origH * scale  // 캔버스 전체
                     );
                     
                     ctx.restore(); // 클리핑 해제
                   }
                 } catch (error) {
                   console.error("bg 케이스 bbox 파싱 에러:", error, log.bbox);
                 }
               });
               break;
 
             case 'unselected':
               // object === '2'인 항목만
               logs
                 .filter(log => String(log.object) === '2')
                 .forEach(log => {
                   try {
                     const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
                     
                     // 사각형 형식 [x0, y0, x1, y1] 처리
                     if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
                       const [x0, y0, x1, y1] = bboxData;
                       const sw = x1 - x0, sh = y1 - y0;
                       const p0 = toCanvas(x0, y0);
                       const dw = sw * scale, dh = sh * scale;
                       ctx.strokeStyle = 'blue';
                       ctx.lineWidth = 2;
                       applyEffect(x0, y0, sw, sh, p0.x, p0.y, dw, dh);
                     }
                     // 다각형 형식 [[x1,y1], [x2,y2], ...] 처리
                     else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
                       // 1) 다각형 바운딩 박스 계산
                       const xs = bboxData.map(point => point[0]);
                       const ys = bboxData.map(point => point[1]);
                       const minX = Math.min(...xs);
                       const minY = Math.min(...ys);
                       const maxX = Math.max(...xs);
                       const maxY = Math.max(...ys);
                       const bboxW = maxX - minX;
                       const bboxH = maxY - minY;
                       
                       // 2) 임시 캔버스 생성 (바운딩 박스 크기)
                       const extractCanvas = document.createElement('canvas');
                       const extractCtx = extractCanvas.getContext('2d');
                       extractCanvas.width = bboxW;
                       extractCanvas.height = bboxH;
                       
                       // 3) 다각형 패스를 임시 캔버스 좌표계로 변환하여 클리핑
                       extractCtx.beginPath();
                       extractCtx.moveTo(bboxData[0][0] - minX, bboxData[0][1] - minY);
                       for (let i = 1; i < bboxData.length; i++) {
                         extractCtx.lineTo(bboxData[i][0] - minX, bboxData[i][1] - minY);
                       }
                       extractCtx.closePath();
                       extractCtx.clip();
                       
                       // 4) 클리핑된 영역에 원본 이미지 그리기
                       extractCtx.drawImage(tmp, minX, minY, bboxW, bboxH, 0, 0, bboxW, bboxH);
                       
                       // 5) 효과 적용된 캔버스 생성
                       const effectCanvas = document.createElement('canvas');
                       const effectCtx = effectCanvas.getContext('2d');
                       effectCanvas.width = bboxW;
                       effectCanvas.height = bboxH;
                       
                       // 클리핑된 다각형 영역에만 마스킹 효과 적용
                       if (type === 'mosaic') {
                         // 모자이크 처리
                         const tileW = Math.max(1, Math.floor((origW * scale) / (lvl + 4)));
                         const tileH = Math.max(1, Math.floor((origH * scale) / (lvl + 4)));
                         
                         effectCtx.drawImage(extractCanvas, 0, 0, bboxW, bboxH, 0, 0, tileW, tileH);
                         effectCtx.drawImage(effectCtx.canvas, 0, 0, tileW, tileH, 0, 0, bboxW, bboxH);
                         effectCtx.imageSmoothingEnabled = false;
                       } else {
                         // 블러 처리
                         effectCtx.filter = `blur(${lvl + 4}px)`;
                         effectCtx.drawImage(extractCanvas, 0, 0);
                         effectCtx.filter = 'none';
                       }
                       // 6) 메인 캔버스에 클리핑해서 그리기
                       ctx.save();
                       ctx.beginPath();
                       const firstPoint = toCanvas(bboxData[0][0], bboxData[0][1]);
                       ctx.moveTo(firstPoint.x, firstPoint.y);
                       
                       for (let i = 1; i < bboxData.length; i++) {
                         const point = toCanvas(bboxData[i][0], bboxData[i][1]);
                         ctx.lineTo(point.x, point.y);
                       }
                       
                       ctx.closePath();
                       ctx.clip();
                       
                       // 7) 효과 적용된 이미지를 메인 캔버스에 그리기
                       const canvasPos = toCanvas(minX, minY);
                       ctx.drawImage(effectCanvas, 
                         0, 0, bboxW, bboxH,
                         canvasPos.x, canvasPos.y, bboxW * scale, bboxH * scale
                       );
                       
                       ctx.restore(); // 클리핑 해제
                       
                     }
                   } catch (error) {
                     console.error("unselected 케이스 bbox 파싱 에러:", error, log.bbox);
                   }
                 });
               break;
           }
         }else{
           logs.forEach(log => {
                 try {
                   const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
                   
                   // 사각형 형식 [x0, y0, x1, y1]
                   if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
                     const [x0, y0, x1, y1] = bboxData;
                     const p0 = toCanvas(x0, y0);
                     const p1 = toCanvas(x1, y1);
                     const isHovered = this.hoveredBoxId === log.track_id;
                     ctx.strokeStyle = isHovered ? 'orange' : (log.object === 1 ? 'red' : 'blue');
                     ctx.fillStyle = isHovered ? 'orange' : (log.object === 1 ? 'red' : 'blue');
                     ctx.lineWidth = 2;
                     
                     // 호버 시 낮에 불투명하게 채우기
                     if (isHovered) {
                       ctx.save();
                       ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';  // 주황색 불투명
                       ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
                       ctx.restore();
                     }
                     
                     ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
                     ctx.fillText(`ID: ${log.track_id}`, p0.x, p0.y - 5);
                   } 
                   // 다각형 형식 [[x1,y1], [x2,y2], ...]
                   else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
                     ctx.beginPath();
                     const firstPoint = toCanvas(bboxData[0][0], bboxData[0][1]);
                     ctx.moveTo(firstPoint.x, firstPoint.y);
                     
                     for (let i = 1; i < bboxData.length; i++) {
                       const point = toCanvas(bboxData[i][0], bboxData[i][1]);
                       ctx.lineTo(point.x, point.y);
                     }
                     
                     ctx.closePath();
                     const isHovered = this.hoveredBoxId === log.track_id;
                     ctx.strokeStyle = isHovered ? 'orange' : (log.object === 1 ? 'red' : 'blue');
                     ctx.fillStyle = isHovered ? 'orange' : (log.object === 1 ? 'red' : 'blue');
                     ctx.lineWidth = 2;
                     
                     // 호버 시 낮에 불투명하게 채우기
                     if (isHovered) {
                       ctx.save();
                       ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';  // 주황색 불투명
                       ctx.fill();
                       ctx.restore();
                     }
                     
                     ctx.stroke();
                     
                     // ID 표시
                     ctx.fillText(`ID: ${log.track_id}`, firstPoint.x, firstPoint.y - 5);
                   }
                 } catch (error) {
                   console.error("마스킹 데이터 파싱 에러:", error, log.bbox);
                 }
               });
         }
     },
     drawDetectionBoxes(ctx, video) {
       const originalWidth = video.videoWidth;
       const originalHeight = video.videoHeight;
       if (!originalWidth || !originalHeight) return;
       const containerWidth = video.clientWidth;
       const containerHeight = video.clientHeight;
       const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
       const offsetX = (containerWidth - originalWidth * scale) / 2;
       const offsetY = (containerHeight - originalHeight * scale) / 2;
       ctx.font = '14px Arial';
       ctx.fillStyle = 'red';
       ctx.strokeStyle = 'red';
       ctx.lineWidth = 2;
       const currentFrame = Math.floor(video.currentTime * this.frameRate);
       const currentFrameBoxes = this.detectionResults.filter(item => item.frame === currentFrame);
       currentFrameBoxes.forEach(result => {
         if (result.bbox) {
           const coords = result.bbox.split(',').map(Number);
           if (coords.length === 4 && coords.every(num => !isNaN(num))) {
             let [x, y, w, h] = coords;
             x = x * scale + offsetX;
             y = y * scale + offsetY;
             w = w * scale;
             h = h * scale;
             
             // 호버 상태에 따라 색상 변경
             const isHovered = this.hoveredBoxId === result.track_id;
             ctx.strokeStyle = isHovered ? 'orange' : 'red';
             ctx.fillStyle = isHovered ? 'orange' : 'red';
             
             // 호버 시 낮에 불투명하게 채우기
             if (isHovered) {
               ctx.save();
               ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';  // 주황색 불투명
               ctx.fillRect(x, y, w, h);
               ctx.restore();
             }
             
             ctx.strokeRect(x, y, w, h);
             ctx.fillText(`ID: ${result.track_id}`, x, y - 5);
           }
         }
       });
     },
     drawPolygon() {
       const canvas = this.$refs.maskingCanvas;
       const video = this.$refs.videoPlayer;
       if (!canvas || !video) return;
       const ctx = canvas.getContext('2d');
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       this.drawDetectionBoxes(ctx, video);
   
       const currentFrame = Math.floor(video.currentTime * this.frameRate);
       if (this.maskFrameStart !== null && this.maskFrameEnd !== null &&
           (currentFrame < this.maskFrameStart || currentFrame > this.maskFrameEnd)) {
         return;
       }
   
       if (this.maskingPoints.length === 0) return;
       const complete = this.isPolygonClosed;
   
       ctx.beginPath();
       const first = this.convertToCanvasCoordinates(this.maskingPoints[0]);
       ctx.moveTo(first.x, first.y);
   
       for (let i = 1; i < this.maskingPoints.length; i++) {
         const pt = this.convertToCanvasCoordinates(this.maskingPoints[i]);
         ctx.lineTo(pt.x, pt.y);
       }
   
       if (complete) {
         ctx.closePath();
         ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
         ctx.fill();
       }
   
       ctx.strokeStyle = 'red';
       ctx.lineWidth = 2;
       ctx.stroke();
   
       this.maskingPoints.forEach((point) => {
         const cp = this.convertToCanvasCoordinates(point);
         ctx.beginPath();
         ctx.arc(cp.x, cp.y, 5, 0, 2 * Math.PI);
         ctx.fillStyle = 'red';
         ctx.fill();
       });
     },
     drawRectangle() {
       const canvas = this.$refs.maskingCanvas;
       const video = this.$refs.videoPlayer;
       if (!canvas || !video) return;
       const ctx = canvas.getContext('2d');
       ctx.clearRect(0, 0, canvas.width, canvas.height);
       this.drawDetectionBoxes(ctx, video);
       
       const currentFrame = Math.floor(video.currentTime * this.frameRate);
       if (this.maskFrameStart !== null && this.maskFrameEnd !== null &&
           (currentFrame < this.maskFrameStart || currentFrame > this.maskFrameEnd)) {
         return;
       }
       
       if (this.maskingPoints.length === 2) {
         const p0 = this.convertToCanvasCoordinates(this.maskingPoints[0]);
         const p1 = this.convertToCanvasCoordinates(this.maskingPoints[1]);
         const rectX = Math.min(p0.x, p1.x);
         const rectY = Math.min(p0.y, p1.y);
         const rectW = Math.abs(p1.x - p0.x);
         const rectH = Math.abs(p1.y - p0.y);
   
         ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
         ctx.fillRect(rectX, rectY, rectW, rectH);
   
         ctx.strokeStyle = 'red';
         ctx.lineWidth = 2;
         ctx.strokeRect(rectX, rectY, rectW, rectH);
       }
     },
 
     // 좌표 변환
     convertToCanvasCoordinates(point) {
       const video = this.$refs.videoPlayer;
       const canvas = this.$refs.maskingCanvas;
       const originalWidth = video.videoWidth;
       const originalHeight = video.videoHeight;
       const containerWidth = video.clientWidth;
       const containerHeight = video.clientHeight;
       const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
       const offsetX = (containerWidth - originalWidth * scale) / 2;
       const offsetY = (containerHeight - originalHeight * scale) / 2;
       return {
         x: point.x * scale + offsetX,
         y: point.y * scale + offsetY
       };
     },
     convertToOriginalCoordinates(e) {
       const canvas = this.$refs.maskingCanvas;
       const video = this.$refs.videoPlayer;
       const rect = canvas.getBoundingClientRect();
       const clickX = e.clientX - rect.left;
       const clickY = e.clientY - rect.top;
       const originalWidth = video.videoWidth;
       const originalHeight = video.videoHeight;
       const containerWidth = video.clientWidth;
       const containerHeight = video.clientHeight;
       const scale = Math.min(containerWidth / originalWidth, containerHeight / originalHeight);
       const offsetX = (containerWidth - originalWidth * scale) / 2;
       const offsetY = (containerHeight - originalHeight * scale) / 2;
       const originalX = (clickX - offsetX) / scale;
       const originalY = (clickY - offsetY) / scale;
       return { x: Math.floor(originalX), y: Math.floor(originalY) };
     },
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
 
     // 마스킹 로그 관리
     logMasking() {
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

       const entries = this.newMaskings.map(entry => ({
         frame: entry.frame,
         track_id: entry.track_id,
         bbox: typeof entry.bbox === 'string' ? JSON.parse(entry.bbox) : entry.bbox,
         bbox_type: entry.bbox_type || 'rect',
         score: entry.score ?? null,
         class_id: entry.class_id ?? null,
         type: entry.type,
         object: entry.object ?? 1
       }));

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
 
         const vm = this;
 
         // 1초마다 polling 시작
         this.detectionIntervalId = setInterval(async () => {
           try {
             const progressRes = await apiPython.get(`${config.progress}/${jobId}`);
 
             if (!progressRes) {
               throw new Error(`진행 상황 요청 실패`);
             }
             const resultJson = progressRes.data;
 
             vm.progress = Math.floor(resultJson.progress);
 
             if (vm.$refs.progressBar) {
               vm.$refs.progressBar.style.width = vm.progress + '%';
             }
             if (vm.$refs.progressLabel) {
               vm.$refs.progressLabel.textContent = vm.progress + '%';
             }
 
             if (vm.progress >= 100 || resultJson.status === "completed") {
               clearInterval(vm.detectionIntervalId);
               vm.isDetecting = false;
 
               // ? 에러 응답 처리
               if (resultJson.error) {
                 console.error("? 서버에서 에러 응답:", resultJson.error);
                 window.electronAPI.showMessage("객체 탐지 중 오류 발생: " + resultJson.error); 
                 return;
               }
 
               vm.currentMode = '';
               vm.selectMode = true;
               vm.loadDetectionData();
             }
 
           } catch (err) {
             console.error("? 진행 상황 조회 오류:", err);
             clearInterval(vm.detectionIntervalId);
             vm.isDetecting = false;
             window.electronAPI.showMessage("객체 탐지 중 오류 발생: " + err.message); 
           }
         }, 1000);
 
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
           
           // 3. 폴링 로직 수정
           return new Promise((resolve, reject) => {
             const intervalId = setInterval(async () => {
               try {
                 const progressRes = await apiPython.get(`${config.progress}/${jobId}`);
                 
                 if (!progressRes) {
                   throw new Error(`진행 상황 요청 실패`);
                 }
                 
                 const resultJson = progressRes.data;
                 const progress = Math.floor(resultJson.progress);
                 
                 // 파일별 진행률 업데이트
                 this.fileProgressMap[file.name] = progress;
                 
                 if (progress >= 100 || resultJson.status === "completed") {                  
                   clearInterval(intervalId);
                   resolve();
                 }
               } catch (err) {
                 clearInterval(intervalId);
                 console.error(`${file.name} 진행 상황 조회 오류:`, err);
                 this.fileProgressMap[file.name] = -1; // 에러 상태 표시
                 reject(err);
               }
             }, 1000);
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
     checkBiggestTrackId(typeNum){
         // track_id 결정 로직 추가
         if (this.dataLoaded) {
           const manualEntries = this.maskingLogs.filter(log => log.type === typeNum);
           if (manualEntries.length > 0) {
             const trackNumbers = manualEntries.map(entry => {
               if (typeof entry.track_id === 'string' && entry.track_id.startsWith(typeNum + '_')) {
                 return parseInt(entry.track_id.split('_')[1]);
               }
               return 0;
             });
             
             const nextTrackNumber = Math.max(...trackNumbers) + 1;
             if(typeNum === 3){
               this.manualBiggestTrackId = `3_${nextTrackNumber}`;
             }
             else{
               this.maskBiggestTrackId = `4_${nextTrackNumber}`;
             }
           } else {
             if(typeNum === 3){
               this.manualBiggestTrackId = `${typeNum}_1`;
             }
             else{
               this.maskBiggestTrackId = `${typeNum}_1`;
             }
           }
         } else {
           if(typeNum === 3){
             this.manualBiggestTrackId = `${typeNum}_1`;
           }
           else{
             this.maskBiggestTrackId = `${typeNum}_1`;
           }
         }
     },
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
          this.video.src = file.url;
          this.video.load();
          
          this.updateVideoInfoFromElectron(file);
          
          this.video.play();
          this.videoPlaying = true;
        } else { //  비MP4 또는 HEVC → 변환 후 재생
          // 다른 형식은 변환 후 재생
          const cacheKey = `${file.name}_${file.size}`;
          
          if (this.conversionCache[cacheKey]) {
            // 이미 변환된 파일이 캐시에 있으면 바로 재생
            this.video.src = this.conversionCache[cacheKey];
            this.video.load();
            
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
       if (this.video) {
         this.video.src = '';
       }
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
      try {
        this.conversion.inProgress = true;
        this.conversion.progress = 0;
        this.conversion.currentFile = file.name;
        
        // 진행률 이벤트 리스너 등록
        const progressHandler = (event, data) => {
          this.conversion.progress = data.progress;
        };
        
        window.electronAPI.onConversionProgress(progressHandler);
        
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
        
        // 진행률 이벤트 리스너 제거
        window.electronAPI.removeConversionProgressListener(progressHandler);
        
        // 변환된 파일을 Blob으로 읽어오기
        const convertedBuffer = await window.electronAPI.getTempFileAsBlob(tempOutputPath);
        const convertedBlob = new Blob([convertedBuffer], { type: 'video/mp4' });
        const convertedUrl = URL.createObjectURL(convertedBlob);
        
        // 캐시에 저장
        this.conversionCache[cacheKey] = convertedUrl;
        
        // 변환된 비디오 재생
        this.video.src = convertedUrl;
        this.video.load();
        
        this.updateVideoInfoFromElectron(file);
        
        this.video.play();
        this.videoPlaying = true;
        
        this.conversion.inProgress = false;
        
        // 임시 파일 정리
        await window.electronAPI.deleteTempFile(tempOutputPath);
        
      } catch (error) {
        console.error('변환 중 오류 발생:', error);
        window.electronAPI.showMessage('파일 변환 중 오류가 발생했습니다: ' + error.message); 
        this.conversion.inProgress = false;
        this.conversion.progress = 0;
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
     // 워터마크 그리기
     drawWatermarkPreview(ctx, canvas) {
      if (!this.allConfig) return;
      const video = this.$refs.videoPlayer;
      if (!video) return;

      const text = (this.allConfig.export?.watertext || '').trim();
      const hasText = this.isWaterMarking && text.length > 0;
      const hasImage =
        this.isWaterMarking &&
        this.watermarkImage &&
        this.watermarkImageLoaded &&
        this.cachedWatermarkImage;

      if (!hasText && !hasImage) return;

      const originalW = video.videoWidth;
      const originalH = video.videoHeight;
      if (!originalW || !originalH) return;

      const displayScale = this.getScale();
      const naturalLogoW = hasImage ? this.cachedWatermarkImage.naturalWidth || 0 : 0;
      const naturalLogoH = hasImage ? this.cachedWatermarkImage.naturalHeight || 0 : 0;

      let logoWidth = 0;
      let logoHeight = 0;
      if (hasImage && naturalLogoW > 0 && naturalLogoH > 0) {
        logoWidth = Math.max(1, Math.round(originalW / 10));
        const resizeFactor = logoWidth / naturalLogoW;
        logoHeight = Math.max(1, Math.round(naturalLogoH * resizeFactor));
      }

      // 텍스트만 있을 때를 위해 텍스트 크기 미리 측정
      let textWidth = 0;
      let textHeight = 0;
      if (hasText && !hasImage) {
        const fontSize = Math.max(12, Math.round(18 * displayScale));
        ctx.font = `${fontSize}px sans-serif`;
        const metrics = ctx.measureText(text);
        textWidth = metrics.width / displayScale; // 원본 비디오 크기 기준으로 변환
        textHeight = fontSize / displayScale;
      }

      const margin = 50;
      const location = Number(this.allConfig.export?.waterlocation) || 4;

        // 텍스트만 있을 때는 textWidth, textHeight 사용
      const itemWidth = hasImage ? logoWidth : textWidth;
      const itemHeight = hasImage ? logoHeight : textHeight;

      const positions = {
        1: { x: margin, y: margin },
        2: { x: originalW - itemWidth - margin, y: margin },
        3: {
          x: Math.floor((originalW - itemWidth) / 2),
          y: Math.floor((originalH - itemHeight) / 2)
        },
        4: { x: margin, y: originalH - itemHeight - margin },
        5: { x: originalW - itemWidth - margin, y: originalH - itemHeight - margin }
      };
      const pos = positions[location] || positions[4];
      const xOffset = pos.x;
      const yOffset = pos.y;

      if (hasImage && logoWidth > 0 && logoHeight > 0) {
        const opacity = Number(this.allConfig.export?.watertransparency);
        const normalizedOpacity = Number.isFinite(opacity)
          ? Math.max(0, Math.min(1, opacity / 100))
          : 0;

        const imgCanvasPos = this.convertToCanvasCoordinates({ x: xOffset, y: yOffset });
        const drawW = logoWidth * displayScale;
        const drawH = logoHeight * displayScale;

        ctx.save();
        ctx.globalAlpha = normalizedOpacity;
        ctx.drawImage(this.cachedWatermarkImage, imgCanvasPos.x, imgCanvasPos.y, drawW, drawH);
        ctx.restore();
      }

      if (hasText) {
        const fontSize = Math.max(12, Math.round(18 * displayScale));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(1, Math.round(fontSize / 6));

        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        let textCanvasX;
        let textCanvasY;

        if (hasImage && logoWidth > 0 && logoHeight > 0) {
          const imgCanvasPos = this.convertToCanvasCoordinates({ x: xOffset, y: yOffset });
          const drawW = logoWidth * displayScale;
          const drawH = logoHeight * displayScale;
          const marginCanvas = Math.max(2, Math.round(5 * displayScale));

          textCanvasX = imgCanvasPos.x + (drawW - textWidth) / 2;
          textCanvasY = imgCanvasPos.y + drawH + textHeight + marginCanvas;
        } else {
          const baseCanvasPos = this.convertToCanvasCoordinates({ x: xOffset, y: yOffset });
          textCanvasX = baseCanvasPos.x;
          textCanvasY = baseCanvasPos.y + textHeight;
        }

        ctx.strokeText(text, textCanvasX, textCanvasY);
        ctx.fillText(text, textCanvasX, textCanvasY);
      }
    },
     getWatermarkCoords(position, canvasW, canvasH, itemW, itemH) {
       switch (position) {
         case 'top-left': return { x: 10, y: 10 };
         case 'top-right': return { x: canvasW - itemW - 10, y: 10 };
         case 'bottom-left': return { x: 10, y: canvasH - itemH - 10 };
           case 'bottom-right': return { x: canvasW - itemW - 20, y: canvasH - itemH - 20 };
         case 'center':
         default:
           return {
             x: (canvasW - itemW) / 2,
             y: (canvasH - itemH) / 2
           };
       }
     },
     getScale() {
       const video = this.$refs.videoPlayer;
       const originalW = video.videoWidth;
       const originalH = video.videoHeight;
       const containerW = video.clientWidth;
       const containerH = video.clientHeight;
       return Math.min(containerW / originalW, containerH / originalH);
     },
 
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
        this.drawBoundingBoxes();
        
        window.electronAPI.showMessage('워터마크 이미지가 삭제되었습니다.');
      } catch (error) {
        console.error('워터마크 이미지 삭제 실패:', error);
        window.electronAPI.showMessage('워터마크 이미지 삭제에 실패했습니다: ' + error.message);
      }
    },
    
     applyWatermark() {
       this.drawBoundingBoxes(); // 즉시 반영
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
     findTrackIdAtPosition(clickPoint) {
       if (!this.maskingLogs || !this.maskingLogs.length) return null;
       
       const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
       
       // 현재 프레임에 해당하는 마스킹 로그 (O(1) 조회)
       const logsInCurrentFrame = this.maskingLogsMap[currentFrame] || [];
       
       // 클릭한 위치에 있는 모든 객체를 찾아 면적 기준으로 정렬
       const candidates = [];
       
       for (const log of logsInCurrentFrame) {
         try {
           const bboxData = typeof log.bbox === 'string' ? JSON.parse(log.bbox) : log.bbox;
           
           // 사각형 형식 [x0, y0, x1, y1] 처리
           if (Array.isArray(bboxData) && bboxData.length === 4 && !Array.isArray(bboxData[0])) {
             const [x0, y0, x1, y1] = bboxData;
             if (
               clickPoint.x >= x0 && clickPoint.x <= x1 && 
               clickPoint.y >= y0 && clickPoint.y <= y1
             ) {
               const area = (x1 - x0) * (y1 - y0);
               candidates.push({ track_id: log.track_id, area });
             }
           } 
           // 다각형 형식 [[x1,y1], [x2,y2], ...] 처리
           else if (Array.isArray(bboxData) && bboxData.length >= 3 && Array.isArray(bboxData[0])) {
             const points = bboxData.map(point => ({ x: point[0], y: point[1] }));
             if (this.isPointInPolygon(clickPoint, points)) {
               // 다각형의 bounding box 면적 계산
               const xs = points.map(p => p.x);
               const ys = points.map(p => p.y);
               const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
               candidates.push({ track_id: log.track_id, area });
             }
           }
         } catch (error) {
           console.error("객체 검색 중 오류:", error);
         }
       }
       
       // 면적이 작은 순으로 정렬하여 가장 작은 객체 반환
       if (candidates.length > 0) {
         candidates.sort((a, b) => a.area - b.area);
         return candidates[0].track_id;
       }
       
       return null; // 해당 위치에 객체가 없음
     },
 
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
        this.drawBoundingBoxes();
        
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
             this.drawBoundingBoxes();
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
             this.drawBoundingBoxes();
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
     // 전체 마스킹 프리뷰
     startMaskPreview() {
         if (this.isMasking) return;
         if (!this.dataLoaded) return;
         this.isMasking = true;
 
         const v = this.video;
         const mc = this.maskCtx;
         const tc = this.tmpCtx;
 
         // 마스크 캔버스 표시
         if (this.maskCanvas) {
             this.maskCanvas.style.display = 'block';
         }
 
         // 원본 비디오 해상도
         const origW = v.videoWidth;
         const origH = v.videoHeight;
 
         // 마스크 캔버스와 임시 캔버스를 원본 해상도로 설정
         this.maskCanvas.width = origW;
         this.maskCanvas.height = origH;
         this.tmpCanvas.width = origW;
         this.tmpCanvas.height = origH;
 
         const lvl = Number(this.allConfig.export.maskingstrength);
 
         // 비디오 컨테이너의 크기
         const containerW = v.clientWidth;
         const containerH = v.clientHeight;
 
         // 종횡비를 유지하면서 크기 계산
         const scale = Math.min(containerW / origW, containerH / origH);
         const displayW = origW * scale;
         const displayH = origH * scale;
 
         // 중앙 정렬을 위한 오프셋 계산
         const offsetX = (containerW - displayW) / 2;
         const offsetY = (containerH - displayH) / 2;
 
         // 마스크 캔버스 스타일 설정
         Object.assign(this.maskCanvas.style, {
             position: 'absolute',
             top: `${v.offsetTop + offsetY}px`,
             left: `${v.offsetLeft + offsetX}px`,
             width: `${displayW}px`,
             height: `${displayH}px`,
             pointerEvents: 'none',
             zIndex: 5,
             objectFit: 'contain'  // 종횡비 유지
         });
 
         const loop = () => {
             if (!this.isMasking) {
                 // 마스킹이 중지되면 애니메이션 프레임 취소
                 if (this.maskPreviewAnimationFrame) {
                     cancelAnimationFrame(this.maskPreviewAnimationFrame);
                     this.maskPreviewAnimationFrame = null;
                 }
                 return;  
             }
 
             // 1) 원본 프레임을 임시 캔버스에 그리기
             tc.clearRect(0, 0, origW, origH);
             tc.drawImage(v, 0, 0, origW, origH);
 
             // 2) 마스크 캔버스 초기화
             mc.clearRect(0, 0, origW, origH);
 
               //0: 모자이크, 1: 블러
               if (this.allConfig.export.maskingtool === '0') {
                 // 모자이크: 축소 → 확대
                 const w = Math.max(1, Math.floor(origW / (lvl + 4)));
                 const h = Math.max(1, Math.floor(origH / (lvl + 4)));
                 mc.drawImage(tc.canvas, 0, 0, origW, origH, 0, 0, w, h);
                 mc.drawImage(mc.canvas, 0, 0, w, h, 0, 0, origW, origH);
                 mc.imageSmoothingEnabled = false;
             } else {
                 // 블러: canvas 필터
                 mc.filter = `blur(${lvl + 4}px)`;
                 mc.drawImage(tc.canvas, 0, 0, origW, origH);
                 mc.filter = 'none';
             }
 
             // 다음 프레임 요청 및 참조 저장
             this.maskPreviewAnimationFrame = requestAnimationFrame(loop);
         };
 
         // 초기 프레임 요청 및 참조 저장
         this.maskPreviewAnimationFrame = requestAnimationFrame(loop);
 
         // 비디오가 일시정지 상태라면 재생
         if (v.paused) {
             v.play();
             this.videoPlaying = true;
         }
     },
     stopMaskPreview() {
       this.isMasking = false;
       
       // 마스크 캔버스 초기화
       if (this.maskCanvas) {
         const mc = this.maskCtx;
         mc.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
         
         // 마스크 캔버스를 숨김
         this.maskCanvas.style.display = 'none';
       }
 
       // 임시 캔버스 초기화
       if (this.tmpCanvas) {
         const tc = this.tmpCtx;
         tc.clearRect(0, 0, this.tmpCanvas.width, this.tmpCanvas.height);
       }
 
       // 비디오 상태 복원
       if (this.video) {
         // 비디오가 일시정지 상태가 아니라면 일시정지
         if (!this.video.paused) {
           this.video.pause();
           this.videoPlaying = false;
         }
         
         // 비디오 스타일 초기화
         this.video.style.filter = 'none';
       }
 
       // 애니메이션 프레임 취소 (있다면)
       if (this.maskPreviewAnimationFrame) {
         cancelAnimationFrame(this.maskPreviewAnimationFrame);
         this.maskPreviewAnimationFrame = null;
       }
     },
     applyEffectFull(ctx, ow, oh) {
           const lvl  = this.allConfig.export.maskingstrength;   // 마스킹 강도
           const type = this.allConfig.export.maskingtool === '0' ? 'mosaic' : 'blur';    // 'mosaic' 또는 'blur'
         const src  = this.tmpCanvas;
 
         // 모자이크 처리
         const mosaic = (dx,dy,dw,dh) => {
           const tw = Math.max(1, Math.floor(dw/(lvl + 4)));
           const th = Math.max(1, Math.floor(dh/(lvl + 4)));
           ctx.imageSmoothingEnabled = false;
           ctx.drawImage(src, 0,0,ow,oh, dx,dy,tw,th);
           ctx.drawImage(ctx.canvas, dx,dy,tw,th, dx,dy,dw,dh);
         };
         // 블러 처리
         const blur = (dx,dy,dw,dh) => {
           ctx.save();
           ctx.filter = `blur(${lvl + 4}px)`;
           ctx.drawImage(src, 0,0,ow,oh, dx,dy,dw,dh);
           ctx.restore();
         };
 
         // 전체 적용
         if (type === 'mosaic') mosaic(0, 0, ow, oh);
         else                    blur(  0, 0, ow, oh);
     },
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
       if (this.exportProgressTimer) {
         clearInterval(this.exportProgressTimer);
         this.exportProgressTimer = null;
       }

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

         // 4-2) 진행률 폴링
         const vm = this;
         this.exportProgressTimer = setInterval(async () => {
           try {
             const progRes = await apiPython.get(`${config.progress}/${jobId}`);
             if (!progRes) throw new Error("진행상황 요청 실패");
             const data = progRes.data || {};

             vm.exportProgress = Math.floor(data.progress || 0);
             vm.exportMessage = `내보내는 중... ${vm.exportProgress}%`;

             if (vm.$refs.progressBar2)   vm.$refs.progressBar2.style.width = vm.exportProgress + '%';
             if (vm.$refs.progressLabel2) vm.$refs.progressLabel2.textContent = vm.exportProgress + '%';

             if (data.error) {
               console.error("서버 에러:", data.error);
               clearInterval(vm.exportProgressTimer);
               vm.exportProgressTimer = null;
               vm.currentMode = '';
               vm.selectMode = true;
               vm.exporting = false;
               vm.exportProgress = 0;
               window.electronAPI.showMessage("내보내기 중 오류 발생: " + data.error);
               return;
             }

             // 완료 조건 버그 수정: vm.progress → vm.exportProgress
             if (vm.exportProgress >= 100 || data.status === "completed") {
               clearInterval(vm.exportProgressTimer);
               vm.exportProgressTimer = null;
               vm.exportMessage = "내보내기 완료!";
               
               // JSON 파일 함께 복사
               vm.copyJsonWithExport(vm.files[vm.selectedFileIndex].name, vm.selectedExportDir);
               vm.currentMode = '';
               vm.selectMode = true;
               vm.exporting = false;
               vm.exportProgress = 0;
             }
           } catch (err) {
             if (vm.exportProgressTimer) {
               clearInterval(vm.exportProgressTimer);
               vm.exportProgressTimer = null;
             }
             vm.exporting = false;
             window.electronAPI.showMessage("폴링 중 오류: " + err.message);
           }
         }, 1000);
 
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

             this.exportProgressTimer = setInterval(async () => {
               try {
                 const progRes = await apiPython.get(`${config.progress}/${jobId}`);
                 if (!progRes) throw new Error("진행상황 요청 실패");
                 const data = progRes.data || {};
 
                 this.exportProgress = Math.floor(data.progress || 0);
                 this.exportMessage = `내보내는 중... ${this.exportProgress}%`;

                 if (this.$refs.progressBar2)   this.$refs.progressBar2.style.width = this.exportProgress + '%';
                 if (this.$refs.progressLabel2) this.$refs.progressLabel2.textContent = this.exportProgress + '%';

                 if (data.error) {
                   console.error("서버 에러:", data.error);
                   clearInterval(this.exportProgressTimer);
                   this.exportProgressTimer = null;
                   this.currentMode = '';
                   this.selectMode = true;
                   this.exporting = false;
                   this.exportProgress = 0;
                   window.electronAPI.showMessage("내보내기 중 오류 발생: " + data.error);
                   return;
                 }

                 // 완료 조건 체크
                 if (this.exportProgress >= 100 || data.status === 'completed') {
                   clearInterval(this.exportProgressTimer);
                   this.exportProgressTimer = null;
                   this.exportMessage = "내보내기 완료!";

                   // JSON 파일 함께 복사
                   this.copyJsonWithExport(this.files[this.selectedFileIndex].name, this.selectedExportDir);

                   this.currentMode = '';
                   this.exportFilePassword = '';
                   this.selectMode = true;
                   this.exporting = false;
                   this.exportProgress = 0;
                   }
               } catch (err) {
                 if (this.exportProgressTimer) {
                   clearInterval(this.exportProgressTimer);
                   this.exportProgressTimer = null;
                 }
                 this.exporting = false;
                 window.electronAPI.showMessage("폴링 중 오류: " + err.message);
               }
             }, 1000);
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
     // 프레임 범위 설정
     getCurrentFrameNormalized() {
      const video = this.$refs.videoPlayer;
      if (!video || !video.duration) return 0;

      const totalFrames = this.files[this.selectedFileIndex]?.totalFrames;
      
      if (totalFrames && typeof totalFrames === 'number') {
        const timeRatio = video.currentTime / video.duration;
        const frame = Math.floor(timeRatio * totalFrames);
        return Math.max(0, Math.min(frame, totalFrames - 1));
      } else {
        return this.frameRate ? Math.floor(video.currentTime * this.frameRate) : 0;
      }
    },

     confirmMaskFrameRange() {
           if (this.frameMaskStartInput === '' || this.frameMaskEndInput === '') {
             window.electronAPI.showMessage("시작 프레임과 끝 프레임을 모두 입력해주세요."); 
             return;
           }
           if (this.frameMaskStartInput < 0) {
             window.electronAPI.showMessage("시작 프레임은 0 이상이어야 합니다."); 
             return;
           }
             if (this.frameMaskEndInput > this.fileInfoItems[5].value) {
               window.electronAPI.showMessage(`끝 프레임은 최대 ${this.fileInfoItems[5].value} 프레임까지 입력 가능합니다.`); 
             return;
           }
           if (this.frameMaskStartInput > this.frameMaskEndInput) {
             window.electronAPI.showMessage("시작 프레임은 끝 프레임보다 작아야 합니다."); 
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
     isPointInPolygon(point, polygonPoints) {
       let inside = false;
       for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
         const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
         const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
         const intersect = ((yi > point.y) !== (yj > point.y)) &&
           (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 0.00001) + xi);
         if (intersect) inside = !inside;
       }
       return inside;
     },
     getBBoxString(box) {
       const x1 = Math.round(box.x);
       const y1 = Math.round(box.y);
       const x2 = Math.round(box.x + box.w);
       const y2 = Math.round(box.y + box.h);
       return `[${x1}, ${y1}, ${x2}, ${y2}]`;
     },
 
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
         this.drawBoundingBoxes();
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
      this.batchIntervalId = setInterval(async () => {
        try {
          const progRes = await apiPython.get(`${config.progress}/${this.batchJobId}`);
          
          if (!progRes) {
            this.stopBatchPolling();
            window.electronAPI.showMessage('진행상황을 가져올 수 없습니다.');
            return;
          }

          const progJson = progRes.data;
          
          // 상태 업데이트
          this.currentFileIndex = progJson.current || 0;
          this.totalFiles = progJson.total || this.files.length;
          this.currentFileName = progJson.current_video || '';
          this.phase = progJson.phase || '';
          this.currentFileProgress = progJson.progress || 0;

          // 에러 처리
          if (progJson.error) {
            this.stopBatchPolling();
            window.electronAPI.showMessage('일괄처리 오류: ' + progJson.error);
            return;
          }

          // 완료 처리
          if (progJson.status === 'completed' || 
              (progJson.current === progJson.total && progJson.progress >= 100)) {
            this.stopBatchPolling();
            this.phase = 'complete';
            window.electronAPI.showMessage('일괄처리가 완료되었습니다.');
            this.loadDetectionData();
            
            // 잠시 후 모달 닫기
            setTimeout(() => {
              this.resetBatchState();
            }, 1500);
          }

        } catch (err) {
          console.error('일괄처리 폴링 오류:', err);
          this.stopBatchPolling();
          window.electronAPI.showMessage('일괄처리 중 오류 발생: ' + err.message);
        }
      }, 1000);
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
 
     // 애니메이션
     startAnimationLoop() {
      const loop = () => {
        const currentFrame = Math.floor(this.video.currentTime * this.frameRate);
               this.currentFrame = currentFrame;
 
         if (this.video && this.video.duration) {
           this.progress = (this.video.currentTime / this.video.duration) * 100;
           this.currentTime = this.formatTime(this.video.currentTime);
         }
               if (currentFrame !== this.previousFrame) {
             this.previousFrame = currentFrame;
             this.drawBoundingBoxes();
               }
 
           if (
             this.currentMode === 'manual' &&
             this.videoPlaying &&
             this.manualBox &&
             !this.isDrawingManualBox
           ) {
             const bbox = this.getBBoxString(this.manualBox);
             this.saveManualMaskingEntry(currentFrame, bbox);
             // 매 30프레임(~1초)마다 배치 동기화
            if (this.newMaskings.length > 0 && currentFrame % 30 === 0) {
              this.sendBatchMaskingsToBackend();
            }
         }
 
         requestAnimationFrame(loop);
       };
 
       requestAnimationFrame(loop);
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