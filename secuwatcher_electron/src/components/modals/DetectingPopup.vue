<template>
  <div v-if="isDetecting" class="auto-detect-popup">
    <div class="auto-detect-content">
      <div class="auto-detect-text">객체 탐지 진행중...</div>
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
    ...mapWritableState(useDetectionStore, ['isDetecting', 'detectionProgress']),
  },
};
</script>
