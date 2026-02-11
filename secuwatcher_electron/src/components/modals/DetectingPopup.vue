<template>
  <div v-if="isDetecting" class="auto-detect-popup">
    <div class="auto-detect-content">
      <div class="auto-detect-text">객체 탐지 진행중...</div>
      <div class="auto-progress-bar-container">
        <div class="auto-progress-bar" :style="{ width: progress + '%' }"></div>
        <div class="auto-progress-label">{{ progress }}%</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useDetectionStore } from '../../stores/detectionStore';
import { useVideoStore } from '../../stores/videoStore';

export default {
  name: 'DetectingPopup',
  computed: {
    ...mapWritableState(useDetectionStore, ['isDetecting']),
    ...mapWritableState(useVideoStore, ['progress']),
  },
};
</script>
