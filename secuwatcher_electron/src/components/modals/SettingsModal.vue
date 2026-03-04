<template>
  <div class="setting-modal" v-if="showSettingModal">
    <div class="setting-modal-content">
      <div class="setting-modal-header">
        <h3>{{ $t('settings.settingHeader') }}</h3>
      </div>
      <div class="setting-modal-body">
        <div class="setting-tabs" role="tablist" :aria-label="$t('common.settings')">
          <div class="setting-tab" role="tab" tabindex="0" :aria-label="$t('settings.autoDetectSettings')" :aria-selected="selectedSettingTab === 'auto'" :class="{ active: selectedSettingTab === 'auto' }" @click="selectedSettingTab = 'auto'" @keydown.enter="selectedSettingTab = 'auto'">{{ $t('settings.autoDetectSettings') }}</div>
          <div class="setting-tab" role="tab" tabindex="0" :aria-label="$t('settings.exportSettings')" :aria-selected="selectedSettingTab === 'export'" :class="{ active: selectedSettingTab === 'export' }" @click="selectedSettingTab = 'export'" @keydown.enter="selectedSettingTab = 'export'">{{ $t('settings.exportSettings') }}</div>
          <div class="setting-tab" role="tab" tabindex="0" :aria-label="$t('settings.info')" :aria-selected="selectedSettingTab === 'info'" :class="{ active: selectedSettingTab === 'info' }" @click="selectedSettingTab = 'info'" @keydown.enter="selectedSettingTab = 'info'">{{ $t('settings.info') }}</div>
        </div>

        <!-- 자동객체탐지설정 -->
        <div v-if="selectedSettingTab === 'auto'" class="setting-panel">
          <!-- 장치 설정 그룹 -->
          <div class="settings-group">
            <div class="settings-group__title">{{ $t('settings.deviceSettings') }}</div>
            <div class="setting-row">
              <div class="setting-row-content" style="margin-bottom: 10px;">
                <label :title="$t('settings.cpuDescription')"><input type="radio" value="cpu" v-model="allConfig.detect.device" @click="$emit('setting-noti')"/> {{ $t('settings.cpu') }}</label>
                <label :title="$t('settings.gpuDescription')"><input type="radio" value="gpu" v-model="allConfig.detect.device" @click="$emit('setting-noti')"/> {{ $t('settings.gpu') }}</label>
              </div>
            </div>
          </div>

          <!-- 탐지 대상 그룹 -->
          <div class="settings-group">
            <div class="settings-group__title">{{ $t('settings.detectionTarget') }}</div>
            <div class="setting-row">
              <div class="setting-row-content">
                <label :title="$t('settings.personDescription')"><input type="checkbox" v-model="settingAutoClasses.person" /> {{ $t('settings.person') }}</label>
                <label :title="$t('settings.carDescription')"><input type="checkbox" v-model="settingAutoClasses.car" /> {{ $t('settings.car') }}</label>
                <label :title="$t('settings.motorcycleDescription')"><input type="checkbox" v-model="settingAutoClasses.motorcycle" /> {{ $t('settings.motorcycle') }}</label>
                <label :title="$t('settings.plateDescription')"><input type="checkbox" v-model="settingAutoClasses.plate" /> {{ $t('settings.plate') }}</label>
              </div>
            </div>
          </div>

          <!-- 다중파일 탐지 그룹 -->
          <div class="settings-group">
            <div class="settings-group__title">{{ $t('settings.multiFileDetection') }}</div>
            <div class="setting-row">
              <label class="multi-file-label">
                <input type="checkbox" :checked="allConfig.detect.multifiledetect === 'yes'"
                  @click="allConfig.detect.multifiledetect = allConfig.detect.multifiledetect === 'yes' ? 'no' : 'yes'"/> {{ $t('settings.multiFileDetectionLabel') }}
              </label>
              <label>{{ $t('settings.concurrencyLimit') }}
                <input type="number" v-model.number="allConfig.detect.concurrency_limit" min="1" max="10" />
              </label>
            </div>
          </div>
        </div>

        <!-- 내보내기설정 -->
        <div v-else-if="selectedSettingTab === 'export'" class="setting-panel">
          <!-- 마스킹 설정 그룹 -->
          <div class="settings-group">
            <div class="settings-group__title">{{ $t('settings.maskingSettings') }}</div>
            <div class="setting-row">
              <h4 :title="$t('settings.maskingRangeDescription')">{{ $t('settings.maskingRange') }}</h4>
              <select v-model="settingExportMaskRange" class="dropdown-white" :aria-label="$t('settings.maskingRange')" :title="$t('settings.maskingRangeDescription')">
                <option value="none">{{ $t('settings.noMasking') }}</option>
                <option value="bg">{{ $t('settings.backgroundExcluding') }}</option>
                <option value="selected">{{ $t('settings.selectedMasking') }}</option>
                <option value="unselected">{{ $t('settings.unselectedMasking') }}</option>
              </select>
            </div>
            <div class="setting-row">
              <h4 :title="$t('settings.maskingMethodDescription')">{{ $t('settings.maskingMethod') }}</h4>
              <div class="mask-type-options">
                <label :title="$t('settings.mosaicDescription')"><input type="radio" value="0" v-model="allConfig.export.maskingtool" /> {{ $t('settings.mosaic') }}</label>
                <label :title="$t('settings.blurDescription')"><input type="radio" value="1" v-model="allConfig.export.maskingtool" /> {{ $t('settings.blur') }}</label>
              </div>
            </div>
            <div class="setting-row">
              <h4 :title="$t('settings.maskingStrengthDescription')">{{ $t('settings.maskingStrength') }}</h4>
              <div class="masking-strength-container">
                <span>{{ $t('settings.weakLevel') }}</span>
                <input style="width: 75%;" type="range" min="1" max="5" v-model.number="allConfig.export.maskingstrength" :aria-label="$t('settings.maskingStrength')" :title="$t('settings.maskingStrengthDescription')" />
                <span>{{ $t('settings.strongLevel') }}</span>
              </div>
            </div>
          </div>

          <!-- 워터마킹 설정 그룹 -->
          <div class="settings-group">
            <div class="settings-group__title">{{ $t('settings.watermarkingSettings') }}</div>
            <div class="setting-row">
              <label><input type="checkbox" v-model="isWaterMarking"/> {{ $t('settings.watermarking') }}</label>
              <button class="action-button" :aria-label="$t('settings.watermarkingButton')" @click="showWatermarkModal = true">{{ $t('settings.watermarkingButton') }}</button>
            </div>
          </div>
        </div>

        <!-- Info -->
        <div style="color: #D6D6D6" v-else-if="selectedSettingTab === 'info'" class="setting-panel">
          <img style="margin-top: 15px;" src="../../../src/assets/SPHEREAX_CI_Simple_white@2x.png" alt="SPHEREAX_LOGO">
          <div class="file-divider" style="margin-top: 15px; margin-bottom: 15px;"></div>

          <!-- Language Selector -->
          <div class="settings-group">
            <div class="settings-group__title">{{ $t('settings.language') }}</div>
            <div class="setting-row">
              <select v-model="currentLocale" class="dropdown-white" aria-label="언어 선택" @change="changeLanguage">
                <option value="ko">한국어 (Korean)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div class="file-divider" style="margin-top: 15px; margin-bottom: 15px;"></div>

          <p style="margin-bottom: 10px; font-size: 1.1rem; font-weight: bold;">시큐워쳐 for CCTV 영상반출 SW-Export</p>
          <p style="margin-bottom: 10px; font-size: 1.1rem;">Version 1.0.1</p>
          <p>Copyright (C) 2021 SPHEREAX Corp. All Rights Reserved.</p>
        </div>
      </div>

      <div class="setting-modal-footer">
        <button style="width: 20%" class="action-button" :aria-label="$t('settings.saveButton')" @click="$emit('save')">{{ $t('settings.saveButton') }}</button>
        <button style="width: 20%" class="action-button" :aria-label="$t('settings.cancelButton')" @click="$emit('close')">{{ $t('settings.cancelButton') }}</button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapWritableState } from 'pinia';
import { useI18n } from 'vue-i18n';
import { saveLocalePreference } from '../../i18n/index.js';
import { useConfigStore } from '../../stores/configStore';

export default {
  name: 'SettingsModal',
  emits: ['save', 'close', 'setting-noti'],
  setup() {
    const { locale } = useI18n();
    return {
      currentLocale: locale,
    };
  },
  computed: {
    ...mapWritableState(useConfigStore, [
      'showSettingModal', 'selectedSettingTab', 'allConfig',
      'settingAutoClasses', 'settingExportMaskRange',
      'isWaterMarking', 'showWatermarkModal'
    ]),
  },
  methods: {
    changeLanguage() {
      this.$i18n.locale = this.currentLocale;
      saveLocalePreference(this.currentLocale);
    },
  },
};
</script>
