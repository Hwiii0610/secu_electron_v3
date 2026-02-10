import { defineStore } from 'pinia';

export const useModeStore = defineStore('mode', {
  state: () => ({
    currentMode: '',       // '', 'select', 'mask', 'manual'
    selectMode: false,
    isBoxPreviewing: false,
    exportAllMasking: 'No',
    // 마스킹 그리기
    maskMode: 'rectangle', // 'rectangle' 또는 'polygon'
    maskCompleteThreshold: 30,
    maskingPoints: [],
    isDrawingMask: false,
    isPolygonClosed: false,
    // 수동 박스
    manualBox: null,
    isDrawingManualBox: false,
    isDraggingManualBox: false,
    dragOffset: { x: 0, y: 0 },
    // 컨텍스트 메뉴
    contextMenuVisible: false,
    contextMenuPosition: { x: 0, y: 0 },
    selectedShape: null,
  }),
});
