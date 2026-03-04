<template>
  <div class="watermark-modal" v-if="showWatermarkModal">
    <div class="watermark-modal-content">
      <div class="watermark-modal-header">
        <h3>워터마킹</h3>
      </div>
      <div class="watermark-modal-body">
        <div class="watermark-body-content">
          <!-- 워터마크 위치 선택 그리드 -->
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <label style="font-weight: bold; font-size: 13px;">워터마크 위치</label>
            <div class="watermark-position-grid">
              <div
                v-for="(label, value) in watermarkPositions"
                :key="value"
                class="watermark-position-grid__cell"
                :class="{ active: String(allConfig.export.waterlocation) === String(value) }"
                @click="allConfig.export.waterlocation = value"
                :title="label">
                {{ label }}
              </div>
            </div>
          </div>

          <div class="watermark-upload-container" style="width: 55%;">
            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 8px; font-size: 12px;">투명도: {{ allConfig.export.watertransparency }}%</label>
              <input type="range" v-model="allConfig.export.watertransparency" min="0" max="100" />
            </div>
            <button class="watermark-upload-button" @click="$emit('upload-image')">이미지 선택</button>
            <div class="watermark-body-text" style="display: flex; justify-content: space-between;">
              <span style="color: black;">{{ waterMarkImageName || '선택된 이미지 없음' }}</span>
              <button v-if="waterMarkImageName" class="watermark-delete-button"
                @click="$emit('delete-image')"
                style="padding: 2px 8px; font-size: 12px; background: none; font-weight: bold; cursor: pointer; color: black; border: none;">X</button>
            </div>
          </div>
        </div>
        <div>
          <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: bold;">텍스트</label>
          <input maxlength="20" type="text" class="watermark-body-text" v-model="allConfig.export.watertext" placeholder="워터마크 텍스트" />
        </div>
      </div>
      <div class="watermark-modal-footer">
        <button style="width: 30%" class="action-button" @click="$emit('apply')">저장</button>
        <button style="width: 30%" class="action-button" @click="showWatermarkModal = false">취소</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useConfigStore } from '../../stores/configStore';

export default {
  name: 'WatermarkModal',
  emits: ['apply', 'upload-image', 'delete-image'],
  data() {
    return {
      watermarkPositions: {
        '1': '좌상단',
        '2': '우상단',
        '3': '중앙',
        '4': '좌하단',
        '5': '우하단'
      }
    };
  },
  computed: {
    ...mapWritableState(useConfigStore, [
      'showWatermarkModal', 'allConfig', 'waterMarkImageName'
    ]),
  },
};
</script>
