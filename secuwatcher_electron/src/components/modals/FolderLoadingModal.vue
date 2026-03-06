<template>
  <div v-if="isFolderLoading" class="batch-processing-modal">
    <div class="batch-processing-modal-content">
      <div class="batch-modal-header">
        <h3>📂 파일 추가</h3>
      </div>

      <div class="batch-modal-body">
        <!-- 현재 단계 -->
        <div class="batch-phase-indicator">
          <span class="batch-phase-icon folder-load-spinner"></span>
          <span class="batch-phase-text">영상 파일 분석 중</span>
        </div>

        <!-- 현재 파일 -->
        <div class="batch-current-file">
          현재 파일: <strong>{{ folderLoadCurrentName || '...' }}</strong>
        </div>

        <!-- 현재 파일 진행률 -->
        <div class="batch-progress-section">
          <span class="batch-progress-label">전체 진행률</span>
          <div class="batch-progress-bar-container">
            <div class="batch-progress-bar" :style="{ width: folderLoadProgress + '%' }"></div>
          </div>
          <div class="batch-progress-info-row">
            <span>파일 {{ folderLoadCurrent }} / {{ folderLoadTotal }}</span>
            <span>{{ folderLoadProgress }}%</span>
          </div>
        </div>

        <!-- 파일 리스트 -->
        <div class="batch-file-list">
          <div
            v-for="(file, index) in folderLoadFiles"
            :key="index"
            class="batch-file-item"
            :class="{
              'batch-file-item--completed': file.status === 'completed',
              'batch-file-item--active': file.status === 'active',
              'batch-file-item--skipped': file.status === 'skipped'
            }"
          >
            <span class="batch-file-icon">
              <template v-if="file.status === 'completed'">✓</template>
              <template v-else-if="file.status === 'active'">◎</template>
              <template v-else-if="file.status === 'skipped'">⊘</template>
              <template v-else>○</template>
            </span>
            <span class="batch-file-name">{{ file.name }}</span>
            <span class="batch-file-status">
              <template v-if="file.status === 'completed'">완료</template>
              <template v-else-if="file.status === 'active'">분석 중</template>
              <template v-else-if="file.status === 'skipped'">중복</template>
              <template v-else>대기</template>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'FolderLoadingModal',
  computed: {
    ...mapWritableState(useFileStore, [
      'isFolderLoading', 'folderLoadCurrent', 'folderLoadTotal',
      'folderLoadProgress', 'folderLoadCurrentName', 'folderLoadFiles'
    ]),
  },
};
</script>
