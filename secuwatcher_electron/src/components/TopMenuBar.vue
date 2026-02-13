<template>
  <div class="export-container">
    <div @click="$emit('menu-click', '자동객체탐지')">
      <img src="../../src/assets/autodetect.png" alt="icon">
      <span>자동객체탐지</span>
    </div>
    <div @click="$emit('menu-click', '선택객체탐지')">
      <img src="../../src/assets/selectdetect.png" alt="icon">
      <span>선택객체탐지</span>
    </div>
    <div @click="$emit('menu-click', '수동 마스킹')">
      <img src="../../src/assets/masking.png" alt="icon">
      <span>수동 마스킹</span>
    </div>
    <div @click="$emit('menu-click', '전체마스킹')">
      <img src="../../src/assets/all_masking.png" alt="icon">
      <span>전체마스킹</span>
    </div>
    <div @click="$emit('menu-click', '미리보기')">
      <img src="../../src/assets/preview.png" alt="icon">
      <span>미리보기</span>
    </div>
    <div @click="$emit('menu-click', '내보내기')">
      <img src="../../src/assets/export.png" alt="icon">
      <span>내보내기</span>
    </div>
    <div @click="$emit('menu-click', '일괄처리')">
      <img src="../../src/assets/export.png" alt="icon">
      <span>일괄처리</span>
    </div>
    <div @click="$emit('menu-click', '설정')">
      <img src="../../src/assets/setting.png" alt="icon">
      <span>설정</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'TopMenuBar',
  emits: ['menu-click'],
};
</script>
