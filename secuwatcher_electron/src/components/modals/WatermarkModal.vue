<template>
  <div class="watermark-modal" v-if="showWatermarkModal">
    <div class="watermark-modal-content">
      <div class="watermark-modal-header">
        <h3>워터마킹</h3>
      </div>
      <div class="watermark-modal-body">
        <div class="watermark-body-content">
          <div class="watermark-location-container">
            <div style="display: flex; justify-content: space-between;">
              <input type="radio" value="1" v-model="allConfig.export.waterlocation" />
              <input type="radio" value="2" v-model="allConfig.export.waterlocation" />
            </div>
            <div style="display: flex; justify-content: center;"><input type="radio" value="3" v-model="allConfig.export.waterlocation" /></div>
            <div style="display: flex; justify-content: space-between;">
              <input type="radio" value="4" v-model="allConfig.export.waterlocation" />
              <input type="radio" value="5" v-model="allConfig.export.waterlocation" />
            </div>
          </div>
          <div class="watermark-upload-container" style="width: 55%;">
            <input type="range" v-model="allConfig.export.watertransparency" min="0" max="100" />
            <button class="watermark-upload-button" @click="$emit('upload-image')">IMAGE</button>
            <div class="watermark-body-text" style="display: flex; justify-content: space-between;">
              <span style="color: black;">{{ waterMarkImageName || '선택된 이미지 없음' }}</span>
              <button v-if="waterMarkImageName" class="watermark-delete-button"
                @click="$emit('delete-image')"
                style="padding: 2px 8px; font-size: 12px; background: none; font-weight: bold; cursor: pointer; color: black; border: none;">X</button>
            </div>
          </div>
        </div>
        <div>
          <label>텍스트</label>
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
  computed: {
    ...mapWritableState(useConfigStore, [
      'showWatermarkModal', 'allConfig', 'waterMarkImageName'
    ]),
  },
};
</script>
