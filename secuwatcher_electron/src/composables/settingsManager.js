/**
 * 설정 관리 컴포저블
 *
 * App.vue의 설정/워터마크 로드·저장 로직을 통합합니다.
 *
 * @param {Object} deps
 * @param {Function} deps.getStores - () => { file, mode, config, detection }
 * @param {Function} deps.getCallbacks - () => { drawBoundingBoxes }
 */

import {
  showMessage, showError, MESSAGES,
  normalizeFilePath,
} from '../utils';

export function createSettingsManager(deps) {
  const { getStores, getCallbacks } = deps;

  // ─── 알림 ────────────────────────────────────

  function settingNoti() {
    showMessage(MESSAGES.SETTINGS.DETECTION_CHANGED);
  }

  // ─── 설정 저장 ───────────────────────────────

  async function saveSettings(val) {
    const { config: configStore, file: fileStore, mode } = getStores();
    try {
      configStore.allConfig = configStore.allConfig || {};
      configStore.allConfig.detect = configStore.allConfig.detect || {};
      configStore.allConfig.export = configStore.allConfig.export || {};
      configStore.allConfig.path = configStore.allConfig.path || {};

      if (configStore.isWaterMarking) {
        const hasWaterText = configStore.allConfig.export.watertext && configStore.allConfig.export.watertext.trim() !== '';
        const hasWaterImage = configStore.allConfig.export.waterimgpath && configStore.allConfig.export.waterimgpath.trim() !== '';

        if (!hasWaterText && !hasWaterImage) {
          showMessage(MESSAGES.WATERMARK.TEXT_OR_IMAGE_REQUIRED);
          return;
        }
      }

      configStore.allConfig.detect.detectobj = getDetectObjValue();
      configStore.allConfig.export.maskingrange = getMaskingRangeValue();
      configStore.allConfig.export.watermarking = configStore.isWaterMarking ? 'yes' : 'no';

      configStore.allConfig.export.play_count = Number(configStore.drmInfo.drmPlayCount) || 0;
      if (configStore.drmInfo.drmExportPeriod) {
        const today = new Date();
        const target = new Date(configStore.drmInfo.drmExportPeriod);
        const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
        configStore.allConfig.export.play_date = String(Math.max(0, diffDays));
      }

      // 저장 경로(내보내기) – 선택했다면 반영
      if (fileStore.selectedExportDir) {
        configStore.allConfig.path.video_masking_path = normalizeFilePath(fileStore.selectedExportDir);
      }

      await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(configStore.allConfig)));

      mode.currentMode = '';
      mode.selectMode = true;
      configStore.showSettingModal = false;

      if (val !== 'watermark') showMessage(MESSAGES.SETTINGS.SAVED);

    } catch (err) {
      console.error('설정 저장 실패:', err);
      showError(err, '설정 저장 중 오류: ');
    }
  }

  // ─── 내보내기 경로 찾기 ─────────────────────

  async function onClickFindDir() {
    const { config: configStore, file: fileStore } = getStores();
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: '내보내기 폴더 선택',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: fileStore.desktopDir,
      });
      if (result.canceled || !result.filePaths?.length) return;

      const dir = result.filePaths[0];
      fileStore.selectedExportDir = normalizeFilePath(dir);

      configStore.allConfig.path = configStore.allConfig.path || {};
      configStore.allConfig.path.video_masking_path = fileStore.selectedExportDir;
      await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(configStore.allConfig)));
    } catch (e) {
      console.error('내보내기 폴더 선택 실패:', e);
      showMessage('폴더 선택 중 오류가 발생했습니다: ' + e.message);
    }
  }

  // ─── 설정 로드 (getExportConfig) ─────────────

  async function getExportConfig() {
    const { config: configStore, file: fileStore } = getStores();
    try {
      // 1) 설정 읽기
      const settings = await window.electronAPI.getSettings();
      configStore.allConfig = settings || {};
      configStore.allConfig.detect = configStore.allConfig.detect || {};
      configStore.allConfig.export = configStore.allConfig.export || {};
      configStore.allConfig.path = configStore.allConfig.path || {};

      // 2) 바탕화면 경로 확보
      fileStore.desktopDir = await window.electronAPI.getDesktopDir();
      const normalize = (p) => (p || '').replace(/[\\/]+$/, '');
      const desktop = normalize(fileStore.desktopDir);

      // 2-1) 값이 없을 때만 초기화 후 저장
      let needSave = false;
      if (!configStore.allConfig.path.video_path) {
        configStore.allConfig.path.video_path = desktop;
        needSave = true;
      }
      if (!configStore.allConfig.path.video_masking_path) {
        configStore.allConfig.path.video_masking_path = desktop;
        needSave = true;
      }
      if (needSave) {
        await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(configStore.allConfig)));
      }

      // 3) UI 경로 매핑
      const openDir = normalize(configStore.allConfig.path.video_path || desktop);
      const exportDir = normalize(configStore.allConfig.path.video_masking_path || desktop);
      fileStore.dirConfig.videoDir = openDir;
      fileStore.selectedExportDir = exportDir;

      // 4) 워터마킹 토글
      configStore.isWaterMarking = configStore.allConfig.export.watermarking === 'yes';

      // 5) 자동객체탐지 대상 매핑
      const detect = String(configStore.allConfig.detect.detectobj ?? '');
      configStore.settingAutoClasses = { person: false, car: false, motorcycle: false, plate: false };
      switch (detect) {
        case '0':  configStore.settingAutoClasses.person = true; break;
        case '1':  configStore.settingAutoClasses.car = true; break;
        case '2':  configStore.settingAutoClasses.motorcycle = true; break;
        case '3':  configStore.settingAutoClasses.plate = true; break;
        case '4':  configStore.settingAutoClasses.person = configStore.settingAutoClasses.car = true; break;
        case '5':  configStore.settingAutoClasses.person = configStore.settingAutoClasses.motorcycle = true; break;
        case '6':  configStore.settingAutoClasses.person = configStore.settingAutoClasses.plate = true; break;
        case '7':  configStore.settingAutoClasses.car = configStore.settingAutoClasses.motorcycle = true; break;
        case '8':  configStore.settingAutoClasses.car = configStore.settingAutoClasses.plate = true; break;
        case '9':  configStore.settingAutoClasses.motorcycle = configStore.settingAutoClasses.plate = true; break;
        case '10': configStore.settingAutoClasses.person = configStore.settingAutoClasses.car = configStore.settingAutoClasses.motorcycle = true; break;
        case '11': configStore.settingAutoClasses.person = configStore.settingAutoClasses.car = configStore.settingAutoClasses.plate = true; break;
        case '12': configStore.settingAutoClasses.person = configStore.settingAutoClasses.motorcycle = configStore.settingAutoClasses.plate = true; break;
        case '13': configStore.settingAutoClasses.car = configStore.settingAutoClasses.motorcycle = configStore.settingAutoClasses.plate = true; break;
        case '14': configStore.settingAutoClasses.person = configStore.settingAutoClasses.car = configStore.settingAutoClasses.motorcycle = true; break;
      }

      // 6) 내보내기 마스킹 범위 매핑
      switch (String(configStore.allConfig.export.maskingrange ?? '0')) {
        case '0': configStore.settingExportMaskRange = 'none'; break;
        case '1': configStore.settingExportMaskRange = 'bg'; break;
        case '2': configStore.settingExportMaskRange = 'selected'; break;
        case '3': configStore.settingExportMaskRange = 'unselected'; break;
        default:  configStore.settingExportMaskRange = 'none';
      }

      // 7) 워터마크 이미지 미리보기
      if (configStore.allConfig.export.waterimgpath) {
        try {
          const imageData = await window.electronAPI.loadWatermark(configStore.allConfig.export.waterimgpath);
          const fileName = configStore.allConfig.export.waterimgpath.split(/[/\\]/).pop();
          configStore.waterMarkImageName = fileName;
          configStore.watermarkImage = imageData.dataUrl;
          preloadWatermarkImage();
        } catch (imgError) {
          console.warn('워터마크 이미지 로드 실패:', imgError);
          configStore.allConfig.export.waterimgpath = '';
          configStore.waterMarkImageName = '';
          configStore.watermarkImage = null;
        }
      }

      // 8) DRM UI 값
      const addDays = Number.parseInt(configStore.allConfig.export.play_date, 10);
      const safeDays = Number.isFinite(addDays) ? Math.max(0, addDays) : 0;
      const base = new Date();
      base.setHours(0, 0, 0, 0);
      base.setDate(base.getDate() + safeDays);
      configStore.drmInfo.drmExportPeriod = formatDateToYMD(base);
      configStore.drmInfo.drmPlayCount = configStore.allConfig.export.play_count ?? 99;

      console.log('✅ getExportConfig loaded:', configStore.allConfig);
    } catch (error) {
      console.error('설정 파일 불러오기 실패:', error);
      showMessage(MESSAGES.SETTINGS.LOAD_FAILED);
    }
  }

  // ─── 유틸리티 ────────────────────────────────

  function formatDateToYMD(date) {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getDetectObjValue() {
    const { config: configStore } = getStores();
    const { person, car, motorcycle, plate } = configStore.settingAutoClasses;

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
  }

  function getMaskingRangeValue() {
    const { config: configStore } = getStores();
    switch (configStore.settingExportMaskRange) {
      case 'none': return "0";
      case 'bg': return "1";
      case 'selected': return "2";
      case 'unselected': return "3";
      default: return "0";
    }
  }

  function closeSettingModal() {
    const { config: configStore, mode } = getStores();
    mode.currentMode = '';
    mode.selectMode = true;
    configStore.showSettingModal = false;
  }

  // ─── 워터마크 ────────────────────────────────

  async function onWatermarkImageUpload() {
    const { config: configStore } = getStores();
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: '워터마크 이미지 선택',
        filters: [
          { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
      }

      const selectedFilePath = result.filePaths[0];
      const fileName = selectedFilePath.split('\\').pop() || selectedFilePath.split('/').pop();

      console.log('선택된 파일 경로:', selectedFilePath);
      console.log('파일명:', fileName);

      configStore.waterMarkImageName = fileName;

      try {
        const imageData = await window.electronAPI.loadWatermark(selectedFilePath);
        configStore.watermarkImage = imageData.dataUrl;
        configStore.watermarkImageLoaded = false;
        preloadWatermarkImage();

        configStore.allConfig.export.waterimgpath = selectedFilePath;
        await saveSettings('watermark');

        showMessage(MESSAGES.WATERMARK.IMAGE_REGISTERED);

      } catch (error) {
        console.error("워터마크 이미지 처리 실패:", error);
        showError(error, MESSAGES.WATERMARK.IMAGE_PROCESS_FAILED('').replace(/:.*/, ': '));
      }

    } catch (error) {
      console.error("파일 선택 실패:", error);
      showError(error, MESSAGES.WATERMARK.SELECT_FAILED('').replace(/:.*/, ': '));
    }
  }

  async function onWatermarkImageDelete() {
    const { config: configStore } = getStores();
    try {
      configStore.waterMarkImageName = '';
      configStore.watermarkImage = null;
      configStore.watermarkImageLoaded = false;
      configStore.cachedWatermarkImage = null;

      configStore.allConfig.export.waterimgpath = '';

      await saveSettings('watermark');

      const { drawBoundingBoxes } = getCallbacks();
      drawBoundingBoxes();

      showMessage(MESSAGES.WATERMARK.IMAGE_DELETED);
    } catch (error) {
      console.error('워터마크 이미지 삭제 실패:', error);
      showError(error, MESSAGES.WATERMARK.IMAGE_DELETE_FAILED('').replace(/:.*/, ': '));
    }
  }

  function applyWatermark() {
    const { drawBoundingBoxes } = getCallbacks();
    drawBoundingBoxes();
    closeWatermarkModal();
  }

  function preloadWatermarkImage() {
    const { config: configStore } = getStores();
    if (!configStore.watermarkImage || configStore.watermarkImageLoaded) return;

    configStore.cachedWatermarkImage = new Image();
    configStore.cachedWatermarkImage.onload = () => {
      configStore.watermarkImageLoaded = true;
    };
    configStore.cachedWatermarkImage.src = configStore.watermarkImage;
  }

  function closeWatermarkModal() {
    const { config: configStore } = getStores();
    configStore.showWatermarkModal = false;
  }

  return {
    settingNoti,
    saveSettings,
    onClickFindDir,
    getExportConfig,
    formatDateToYMD,
    getDetectObjValue,
    getMaskingRangeValue,
    closeSettingModal,
    onWatermarkImageUpload,
    onWatermarkImageDelete,
    applyWatermark,
    preloadWatermarkImage,
    closeWatermarkModal,
  };
}
