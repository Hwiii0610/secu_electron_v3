import { defineStore } from 'pinia';

export const useConfigStore = defineStore('config', {
  state: () => ({
    allConfig: '',
    selectedSettingTab: 'auto',
    showSettingModal: false,
    isWaterMarking: false,
    settingAutoClasses: {
      person: false,
      car: false,
      motorcycle: false,
      plate: false
    },
    settingExportMaskRange: 'none',
    drmInfo: {
      drmPlayCount: 99,
      drmExportPeriod: ''
    },
    // 워터마크
    showWatermarkModal: false,
    watermarkImage: null,
    waterMarkImageName: '',
    cachedWatermarkImage: null,
    watermarkImageLoaded: false,
  }),

  actions: {
    getDetectObjValue() {
      const { person, car, motorcycle, plate } = this.settingAutoClasses;
      const flags = [person, car, motorcycle, plate];
      // 비트마스크: person=1, car=2, motorcycle=4, plate=8 등 기존 로직 유지
      // 기존 switch문 대신 매핑 테이블 사용
      const map = {
        '1000': '1', '0100': '2', '0010': '3', '0001': '4',
        '1100': '5', '1010': '6', '1001': '7', '0110': '8',
        '0101': '9', '0011': '10', '1110': '11', '1101': '12',
        '1011': '13', '0111': '14', '1111': '15'
      };
      const key = flags.map(f => f ? '1' : '0').join('');
      return map[key] || '0';
    },

    getMaskingRangeValue() {
      const rangeMap = { 'none': '0', 'bg': '1', 'selected': '2', 'unselected': '3' };
      return rangeMap[this.settingExportMaskRange] || '0';
    },
  }
});
