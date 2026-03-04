<template>
  <div v-if="isDetecting" class="auto-detect-popup">
    <div class="auto-detect-content">
      <div class="auto-detect-text">{{ detectionLabel }}</div>
      <div class="auto-progress-bar-container">
        <div class="auto-progress-bar" :style="{ width: detectionProgress + '%' }"></div>
        <div class="auto-progress-label">{{ detectionProgress }}%</div>
      </div>
      <div v-if="detectionEta && detectionEta > 0" class="auto-eta-text">{{ formattedEta }}</div>
      <button
        v-if="detectionEventType === '1' || detectionEventType === '2'"
        class="auto-detect-cancel-btn"
        @click="$emit('cancel-detection')"
      >
        {{ $t('detection.cancel') }}
      </button>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useDetectionStore } from '../../stores/detectionStore';

export default {
  name: 'DetectingPopup',
  emits: ['cancel-detection'],
  computed: {
    ...mapWritableState(useDetectionStore, ['isDetecting', 'detectionProgress', 'detectionEventType', 'detectionEta']),
    detectionLabel() {
      switch (this.detectionEventType) {
        case '1': return this.$t('detection.autoDetectingProgress');
        case '2': return this.$t('detection.selectDetectingProgress');
        case '3': return this.$t('detection.maskingExportProgress');
        default: return this.$t('detection.detectingProgress');
      }
    },
    formattedEta() {
      if (!this.detectionEta || this.detectionEta <= 0) return '';
      const seconds = this.detectionEta;
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return this.$t('detection.estimatedTime', { minutes, seconds: secs });
    },
  },
};
</script>
