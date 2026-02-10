<template>
  <div v-if="isProcessing" class="processing-modal">
    <div class="processing-modal-content">
      <div class="processing-text">{{ processingMessage }}</div>
      <div class="processing-spinner">
        <div class="spinner"></div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProcessingModal',
  props: {
    isProcessing: Boolean,
    processingMessage: String,
  },
};
</script>
