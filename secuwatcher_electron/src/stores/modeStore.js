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
  }),
});
