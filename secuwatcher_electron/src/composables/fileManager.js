/**
 * 파일 관리 컴포저블
 *
 * App.vue의 파일 선택, 삭제, 변환, 정보 표시 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { file, video, detection, mode, config }
 * @param {Function} deps.getVideo - () => HTMLVideoElement
 * @param {Function} deps.getCallbacks - () => { startNewSession, loadDetectionData }
 * @param {Function} deps.getAppLocals - () => { currentVideoUrl, isProcessing, processingMessage }
 * @param {Function} deps.setAppLocal - (key, val) => void
 * @param {Function} deps.getLocale - () => string (현재 언어 코드)
 */

import { setupConversionProgress } from './conversionHelper';
import {
  showMessage, showError, showConvertError,
  normalizeFilePath, getFilePath,
  formatTime, parseDurationToSeconds, MESSAGES
} from '../utils';

export function createFileManager(deps) {
  const { getStores, getVideo, getCallbacks, getAppLocals, setAppLocal, getLocale } = deps;

  // 디바운스/락 상태
  let _saveTimer = null;
  let _isSavingVideoPath = false;

  // ─── 경로 관리 ─────────────────────────────────

  async function setVideoPathFromItem(item) {
    if (!item) return;

    let full = (typeof item.file === 'string' && item.file) ||
               (typeof item.url === 'string' && item.url) ||
               '';

    if (!full && typeof item.name === 'string') return;

    full = normalizeFilePath(full);
    if (!full) return;

    const dir = full.replace(/[/\\][^/\\]+$/, '');
    if (!dir) return;

    const { config, file: fileStore } = getStores();
    config.allConfig = config.allConfig || {};
    config.allConfig.path = config.allConfig.path || {};
    const current = normalizeFilePath(config.allConfig.path.video_path || '');
    if (current === dir) {
      fileStore.dirConfig.videoDir = dir;
      return;
    }

    config.allConfig.path.video_path = dir;
    fileStore.dirConfig.videoDir = dir;

    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      if (_isSavingVideoPath) return;
      _isSavingVideoPath = true;
      try {
        await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(config.allConfig)));
        console.log('[video_path 저장]', dir);
      } catch (e) {
        console.warn('video_path 저장 실패:', e);
      } finally {
        _isSavingVideoPath = false;
      }
    }, 150);
  }

  function getSelectedVideoDir() {
    const { file: fileStore, config: configStore } = getStores();
    const sel = fileStore.files[fileStore.selectedFileIndex];
    
    console.log('[getSelectedVideoDir] 디버그:', {
      selectedFileIndex: fileStore.selectedFileIndex,
      selExists: !!sel,
      selFile: sel?.file,
      selUrl: sel?.url,
      configVideoPath: configStore.allConfig?.path?.video_path,
      dirConfigVideoDir: fileStore.dirConfig?.videoDir
    });
    
    // [UIUX-macOS] 실제 파일 위치를 최우선으로 사용
    if (sel) {
      if (typeof sel.file === 'string' && sel.file) {
        const fileDir = normalizeFilePath(sel.file.replace(/[/\\][^/\\]+$/, ''));
        console.log('[getSelectedVideoDir] 실제 파일 위치 사용:', fileDir);
        return fileDir;
      }

      if (sel.url && sel.url.startsWith('file:///')) {
        const p = normalizeFilePath(sel.url);
        const urlDir = normalizeFilePath(p.replace(/[/\\][^/\\]+$/, ''));
        console.log('[getSelectedVideoDir] URL 위치 사용:', urlDir);
        return urlDir;
      }
    }
    
    // fallback: config.ini의 video_path
    const configVideoPath = configStore.allConfig?.path?.video_path;
    if (configVideoPath) {
      const normalized = normalizeFilePath(configVideoPath);
      if (normalized) {
        console.log('[getSelectedVideoDir] config.ini 경로 사용:', normalized);
        return normalized;
      }
    }

    return normalizeFilePath(
      fileStore.dirConfig?.videoDir || fileStore.selectedExportDir || fileStore.desktopDir || ''
    );
  }

  // ─── 파일 정보 표시 ───────────────────────────

  function formatFileSize(bytes) {
    if (bytes === 0) return '0MB';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)}${sizes[i]}`;
  }

  function updateFileInfoDisplay(fileInfo) {
    const { file: fileStore } = getStores();
    fileStore.fileInfoItems[0].value = fileInfo.name;
    fileStore.fileInfoItems[1].value = fileInfo.size;
    fileStore.fileInfoItems[2].value = fileInfo.duration;
    fileStore.fileInfoItems[3].value = fileInfo.resolution;
    fileStore.fileInfoItems[4].value = fileInfo.frameRate;
    fileStore.fileInfoItems[5].value = fileInfo.totalFrames;
  }

  function resetVideoInfo() {
    const { file: fileStore, video: videoStore } = getStores();
    fileStore.fileInfoItems[0].value = 'Name';
    fileStore.fileInfoItems[1].value = '0MB';
    fileStore.fileInfoItems[2].value = '00:00';
    fileStore.fileInfoItems[3].value = '1080p';
    fileStore.fileInfoItems[4].value = '30fps';
    fileStore.fileInfoItems[5].value = '300';
    videoStore.currentTime = '00:00';
    videoStore.totalTime = '00:00';
    videoStore.progress = 0;
    setAppLocal('currentVideoUrl', '');
  }

  function updateVideoInfoFromElectron(file) {
    const { file: fileStore, video: videoStore } = getStores();
    if (file.duration !== '분석 중...' && file.duration !== '알 수 없음') {
      fileStore.fileInfoItems[0].value = file.name;
      fileStore.fileInfoItems[1].value = file.size;
      fileStore.fileInfoItems[2].value = file.duration;
      fileStore.fileInfoItems[3].value = file.resolution;
      fileStore.fileInfoItems[4].value = file.frameRate;
      fileStore.fileInfoItems[5].value = file.totalFrames;

      const frameRateMatch = file.frameRate.match(/(\d+\.?\d*)/);
      if (frameRateMatch) {
        videoStore.frameRate = parseFloat(frameRateMatch[1]);
      }

      const durationSeconds = parseDurationToSeconds(file.duration);
      if (durationSeconds > 0) {
        videoStore.videoDuration = durationSeconds;
        videoStore.trimStartTime = 0;
        videoStore.trimEndTime = durationSeconds;
        videoStore.totalTime = file.duration;
      }

      videoStore.resetThumbnails();
    }
  }

  // ─── 비디오 정보 분석 ─────────────────────────

  async function analyzeVideoInfo(fileIndex, filePath) {
    const { file: fileStore, video: videoStore } = getStores();
    try {
      const videoInfo = await window.electronAPI.getVideoInfo(filePath);

      try {
        const fileStat = await window.electronAPI.statFile(filePath);
        fileStore.files[fileIndex].size = fileStat.size;
      } catch (sizeError) {
        console.warn('파일 크기 조회 실패:', sizeError);
      }

      fileStore.files[fileIndex].duration = formatTime(videoInfo.duration);
      fileStore.files[fileIndex].resolution = videoInfo.resolution || '알 수 없음';
      fileStore.files[fileIndex].frameRate = videoInfo.frameRate ? `${videoInfo.frameRate.toFixed(2)} fps` : '알 수 없음';
      fileStore.files[fileIndex].totalFrames = videoInfo.totalFrames || '알 수 없음';

      if (fileStore.selectedFileIndex === fileIndex) {
        updateFileInfoDisplay(fileStore.files[fileIndex]);

        if (videoInfo.frameRate) {
          videoStore.frameRate = videoInfo.frameRate;
        }

        const durationSeconds = parseDurationToSeconds(fileStore.files[fileIndex].duration);
        if (durationSeconds > 0) {
          videoStore.videoDuration = durationSeconds;
          videoStore.trimStartTime = 0;
          videoStore.trimEndTime = durationSeconds;
          videoStore.totalTime = fileStore.files[fileIndex].duration;
        }
      }
    } catch (error) {
      console.error('비디오 정보 분석 실패:', error);
      showMessage('영상 정보를 불러올 수 없습니다.');  // [UIUX-07]
      fileStore.files[fileIndex].duration = '알 수 없음';
      fileStore.files[fileIndex].resolution = '알 수 없음';
      fileStore.files[fileIndex].frameRate = '알 수 없음';
      fileStore.files[fileIndex].totalFrames = '알 수 없음';
    }
  }

  // ─── 변환 & 재생 ──────────────────────────────

  async function convertAndPlay(file, cacheKey) {
    const { video: videoStore } = getStores();
    const conv = setupConversionProgress(videoStore.conversion, file.name);
    try {
      const arrayBuffer = await file.file.arrayBuffer();
      const tempInputPath = await window.electronAPI.saveTempFile(arrayBuffer, file.name);

      const fileName = file.name.split('.')[0];
      const tempOutputPath = await window.electronAPI.getTempPath(`${fileName}_converted.mp4`);

      const options = {
        videoCodec: 'libx264',
        crf: 28,
        duration: parseDurationToSeconds(file.duration)
      };

      await window.electronAPI.convertVideo(tempInputPath, tempOutputPath, options);
      await window.electronAPI.deleteTempFile(tempInputPath);

      const convertedBuffer = await window.electronAPI.getTempFileAsBlob(tempOutputPath);
      const convertedBlob = new Blob([convertedBuffer], { type: 'video/mp4' });
      const convertedUrl = URL.createObjectURL(convertedBlob);

      videoStore.conversionCache[cacheKey] = convertedUrl;
      setAppLocal('currentVideoUrl', convertedUrl);
      updateVideoInfoFromElectron(file);

      const video = getVideo();
      video.play().catch(() => {});
      videoStore.videoPlaying = true;

      conv.cleanup();
      await window.electronAPI.deleteTempFile(tempOutputPath);
    } catch (error) {
      conv.fail();
      console.error('변환 중 오류 발생:', error);
      showConvertError(error);
    }
  }

  async function convertAndPlayFromPath(file, cacheKey) {
    const { file: fileStore, video: videoStore } = getStores();
    const conv = setupConversionProgress(videoStore.conversion, file.name);
    try {
      const originalPath = getFilePath(file) || file.name;
      const normalizedPath = originalPath.replace(/\\/g, '/');
      const lastSlashIndex = normalizedPath.lastIndexOf('/');
      const dirPath = normalizedPath.substring(0, lastSlashIndex);
      const fileName = normalizedPath.substring(lastSlashIndex + 1);
      const baseName = fileName.replace(/\.[^.]+$/, '');

      const outputFileName = `${baseName}_converted.mp4`;
      const outputPath = `${dirPath}/${outputFileName}`;
      const isMac = navigator.userAgent.includes('Macintosh');
      const nativeOutputPath = isMac ? outputPath : outputPath.replace(/\//g, '\\');

      const seconds = parseDurationToSeconds(file.duration);
      const options = {
        videoCodec: 'libx264',
        crf: 23,
        duration: isNaN(seconds) ? undefined : seconds
      };

      await window.electronAPI.convertVideo(originalPath, nativeOutputPath, options);

      const cleanPath = nativeOutputPath.replace(/\\/g, '/');
      const convertedUrl = `local-video://stream/${cleanPath}`;

      const fileIndex = fileStore.files.indexOf(file);
      if (fileIndex !== -1) {
        try {
          const newStat = await window.electronAPI.getFileStat(nativeOutputPath);
          const newInfo = await window.electronAPI.getVideoInfo(nativeOutputPath);

          const newFileItem = {
            ...file,
            name: outputFileName,
            file: nativeOutputPath,
            url: convertedUrl,
            size: newStat ? formatFileSize(newStat.size) : 'Unknown',
            duration: formatTime(newInfo.duration),
            resolution: newInfo.resolution,
            frameRate: newInfo.frameRate ? `${newInfo.frameRate.toFixed(2)} fps` : 'Unknown',
            totalFrames: newInfo.totalFrames,
            codec: (newInfo.codec || '').toLowerCase(),
          };

          fileStore.files.splice(fileIndex, 1, newFileItem);
        } catch (updateErr) {
          console.error('파일 목록 업데이트 중 오류:', updateErr);
          showMessage('파일 정보 업데이트 중 오류가 발생했습니다.');  // [UIUX-07]
          const newFileItem = {
            ...file,
            name: outputFileName,
            file: nativeOutputPath,
            url: convertedUrl
          };
          fileStore.files.splice(fileIndex, 1, newFileItem);
        }
      }

      videoStore.conversionCache[cacheKey] = convertedUrl;
      setAppLocal('currentVideoUrl', convertedUrl);
      updateVideoInfoFromElectron(file);

      const video = getVideo();
      video.play().catch(() => {});
      videoStore.videoPlaying = true;

      conv.cleanup();

      try {
        await window.electronAPI.deleteTempFile(originalPath);
        console.log('원본 파일 삭제 완료:', originalPath);
      } catch (deleteErr) {
        console.error('원본 파일 삭제 실패:', deleteErr);
        showMessage('임시 파일 정리에 실패했습니다.');  // [UIUX-07]
      }
    } catch (err) {
      conv.fail();
      console.error('경로 변환 중 오류:', err);
      showConvertError(err);
    }
  }

  // ─── 파일 선택/삭제 ───────────────────────────

  async function selectFile(index) {
    const { file: fileStore, video: videoStore, detection, mode } = getStores();
    if (detection.isDetecting) {
      showMessage(MESSAGES.DETECTION.BUSY);
      return;
    }
    const { startNewSession, loadDetectionData } = getCallbacks();
    const video = getVideo();

    startNewSession();
    fileStore.selectedFileIndex = index;

    await setVideoPathFromItem(fileStore.files[index]);

    const file = fileStore.files[index];

    if (video && file) {
      detection.maskingLogs = [];
      detection.maskingLogsMap = {};
      detection.dataLoaded = false;

      const fileExtension = (file.name.split('.').pop() || '').toLowerCase();
      const isHEVC = /^(hevc|h265)$/.test((file.codec || '').toLowerCase());

      if (fileExtension === 'mp4' && !isHEVC) {
        setAppLocal('currentVideoUrl', file.url);
        updateVideoInfoFromElectron(file);
        video.play().catch(() => {});
        videoStore.videoPlaying = true;
      } else {
        const cacheKey = `${file.name}_${file.size}`;

        if (videoStore.conversionCache[cacheKey]) {
          setAppLocal('currentVideoUrl', videoStore.conversionCache[cacheKey]);
          updateVideoInfoFromElectron(file);
          video.play().catch(() => {});
          videoStore.videoPlaying = true;
        } else {
          if (file.file instanceof File) {
            await convertAndPlay(file, cacheKey);
          } else {
            await convertAndPlayFromPath(file, cacheKey);
          }
        }
      }

      loadDetectionData();
      mode.selectMode = true;
    }
  }

  async function deleteFile() {
    const { file: fileStore, video: videoStore, detection } = getStores();
    if (detection.isDetecting) {
      showMessage(MESSAGES.DETECTION.BUSY);
      return;
    }

    if (fileStore.selectedFileIndex >= 0 && fileStore.selectedFileIndex < fileStore.files.length) {
      const fileToDelete = fileStore.files[fileStore.selectedFileIndex];

      // 관련 데이터(탐지/crop) 존재 여부 확인 후 경고
      if (fileToDelete && fileToDelete.name) {
        try {
          const filePath = fileToDelete.file || fileToDelete.url || '';
          const dataInfo = await window.electronAPI.checkFileData(fileToDelete.name, filePath);
          if (dataInfo && (dataInfo.hasDetection || dataInfo.hasCrop)) {
            const details = dataInfo.details.join(', ');
            const confirmed = await window.electronAPI.confirmMessage(
              `'${fileToDelete.name}' 파일에 연관된 데이터가 있습니다.\n\n` +
              `• ${details}\n\n` +
              `파일을 삭제하면 해당 데이터도 함께 삭제됩니다.\n계속하시겠습니까?`
            );
            if (!confirmed) return;
            // 사용자가 확인 → 연관 데이터 실제 삭제
            try {
              await window.electronAPI.deleteFileData(fileToDelete.name, filePath);
            } catch (delErr) {
              console.warn('연관 데이터 삭제 실패:', delErr);
            }
          }
        } catch (e) {
          console.warn('파일 데이터 확인 실패:', e);
        }
      }

      // 메모리 내 탐지 데이터도 초기화
      detection.maskingLogs = [];
      detection.maskingLogsMap = {};
      detection.dataLoaded = false;

      if (fileToDelete) {
        const cacheKey = `${fileToDelete.name}_${fileToDelete.size}`;
        if (videoStore.conversionCache[cacheKey]) {
          URL.revokeObjectURL(videoStore.conversionCache[cacheKey]);
          delete videoStore.conversionCache[cacheKey];
        }
      }

      URL.revokeObjectURL(fileStore.files[fileStore.selectedFileIndex].url);
      fileStore.files.splice(fileStore.selectedFileIndex, 1);

      if (fileStore.files.length > 0) {
        selectFile(Math.min(fileStore.selectedFileIndex, fileStore.files.length - 1));
      } else {
        fileStore.selectedFileIndex = -1;
        resetVideoInfo();
      }

      // 파일 리스트 영속화
      fileStore.saveFileList();
    }
  }

  // ─── 파일 입력 (다이얼로그) ───────────────────

  async function triggerFileInput() {
    const { file: fileStore, video: videoStore } = getStores();
    const locale = getLocale ? getLocale() : 'ko';

    const selectionMode = await window.electronAPI.showSelectionModeDialog(locale);
    if (selectionMode === 2) return;

    const defaultPath = (fileStore.dirConfig.videoDir || '').trim();
    const isFolderMode = (selectionMode === 1);

    const dialogOptions = {
      title: isFolderMode ? '영상 폴더 선택' : '영상 파일 선택',
      defaultPath: defaultPath || undefined,
      properties: isFolderMode
        ? ['openDirectory']
        : ['openFile', 'multiSelections'],
    };

    if (!isFolderMode) {
      dialogOptions.filters = [
        { name: 'Videos', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'] }
      ];
    }

    const { canceled, filePaths: selectedPaths } = await window.electronAPI.showVideoDialog(dialogOptions);
    if (canceled || !selectedPaths?.length) return;

    let filesToProcess = [];

    if (isFolderMode) {
      setAppLocal('isProcessing', true);
      setAppLocal('processingMessage', '폴더 내 영상 검색 중...');

      try {
        for (const folderPath of selectedPaths) {
          const videoFiles = await window.electronAPI.scanDirectory(folderPath);
          filesToProcess.push(...videoFiles);
        }
      } catch (err) {
        console.error(err);
        showMessage('폴더 스캔 중 오류가 발생했습니다.');  // [UIUX-07]
      } finally {
        setAppLocal('isProcessing', false);
      }

      if (filesToProcess.length === 0) {
        showMessage('선택한 폴더에 영상 파일이 없습니다.');
        return;
      }
    } else {
      filesToProcess = selectedPaths;
    }

    if (filesToProcess.length > 0) {
      await setVideoPathFromItem({ file: filesToProcess[0] });
    }

    if (isFolderMode || filesToProcess.length > 1) {
      fileStore.isFolderLoading = true;
      fileStore.folderLoadTotal = filesToProcess.length;
      fileStore.folderLoadCurrent = 0;
      fileStore.folderLoadProgress = 0;
      fileStore.folderLoadCurrentName = '';
      fileStore.folderLoadFiles = filesToProcess.map(p => ({
        name: p.split(/[/\\]/).pop(),
        status: 'waiting',
      }));
    }

    // 중복 파일 수집 (일괄 알림용)
    const skippedFiles = [];

    for (let fi = 0; fi < filesToProcess.length; fi++) {
      const p = filesToProcess[fi];
      let name = p.split(/[/\\]/).pop();
      let targetPath = p;
      let sizeText = '';

      // 폴더 로딩 파일 상태 업데이트
      if (fileStore.isFolderLoading && fileStore.folderLoadFiles[fi]) {
        fileStore.folderLoadFiles[fi].status = 'active';
        fileStore.folderLoadCurrentName = name;
      }

      try {
        const copyResult = await window.electronAPI.copyVideoToDir(p);
        if (copyResult && copyResult.success) {
          targetPath = copyResult.filePath;
          name = copyResult.fileName;
          console.log('[파일 추가] 복사 완료:', copyResult.message);

          // 동일 파일이 이미 존재하는 경우 → 스킵하고 목록에 수집
          if (copyResult.alreadyExists) {
            const existingIndex = fileStore.files.findIndex(f => f.name === name);
            if (existingIndex >= 0) {
              skippedFiles.push(name);
              if (fileStore.isFolderLoading) {
                if (fileStore.folderLoadFiles[fi]) fileStore.folderLoadFiles[fi].status = 'skipped';
                fileStore.folderLoadCurrent++;
                fileStore.folderLoadProgress = Math.floor(
                  (fileStore.folderLoadCurrent / fileStore.folderLoadTotal) * 100
                );
              }
              continue;
            }
          }
        }
      } catch (copyError) {
        console.error('[파일 추가] 복사 실패:', copyError);
        showError(copyError, MESSAGES.FILE.COPY_ERROR('').replace(/:.*/, ': '));
        continue;
      }

      // 파일 목록에 같은 이름이 이미 있으면 중복 추가 방지
      const existingIndex = fileStore.files.findIndex(f => f.name === name);
      if (existingIndex >= 0) {
        skippedFiles.push(name);
        if (fileStore.isFolderLoading) {
          if (fileStore.folderLoadFiles[fi]) fileStore.folderLoadFiles[fi].status = 'skipped';
          fileStore.folderLoadCurrent++;
          fileStore.folderLoadProgress = Math.floor(
            (fileStore.folderLoadCurrent / fileStore.folderLoadTotal) * 100
          );
        }
        continue;
      }

      const cleanPath = targetPath.replace(/\\/g, '/');
      const url = `local-video://stream/${cleanPath}`;

      try {
        const stat = await window.electronAPI.getFileStat(targetPath);
        if (stat && typeof stat.size === 'number') {
          sizeText = formatFileSize(stat.size);
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
        file: targetPath
      };
      fileStore.files.push(fileItem);
      const fileIndex = fileStore.files.length - 1;

      if (fileStore.selectedFileIndex === -1) {
        fileStore.selectedFileIndex = fileIndex;
        updateFileInfoDisplay(fileItem);
      }

      const progressHandler = (event, data) => {
        videoStore.conversion.inProgress = true;
        videoStore.conversion.progress = data.progress;
        videoStore.conversion.currentFile = `[복구 중] ${name}`;
      };
      window.electronAPI.onConversionProgress(progressHandler);

      try {
        const info = await window.electronAPI.getVideoInfo(targetPath);

        fileStore.files[fileIndex].duration = formatTime(info.duration);
        fileStore.files[fileIndex].resolution = info.resolution;
        fileStore.files[fileIndex].frameRate = info.frameRate ? `${info.frameRate.toFixed(2)} fps` : '알 수 없음';
        fileStore.files[fileIndex].totalFrames = info.totalFrames;
        fileStore.files[fileIndex].codec = (info.codec || '').toLowerCase();

        if (fileStore.selectedFileIndex === fileIndex) {
          updateFileInfoDisplay(fileStore.files[fileIndex]);
        }
      } catch (e) {
        console.error('비디오 정보 조회 실패:', e);
        showMessage('영상 정보를 불러올 수 없습니다.');  // [UIUX-07]
        fileStore.files[fileIndex].duration = '알 수 없음';
        if (fileStore.selectedFileIndex === fileIndex) {
          updateFileInfoDisplay(fileStore.files[fileIndex]);
        }
      } finally {
        window.electronAPI.removeConversionProgressListener(progressHandler);
        videoStore.conversion.inProgress = false;
        videoStore.conversion.progress = 0;
      }

      if (fileStore.isFolderLoading) {
        if (fileStore.folderLoadFiles[fi]) fileStore.folderLoadFiles[fi].status = 'completed';
        fileStore.folderLoadCurrent++;
        fileStore.folderLoadProgress = Math.floor(
          (fileStore.folderLoadCurrent / fileStore.folderLoadTotal) * 100
        );
      }
    }

    fileStore.isFolderLoading = false;
    fileStore.folderLoadCurrent = 0;
    fileStore.folderLoadTotal = 0;
    fileStore.folderLoadProgress = 0;
    fileStore.folderLoadCurrentName = '';
    fileStore.folderLoadFiles = [];

    if (fileStore.files.length > 0) {
      const lastIndex = fileStore.files.length - 1;
      selectFile(lastIndex);
    }

    // 중복 파일 요약 알림 (비디오 래퍼 우측 상단 노티)
    if (skippedFiles.length > 0) {
      window.dispatchEvent(new CustomEvent('show-file-noti', {
        detail: { skippedFiles }
      }));
    }

    // 파일 리스트 영속화
    fileStore.saveFileList();
  }

  // ─── 브라우저 파일 입력 ───────────────────────

  async function onFileSelected(event) {
    const { file: fileStore, video: videoStore } = getStores();
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const tempFilePath = await window.electronAPI.saveTempFile(arrayBuffer, file.name);

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
          showMessage('파일 복사 중 오류가 발생했습니다.');  // [UIUX-07]
        } finally {
          await window.electronAPI.deleteTempFile(tempFilePath);
        }

        const cleanPath = targetPath.replace(/\\/g, '/');
        const fileUrl = `local-video://stream/${cleanPath}`;

        const fileInfo = {
          name: displayName,
          size: formatFileSize(file.size),
          url: fileUrl,
          duration: '분석 중...',
          resolution: '분석 중...',
          frameRate: '분석 중...',
          totalFrames: '분석 중...',
          file: targetPath
        };

        fileStore.files.push(fileInfo);
        const fileIndex = fileStore.files.length - 1;

        if (fileStore.selectedFileIndex === -1 || fileStore.files.length === 1) {
          fileStore.selectedFileIndex = fileIndex;
          updateFileInfoDisplay(fileInfo);
        }

        try {
          const videoInfo = await window.electronAPI.getVideoInfo(targetPath);

          fileStore.files[fileIndex].duration = formatTime(videoInfo.duration);
          fileStore.files[fileIndex].resolution = videoInfo.resolution || '알 수 없음';
          fileStore.files[fileIndex].frameRate = videoInfo.frameRate ? `${videoInfo.frameRate.toFixed(2)} fps` : '알 수 없음';
          fileStore.files[fileIndex].totalFrames = videoInfo.totalFrames || '알 수 없음';
          fileStore.files[fileIndex].codec = (videoInfo.codec || '').toLowerCase();

          if (fileStore.selectedFileIndex === fileIndex) {
            updateFileInfoDisplay(fileStore.files[fileIndex]);

            if (videoInfo.frameRate) {
              videoStore.frameRate = videoInfo.frameRate;
            }

            const durationSeconds = parseDurationToSeconds(fileStore.files[fileIndex].duration);
            if (durationSeconds > 0) {
              videoStore.videoDuration = durationSeconds;
              videoStore.trimStartTime = 0;
              videoStore.trimEndTime = durationSeconds;
              videoStore.totalTime = fileStore.files[fileIndex].duration;
            }
          }
        } catch (infoError) {
          console.error('비디오 정보 추출 실패:', infoError);
          showMessage('영상 정보를 불러올 수 없습니다.');  // [UIUX-07]
          fileStore.files[fileIndex].duration = '알 수 없음';
          fileStore.files[fileIndex].resolution = '알 수 없음';
          fileStore.files[fileIndex].frameRate = '알 수 없음';
          fileStore.files[fileIndex].totalFrames = '알 수 없음';

          if (fileStore.selectedFileIndex === fileIndex) {
            updateFileInfoDisplay(fileStore.files[fileIndex]);
          }
        }
      } catch (error) {
        console.error('파일 처리 중 오류:', error);
        showMessage('파일 처리 중 오류가 발생했습니다.');  // [UIUX-07]
      }
    }

    if (fileStore.files.length > 0) {
      const lastIndex = fileStore.files.length - 1;
      selectFile(lastIndex);
    }

    // 파일 리스트 영속화
    fileStore.saveFileList();

    event.target.value = '';
  }

  return {
    setVideoPathFromItem,
    getSelectedVideoDir,
    formatFileSize,
    updateFileInfoDisplay,
    resetVideoInfo,
    updateVideoInfoFromElectron,
    analyzeVideoInfo,
    convertAndPlay,
    convertAndPlayFromPath,
    selectFile,
    deleteFile,
    triggerFileInput,
    onFileSelected,
  };
}
