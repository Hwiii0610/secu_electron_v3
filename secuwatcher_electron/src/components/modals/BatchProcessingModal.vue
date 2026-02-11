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

<style scoped>
.batch-processing-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.batch-processing-modal-content {
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 24px;
  min-width: 450px;
  color: #fff;
}

.batch-processing-modal .modal-header {
  margin-bottom: 20px;
  border-bottom: 1px solid #444;
  padding-bottom: 12px;
}

.batch-processing-modal .modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.batch-info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.info-label {
  color: #888;
}

.info-value {
  color: #fff;
  font-weight: 500;
}

.progress-section {
  margin-top: 16px;
}

.progress-label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.batch-progress-bar-container,
.file-progress-bar-container {
  width: 100%;
  height: 24px;
  background: #333;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.batch-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #2196F3, #4CAF50);
  border-radius: 12px;
  transition: width 0.3s ease;
}

.file-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #FF9800, #FFC107);
  border-radius: 12px;
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.batch-processing-modal .modal-footer {
  margin-top: 24px;
  text-align: right;
}

.batch-processing-modal .action-button.cancel {
  background: #f44336;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.batch-processing-modal .action-button.cancel:hover {
  background: #d32f2f;
}
</style>
