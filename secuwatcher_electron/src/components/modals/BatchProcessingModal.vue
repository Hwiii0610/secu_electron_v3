<template>
  <div v-if="isBatchProcessing" class="batch-processing-modal">
    <div class="batch-processing-modal-content">
      <div class="modal-header">
        <h3>일괄처리 진행중</h3>
      </div>
      <div class="modal-body">
        <div class="batch-info-row">
          <span class="info-label">현재 단계:</span>
          <span class="info-value">{{ phaseText }}</span>
        </div>
        <div class="batch-info-row">
          <span class="info-label">처리 중인 파일:</span>
          <span class="info-value">{{ currentFileName }}</span>
        </div>
        <div class="batch-info-row">
          <span class="info-label">파일 진행:</span>
          <span class="info-value">{{ currentFileIndex }} / {{ totalFiles }}</span>
        </div>
        <div class="progress-section">
          <span class="progress-label">전체 진행률</span>
          <div class="batch-progress-bar-container">
            <div class="batch-progress-bar" :style="{ width: overallProgress + '%' }"></div>
            <span class="progress-text">{{ overallProgress.toFixed(1) }}%</span>
          </div>
        </div>
        <div class="progress-section">
          <span class="progress-label">현재 파일 진행률</span>
          <div class="file-progress-bar-container">
            <div class="file-progress-bar" :style="{ width: currentFileProgress + '%' }"></div>
            <span class="progress-text">{{ currentFileProgress.toFixed(1) }}%</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="action-button cancel" @click="cancelBatchProcessing">취소</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState, mapState, mapActions } from 'pinia';
import { useExportStore } from '../../stores/exportStore';

export default {
  name: 'BatchProcessingModal',
  computed: {
    ...mapWritableState(useExportStore, [
      'isBatchProcessing', 'currentFileIndex', 'totalFiles',
      'currentFileName', 'currentFileProgress'
    ]),
    ...mapState(useExportStore, ['phaseText', 'overallProgress']),
  },
  methods: {
    ...mapActions(useExportStore, ['cancelBatchProcessing']),
  },
};
</script>
