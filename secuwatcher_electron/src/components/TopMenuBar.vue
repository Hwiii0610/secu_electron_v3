<template>
  <div class="export-container">
    <div @click="onMenuClick('자동객체탐지')"
         :class="{ disabled: isBusy || noFile, active: currentMode === '' && isBusy && detectionEventType === '1' }">
      <img src="../../src/assets/autodetect.png" alt="icon">
      <span>자동객체탐지</span>
    </div>
    <div @click="onMenuClick('선택객체탐지')"
         :class="{ disabled: isBusy || noFile, active: currentMode === 'select' }">
      <img src="../../src/assets/selectdetect.png" alt="icon">
      <span>선택객체탐지</span>
    </div>
    <div @click="onMenuClick('수동 마스킹')"
         :class="{ disabled: isBusy || noFile, active: currentMode === 'mask' }">
      <img src="../../src/assets/masking.png" alt="icon">
      <span>수동 마스킹</span>
    </div>
    <div @click="onMenuClick('전체마스킹')"
         :class="{ disabled: noFile }">
      <img src="../../src/assets/all_masking.png" alt="icon">
      <span>전체마스킹</span>
    </div>
    <div @click="onMenuClick('미리보기')"
         :class="{ disabled: noFile }">
      <img src="../../src/assets/preview.png" alt="icon">
      <span>미리보기</span>
    </div>
    <div @click="onMenuClick('내보내기')"
         :class="{ disabled: isBusy || noFile }">
      <img src="../../src/assets/export.png" alt="icon">
      <span>내보내기</span>
    </div>
    <div @click="onMenuClick('일괄처리')"
         :class="{ disabled: isBusy }">
      <img src="../../src/assets/export.png" alt="icon">
      <span>일괄처리</span>
    </div>
    <div @click="onMenuClick('설정')">
      <img src="../../src/assets/setting.png" alt="icon">
      <span>설정</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TopMenuBar',
  props: {
    isBusy: { type: Boolean, default: false },
    noFile: { type: Boolean, default: true },
    currentMode: { type: String, default: '' },
    detectionEventType: { type: String, default: '' },
  },
  emits: ['menu-click'],
  methods: {
    onMenuClick(item) {
      this.$emit('menu-click', item);
    },
  },
};
</script>
