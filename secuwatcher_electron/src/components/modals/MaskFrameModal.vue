<template>
  <div class="mask-frame-modal" v-if="showMaskFrameModal">
    <div class="mask-frame-modal-content">
      <div class="mask-frame-modal-header">
        <h3>프레임 범위 선택</h3>
        <button class="close-button" @click="$emit('cancel')">&times;</button>
      </div>
      <div class="mask-frame-modal-body">
        <div>
          <label>시작 프레임:
            <input type="number" disabled v-model.number="frameMaskStartInput" min="0" />
          </label>
        </div>
        <div>
          <label>끝 프레임:
            <input type="number" v-model.number="frameMaskEndInput" :max="maxFrame" />
          </label>
        </div>
      </div>
      <div class="mask-frame-modal-footer">
        <button class="action-button" @click="$emit('confirm')">확인</button>
        <button class="action-button cancel" @click="$emit('cancel')">취소</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useDetectionStore } from '../../stores/detectionStore';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'MaskFrameModal',
  emits: ['confirm', 'cancel'],
  computed: {
    ...mapWritableState(useDetectionStore, [
      'showMaskFrameModal', 'frameMaskStartInput', 'frameMaskEndInput'
    ]),
    maxFrame() {
      const fileStore = useFileStore();
      return fileStore.fileInfoItems[5]?.value || 0;
    },
  },
};
</script>
