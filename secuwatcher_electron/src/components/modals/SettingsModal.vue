<template>
  <div class="setting-modal" v-if="showSettingModal">
    <div class="setting-modal-content">
      <div class="setting-modal-header">
        <h3>Setting</h3>
      </div>
      <div class="setting-modal-body">
        <div class="setting-tabs">
          <div class="setting-tab" :class="{ active: selectedSettingTab === 'auto' }" @click="selectedSettingTab = 'auto'">자동객체탐지설정</div>
          <div class="setting-tab" :class="{ active: selectedSettingTab === 'export' }" @click="selectedSettingTab = 'export'">내보내기설정</div>
          <div class="setting-tab" :class="{ active: selectedSettingTab === 'info' }" @click="selectedSettingTab = 'info'">Info</div>
        </div>

        <!-- 자동객체탐지설정 -->
        <div v-if="selectedSettingTab === 'auto'" class="setting-panel">
          <div class="setting-row">
            <h4>자동 객체 탐지 설정</h4>
            <div class="setting-row-content" style="margin-bottom: 10px;">
              <label><input type="radio" value="cpu" v-model="allConfig.detect.device" @click="$emit('setting-noti')"/> CPU</label>
              <label><input type="radio" value="gpu" v-model="allConfig.detect.device" @click="$emit('setting-noti')"/> GPU</label>
            </div>
            <div class="setting-row-content">
              <label><input type="checkbox" v-model="settingAutoClasses.person" /> 사람</label>
              <label><input type="checkbox" v-model="settingAutoClasses.car" /> 자동차</label>
              <label><input type="checkbox" v-model="settingAutoClasses.motorcycle" /> 오토바이</label>
              <label><input type="checkbox" v-model="settingAutoClasses.plate" /> 번호판</label>
            </div>
          </div>
          <div class="file-divider"></div>
          <h4>다중파일 객체탐지</h4>
          <label class="multi-file-label">
            <input type="checkbox" :checked="allConfig.detect.multifiledetect === 'yes'"
              @click="allConfig.detect.multifiledetect = allConfig.detect.multifiledetect === 'yes' ? 'no' : 'yes'"/> 다중파일객체탐지
          </label>
          <label>동시 실행 가능한 객체탐지 작업 수:
            <input type="number" v-model.number="allConfig.detect.concurrency_limit" min="1" max="10" />
          </label>
        </div>

        <!-- 내보내기설정 -->
        <div v-else-if="selectedSettingTab === 'export'" class="setting-panel">
          <h4>마스킹 범위 설정</h4>
          <select v-model="settingExportMaskRange" class="dropdown-white">
            <option value="none">마스킹 처리 하지 않음</option>
            <option value="bg">지정 객체 제외 배경 마스킹</option>
            <option value="selected">지정 객체 마스킹 처리</option>
            <option value="unselected">미지정 객체 마스킹 처리</option>
          </select>
          <div class="file-divider" style="margin-top: 15px; margin-bottom: 15px;"></div>
          <h4>마스킹 방식 설정</h4>
          <div class="mask-type-options">
            <label><input type="radio" value="0" v-model="allConfig.export.maskingtool" /> 모자이크</label>
            <label><input type="radio" value="1" v-model="allConfig.export.maskingtool" /> 블러</label>
          </div>
          <div class="masking-strength-container">
            <span>연하게</span>
            <input style="width: 75%;" type="range" min="1" max="5" v-model.number="allConfig.export.maskingstrength" />
            <span>진하게</span>
          </div>
          <div class="file-divider" style="margin-top: 15px; margin-bottom: 15px;"></div>
          <h4>워터마킹 설정</h4>
          <label><input type="checkbox" v-model="isWaterMarking"/> 워터마킹</label>
          <button class="action-button" @click="showWatermarkModal = true">워터마킹</button>
        </div>

        <!-- Info -->
        <div style="color: #D6D6D6" v-else-if="selectedSettingTab === 'info'" class="setting-panel">
          <img style="margin-top: 15px;" src="../../../src/assets/SPHEREAX_CI_Simple_white@2x.png" alt="SPHEREAX_LOGO">
          <div class="file-divider" style="margin-top: 15px; margin-bottom: 15px;"></div>
          <p style="margin-bottom: 10px; font-size: 1.1rem; font-weight: bold;">시큐워쳐 for CCTV 영상반출 SW-Export</p>
          <p style="margin-bottom: 10px; font-size: 1.1rem;">Version 1.0.1</p>
          <p>Copyright (C) 2021 SPHEREAX Corp. All Rights Reserved.</p>
        </div>
      </div>

      <div class="setting-modal-footer">
        <button style="width: 20%" class="action-button" @click="$emit('save')">저장</button>
        <button style="width: 20%" class="action-button" @click="$emit('close')">취소</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useConfigStore } from '../../stores/configStore';

export default {
  name: 'SettingsModal',
  emits: ['save', 'close', 'setting-noti'],
  computed: {
    ...mapWritableState(useConfigStore, [
      'showSettingModal', 'selectedSettingTab', 'allConfig',
      'settingAutoClasses', 'settingExportMaskRange',
      'isWaterMarking', 'showWatermarkModal'
    ]),
  },
};
</script>
