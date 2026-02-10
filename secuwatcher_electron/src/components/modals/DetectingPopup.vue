<template>
  <div v-if="isDetecting" class="auto-detect-popup">
    <div class="auto-detect-content">
      <div class="auto-detect-text">객체 탐지 진행중...</div>
      <div class="auto-progress-bar-container">
        <div ref="progressBar" class="auto-progress-bar"></div>
        <div ref="progressLabel" class="auto-progress-label"></div>
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
    ...mapWritableState(useDetectionStore, ['isDetecting']),
  },
};
</script>
