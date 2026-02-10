<template>
  <div v-if="isFolderLoading" class="processing-modal">
    <div class="processing-modal-content" style="width: 400px;">
      <div class="processing-text" style="margin-bottom: 15px;">영상 파일 분석 중...</div>
      <div style="font-size: 24px; font-weight: bold; color: #3498db; margin-bottom: 15px;">
        {{ folderLoadCurrent }} / {{ folderLoadTotal }}
      </div>
      <div class="auto-progress-bar-container" style="width: 100%; background: #333;">
        <div class="auto-progress-bar" :style="{ width: folderLoadProgress + '%' }"></div>
        <div style="position: absolute; width: 100%; text-align: center; top: 0; line-height: 20px; color: #fff; font-size: 12px;">
          {{ folderLoadProgress }}%
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
      'isFolderLoading', 'folderLoadCurrent', 'folderLoadTotal', 'folderLoadProgress'
    ]),
  },
};
</script>
