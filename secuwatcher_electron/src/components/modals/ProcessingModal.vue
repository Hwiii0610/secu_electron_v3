<template>
  <div v-if="isProcessing" class="processing-modal" role="status" aria-label="처리 중">
    <div class="processing-modal-content">
      <div class="processing-text" aria-live="polite">{{ processingMessage }}</div>
      <div class="processing-spinner">
        <div class="spinner" aria-hidden="true"></div>
      </div>
      <button v-if="cancellable" class="action-button cancel-processing-btn"
              @click="$emit('cancel')" 
              aria-label="작업 취소">
        작업 취소
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProcessingModal',
  props: {
    isProcessing: Boolean,
    processingMessage: String,
    cancellable: { type: Boolean, default: false }
  },
  emits: ['cancel'],
};
</script>
