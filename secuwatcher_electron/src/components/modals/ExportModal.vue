<template>
  <div v-if="exporting" class="setting-modal">
    <template v-if="exportProgress > 0">
      <div class="auto-detect-content">
        <div class="auto-detect-text">{{ exportMessage }}</div>
        <div class="auto-progress-bar-container">
          <div ref="progressBar2" class="auto-progress-bar" :style="{ width: exportProgress + '%' }"></div>
          <div ref="progressLabel2" class="auto-progress-label">{{ exportProgress }}%</div>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="setting-modal-content">
        <div class="setting-modal-header" style="display: flex; justify-content: space-between; align-items: center;">
          <h3>내보내기</h3>
          <button class="close-button" @click="exporting = false">&times;</button>
        </div>

        <div class="setting-modal-body">
          <div class="setting-row">
            <div class="setting-row-content">
              <label><input type="radio" v-model="exportFileNormal" @change="exportFilePassword = ''" :value="true"/> 원본파일저장</label>
              <label><input type="radio" v-model="exportFileNormal" :value="false"/> 암호화 파일저장</label>
            </div>
          </div>

          <div
            class="file-path-row"
            style="display: flex; align-items: center; gap: 10px; margin: 18px 0 22px 0;
              background: #181c22; border-radius: 7px; padding: 8px 14px 8px 10px; box-shadow: 0 1px 6px #20222244;">
            <span style="font-size: 22px; color: #58a3ff;">📁</span>
            <input type="text" :value="selectedExportDir" readonly
              placeholder="영상 저장 위치를 선택하세요. (기본 경로 : 바탕화면)"
              style="flex: 1; background: transparent; color: #fff; border: none;
                font-size: 15px; outline: none; letter-spacing: 0.5px;" />
            <button
              style="background: #3383e2; color: #fff; border: none; border-radius: 5px;
                padding: 7px 18px; font-weight: bold; font-size: 15px; cursor: pointer;
                box-shadow: 0 1px 2px #22334430; transition: background 0.15s;"
              @click="$emit('find-dir')">찾기</button>
          </div>

          <div>
            <div class="setting-row">
              <h4>DRM</h4>
              <div class="setting-row-content">
                <span>재생횟수</span>
                <input type="text" placeholder="0" v-model="drmInfo.drmPlayCount">
                <span>재생기간</span>
                <VueDatePicker v-model="drmInfo.drmExportPeriod" locale="ko" hide-input-icon :teleport="true" :enable-time-picker="false" style="width: 35%; padding: 0;"/>
              </div>
            </div>

            <div class="setting-row" v-if="!exportFileNormal">
              <h4>저장</h4>
              <div class="setting-row-content">
                <span>재생암호</span>
                <input class="password-input" v-model="exportFilePassword" :type="showPassword ? 'text' : 'password'" maxlength="32">
                <img style="cursor: pointer" v-if="!showPassword" src="../../../src/assets/eye-off.png" alt="eye-slash" @click="showPassword = !showPassword">
                <img style="cursor: pointer" v-else src="../../../src/assets/eye.png" alt="eye" @click="showPassword = !showPassword">
                <span v-if="exportFilePassword"
                  :class="{
                    'password-length-valid': [16, 24, 32].includes(exportFilePassword.length),
                    'password-length-invalid': ![16, 24, 32].includes(exportFilePassword.length)
                  }">
                  ({{ exportFilePassword.length }}자)
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="setting-modal-footer">
          <button class="action-button" @click="$emit('send-export')">내보내기</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import VueDatePicker from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { mapWritableState } from 'pinia';
import { useExportStore } from '../../stores/exportStore';
import { useConfigStore } from '../../stores/configStore';
import { useFileStore } from '../../stores/fileStore';

export default {
  name: 'ExportModal',
  components: { VueDatePicker },
  emits: ['send-export', 'find-dir'],
  computed: {
    ...mapWritableState(useExportStore, [
      'exporting', 'exportProgress', 'exportMessage',
      'exportFileNormal', 'exportFilePassword', 'showPassword'
    ]),
    ...mapWritableState(useConfigStore, ['drmInfo']),
    ...mapWritableState(useFileStore, ['selectedExportDir']),
  },
};
</script>
