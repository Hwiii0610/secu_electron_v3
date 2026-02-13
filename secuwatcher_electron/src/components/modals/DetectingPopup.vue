<template>
  <div v-if="isDetecting" class="auto-detect-popup">
    <div class="auto-detect-content">
      <div class="auto-detect-text">{{ detectionLabel }}</div>
      <div class="auto-progress-bar-container">
        <div class="auto-progress-bar" :style="{ width: detectionProgress + '%' }"></div>
        <div class="auto-progress-label">{{ detectionProgress }}%</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useDetectionStore } from '../../stores/detectionStore';

export default {
  name: 'DetectingPopup',
  computed: {
    ...mapWritableState(useDetectionStore, ['isDetecting', 'detectionProgress', 'detectionEventType']),
    detectionLabel() {
      switch (this.detectionEventType) {
        case '1': return '자동 객체 탐지 진행중...';
        case '2': return '선택 객체 탐지 진행중...';
        case '3': return '마스킹 반출 진행중...';
        default: return '객체 탐지 진행중...';
      }
    },
  },
};
</script>
