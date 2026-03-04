import { defineStore } from 'pinia';

export const useModeStore = defineStore('mode', {
  state: () => ({
    currentMode: '',       // '', 'select', 'mask'
    selectMode: false,
    isBoxPreviewing: false,
    exportAllMasking: 'No',
    // 마스킹 그리기
    maskMode: 'rectangle', // 'rectangle' 또는 'polygon'
    maskCompleteThreshold: 30,
    maskingPoints: [],
    isDrawingMask: false,
    isPolygonClosed: false,
    // 컨텍스트 메뉴
    contextMenuVisible: false,
    contextMenuPosition: { x: 0, y: 0 },
    selectedShape: null,
    // 트랙 네비게이션 메뉴 (좌클릭)
    trackMenuVisible: false,
    trackMenuPosition: { x: 0, y: 0 },
    trackMenuTrackId: null,
  }),

  getters: {
    isSelectMode(state) {
      return state.currentMode === 'select';
    },
    isMaskMode(state) {
      return state.currentMode === 'mask';
    },
    isPolygonMode(state) {
      return state.maskMode === 'polygon';
    },
    isRectangleMode(state) {
      return state.maskMode === 'rectangle';
    },
    isMaskingEnabled(state) {
      return state.exportAllMasking === 'Yes';
    },
    hasContextMenu(state) {
      return state.contextMenuVisible && state.selectedShape !== null;
    },
    hasTrackMenu(state) {
      return state.trackMenuVisible && state.trackMenuTrackId !== null;
    },
  },
});
