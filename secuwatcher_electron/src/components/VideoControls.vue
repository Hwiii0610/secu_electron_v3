<template>
  <!-- 플로팅 컨트롤바 오버레이 — 비디오 영역 하단에 절대 위치 -->
  <div class="floating-control-bar" :class="{ 'fcb-collapsed': isCollapsed }">
    <!-- 토글 탭 핸들 -->
    <div class="fcb-toggle-tab" @click="isCollapsed = !isCollapsed" :title="isCollapsed ? '컨트롤러 펼치기' : '컨트롤러 접기'">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <polygon v-if="isCollapsed" points="7,14 12,9 17,14"/>
        <polygon v-else points="7,10 12,15 17,10"/>
      </svg>
    </div>
    <!-- 좌측 플레이 버튼 -->
    <div class="fcb-play" @click="$emit('toggle-play')" :title="videoPlaying ? '일시정지' : '재생'">
      <span class="play-icon">{{ videoPlaying ? '⏸' : '▶' }}</span>
    </div>

    <!-- 중앙 타임라인 영역 -->
    <div class="fcb-timeline">
      <div class="fcb-timeline-row fcb-nav-row">
        <!-- 1. 전체 처음으로 (|◁) — 바(좌) + 삼각(좌) -->
        <button class="fcb-nav-btn" @click="goToStart" title="전체 처음으로">
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="2.5" height="14"/><polygon points="18,5 8,12 18,19"/></svg>
        </button>
        <!-- 2. 이전 구간 처음으로 (◁|) — 삼각(좌) + 바(우) -->
        <button class="fcb-nav-btn" @click="goToPrevSegment" title="이전 구간 처음으로">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="16,5 6,12 16,19"/><rect x="17.5" y="5" width="2.5" height="14"/></svg>
        </button>
        <div class="fcb-ruler">
          <!-- 현재 시간 + 프레임 번호 (플레이헤드 왼쪽) -->
          <span class="fcb-now-t" :style="{ left: rulerCurrentTimeLeft + '%' }">
            {{ currentTime }}<sup class="fcb-frame-sup">{{ currentFramePadded }}</sup>
          </span>
          <!-- 전체 시간 (플레이헤드 오른쪽) -->
          <span class="fcb-total-t" :style="{ left: rulerTotalTimeLeft + '%' }">
            {{ totalTime }}
          </span>
        </div>
        <!-- 5. 다음 구간 처음으로 (|▷) — 바(좌) + 삼각(우) -->
        <button class="fcb-nav-btn" @click="goToNextSegment" title="다음 구간 처음으로">
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="5" width="2.5" height="14"/><polygon points="8,5 18,12 8,19"/></svg>
        </button>
        <!-- 6. 전체 끝으로 (▷|) — 삼각(우) + 바(우) -->
        <button class="fcb-nav-btn" @click="goToEnd" title="전체 끝으로">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,5 16,12 6,19"/><rect x="17.5" y="5" width="2.5" height="14"/></svg>
        </button>
      </div>
      <div class="fcb-timeline-row">
        <div
          ref="stripRef"
          class="fcb-strip"
          @mousedown.prevent="onStripMouseDown"
          @mousemove="onStripMouseMove"
          @mouseleave="onStripMouseLeave"
        >
          <!-- 썸네일 레이어 — translateX로 현재 시간 중앙 정렬 -->
          <div
            class="fcb-thumbnail-layer"
            :style="{ transform: thumbnailTransform }"
          >
            <div
              v-for="segment in segmentsWithLayout"
              :key="segment.id"
              class="fcb-segment"
              :class="{ active: segment.isActive }"
              :style="{
                left: segment.leftPercent + '%',
                width: segment.widthPercent + '%',
                backgroundImage: segment.spriteUrl
                  ? `url(${segment.spriteUrl})`
                  : 'none'
              }"
            >
              <span class="fcb-segment-duration">{{ segment.durationLabel }}</span>
            </div>
          </div>
          <!-- 탐지 진행률 오버레이 -->
          <div
            v-if="isDetecting"
            class="fcb-detection-overlay"
            :style="{ width: detectionProgress + '%', transform: thumbnailTransform }"
          ></div>
          <!-- 트림 선택 범위 -->
          <div
            v-if="trimStartPosition > 0 || trimEndPosition < 100"
            class="fcb-trim-range"
            :style="{
              left: trimStartPosition + '%',
              width: (trimEndPosition - trimStartPosition) + '%',
              transform: thumbnailTransform
            }"
          ></div>
          <!-- 재생 헤드 (항상 중앙 고정) -->
          <div class="fcb-playhead"></div>
          <!-- 세그먼트 구분선 (스트립 좌표 기준, translateX 미적용) -->
          <div
            v-for="divider in segmentDividers"
            :key="'div-' + divider.id"
            class="fcb-segment-divider"
            :class="{ 'active-left': divider.activeLeft }"
            :style="{ left: divider.left + 'px' }"
          ></div>
          <!-- 세그먼트 duration 오버레이 (스트립 좌표 기준, 뷰포트 내 클램프) -->
          <span
            v-for="overlay in segmentDurationOverlays"
            :key="'dur-' + overlay.id"
            class="fcb-duration-overlay"
            :style="{ left: overlay.left + 'px' }"
          >{{ overlay.label }}</span>
          <!-- 트림 마커 -->
          <div
            class="fcb-trim-marker fcb-trim-start"
            :style="{ left: `calc(${trimStartPosition}% + ${thumbnailOffsetPx}px)` }"
            @mousedown="$emit('marker-mousedown', 'start', $event)"
            title="트림 시작"
          ></div>
          <div
            class="fcb-trim-marker fcb-trim-end"
            :style="{ left: `calc(${trimEndPosition}% + ${thumbnailOffsetPx}px)` }"
            @mousedown="$emit('marker-mousedown', 'end', $event)"
            title="트림 끝"
          ></div>
          <!-- 호버 시간 툴팁 -->
          <div
            v-show="showHoverTooltip"
            class="fcb-hover-tooltip"
            :style="{ left: hoverX + 'px' }"
          >
            {{ hoverTimeLabel }}
          </div>
        </div>
      </div>
    </div>

    <!-- 우측 액션 버튼 영역 -->
    <div class="fcb-actions">
      <button class="fcb-action-btn fcb-btn-primary" @click="$emit('trim-video')" title="분할">
        ✂ {{ $t('common.split') }}
      </button>
      <button class="fcb-action-btn" @click="handleCancel" title="취소">
        {{ $t('common.cancel') }}
      </button>
    </div>
  </div>
</template>

<script>
import { mapWritableState, mapState } from 'pinia';
import { useVideoStore } from '../stores/videoStore';
import { useDetectionStore } from '../stores/detectionStore';

export default {
  name: 'VideoControls',
  emits: [
    'update-progress', 'marker-mousedown', 'zoom-in', 'zoom-out',
    'jump-backward', 'jump-forward', 'toggle-play',
    'set-playback-rate', 'trim-video', 'merge-video'
  ],
  data() {
    return {
      isDragging: false,
      dragStartX: 0,
      dragStartProgress: 0,
      hoverX: 0,
      showHoverTooltip: false,
      hoverTimeLabel: '00:00',
      isCollapsed: false,
      stripWidth: 0,  // $refs 대신 반응형 데이터로 strip 너비 관리
    };
  },
  watch: {
    /** 세그먼트 개수 변경 시에만 strip 너비 갱신 (deep 감시 불필요) */
    'segmentsWithLayout.length'(newLen) {
      this.$nextTick(() => {
        this.updateStripWidth();
      });
    },
  },
  mounted() {
    this.updateStripWidth();
    // 리사이즈 시에도 strip 너비 갱신
    this._resizeObserver = new ResizeObserver(() => this.updateStripWidth());
    if (this.$refs.stripRef) {
      this._resizeObserver.observe(this.$refs.stripRef);
    }
  },
  beforeUnmount() {
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
    document.removeEventListener('mouseup', this.onDocumentMouseUp);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  },
  computed: {
    ...mapWritableState(useVideoStore, [
      'currentTime', 'totalTime', 'progress', 'videoPlaying',
      'currentPlaybackRate', 'currentFrame'
    ]),
    ...mapState(useVideoStore, [
      'sliderBackground', 'trimStartPosition', 'trimEndPosition',
      'segmentsWithLayout', 'videoDuration', 'frameRate'
    ]),
    ...mapState(useDetectionStore, ['isDetecting', 'detectionProgress']),

    /** 프레임 번호를 2자리 패딩 */
    currentFramePadded() {
      return String(this.currentFrame ?? 0).padStart(2, '0');
    },

    /** 썸네일 레이어 translateX — 현재 진행률을 중앙(50%)에 맞춤 */
    thumbnailTransform() {
      return `translateX(${50 - this.progress}%)`;
    },

    /** 썸네일 오프셋 (px) — 트림마커 위치 보정용 */
    thumbnailOffsetPx() {
      if (!this.stripWidth) return 0;
      return (50 - this.progress) / 100 * this.stripWidth;
    },

    /** 룰러: 현재시간 레이블 위치 (플레이헤드 살짝 왼쪽) */
    rulerCurrentTimeLeft() {
      return Math.max(0, Math.min(95, 50 - 6));
    },

    /** 룰러: 전체시간 레이블 위치 (플레이헤드 살짝 오른쪽) */
    rulerTotalTimeLeft() {
      return Math.max(5, Math.min(100, 50 + 6));
    },

    /**
     * 세그먼트 구분선 위치를 스트립 좌표계로 계산
     * 각 세그먼트의 끝(마지막 제외)에 구분선 배치
     * 뷰포트(0~stripWidth) 밖이면 숨김
     */
    segmentDividers() {
      const sw = this.stripWidth;
      if (!sw || this.segmentsWithLayout.length <= 1) return [];
      const offsetPx = (50 - this.progress) / 100 * sw;

      const dividers = [];
      // 마지막 세그먼트 제외 — 각 세그먼트의 우측 끝에 구분선
      for (let i = 0; i < this.segmentsWithLayout.length - 1; i++) {
        const seg = this.segmentsWithLayout[i];
        const boundaryX = ((seg.leftPercent + seg.widthPercent) / 100) * sw + offsetPx;
        // 뷰포트 밖 필터링 제거 — CSS overflow:hidden이 자연 클리핑 처리
        dividers.push({
          id: seg.id,
          left: boundaryX,
          activeLeft: seg.isActive,
        });
      }
      return dividers;
    },

    /**
     * 각 세그먼트의 duration 라벨 위치를 스트립 좌표계로 계산
     * 세그먼트 우측 끝이 스트립 밖이면 스트립 우측 끝에 클램프
     * 세그먼트가 완전히 보이지 않으면 숨김
     */
    segmentDurationOverlays() {
      const sw = this.stripWidth;
      if (!sw) return [];
      const offsetPx = (50 - this.progress) / 100 * sw;
      const labelW = 42; // 라벨 대략 너비 + 여백

      return this.segmentsWithLayout.map(seg => {
        // 세그먼트 좌/우 끝의 스트립 내 X좌표
        const segLeftX = (seg.leftPercent / 100) * sw + offsetPx;
        const segRightX = ((seg.leftPercent + seg.widthPercent) / 100) * sw + offsetPx;

        // 세그먼트가 뷰포트(0~sw)에 일부라도 보이는지
        if (segRightX < labelW || segLeftX > sw) {
          return { id: seg.id, label: seg.durationLabel, left: -9999 }; // 숨김
        }

        // 라벨 위치: 세그먼트 우측 끝, 스트립 범위 내 클램프
        const labelRight = Math.min(segRightX, sw);
        const labelLeft = Math.max(labelRight - labelW, segLeftX + 2);
        return { id: seg.id, label: seg.durationLabel, left: labelLeft };
      });
    },
  },

  methods: {
    /** strip 엘리먼트의 너비를 반응형 데이터로 동기화 */
    updateStripWidth() {
      const strip = this.$refs.stripRef;
      if (strip) {
        this.stripWidth = strip.clientWidth;
      }
    },

    handleCancel() {
      this.$emit('toggle-play');
    },

    /** 전체 처음(0%)으로 이동 */
    goToStart() {
      this.progress = 0;
      this.$emit('update-progress');
    },

    /** 전체 끝(100%)으로 이동 */
    goToEnd() {
      this.progress = 100;
      this.$emit('update-progress');
    },

    /** 현재 활성 세그먼트 기준 왼쪽 분할영역의 제일 처음으로 이동
     *  - 분할된 경우: 현재 활성 세그먼트의 startTime으로 이동
     *  - 미분할(세그먼트 1개)인 경우: 전체 처음으로 이동 */
    goToPrevSegment() {
      if (!this.videoDuration || this.segmentsWithLayout.length <= 1) {
        this.goToStart();
        return;
      }
      const idx = this.segmentsWithLayout.findIndex(s => s.isActive);
      if (idx === -1) {
        this.goToStart();
        return;
      }
      // 현재 활성 세그먼트의 startTime으로 이동
      const activeSeg = this.segmentsWithLayout[idx];
      this.progress = (activeSeg.startTime / this.videoDuration) * 100;
      this.$emit('update-progress');
    },

    /** 현재 활성 세그먼트 기준 오른쪽 분할영역의 제일 처음으로 이동
     *  - 분할된 경우: 다음 세그먼트의 startTime으로 이동
     *  - 미분할(세그먼트 1개)인 경우: 전체 끝으로 이동 */
    goToNextSegment() {
      if (!this.videoDuration || this.segmentsWithLayout.length <= 1) {
        this.goToEnd();
        return;
      }
      const idx = this.segmentsWithLayout.findIndex(s => s.isActive);
      if (idx === -1 || idx >= this.segmentsWithLayout.length - 1) {
        this.goToEnd();
        return;
      }
      // 다음 세그먼트의 startTime으로 이동
      const nextSeg = this.segmentsWithLayout[idx + 1];
      this.progress = (nextSeg.startTime / this.videoDuration) * 100;
      this.$emit('update-progress');
    },

    /** 스트립 마우스다운 — 드래그 시작 */
    onStripMouseDown(e) {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartProgress = this.progress;
      this.showHoverTooltip = false;

      document.addEventListener('mousemove', this.onDocumentMouseMove);
      document.addEventListener('mouseup', this.onDocumentMouseUp);
    },

    /** 문서 마우스무브 — 드래그 중 진행률 업데이트 */
    onDocumentMouseMove(e) {
      if (!this.isDragging) return;
      const strip = this.$refs.stripRef;
      if (!strip) return;

      const dx = e.clientX - this.dragStartX;
      const stripWidth = strip.clientWidth;
      // 오른쪽으로 드래그 = 과거로 이동 (progress 감소)
      // 왼쪽으로 드래그 = 미래로 이동 (progress 증가)
      const deltaProgress = -(dx / stripWidth) * 100;
      let newProgress = this.dragStartProgress + deltaProgress;
      newProgress = Math.max(0, Math.min(100, newProgress));

      this.progress = newProgress;
      this.$emit('update-progress');
    },

    /** 문서 마우스업 — 드래그 종료 */
    onDocumentMouseUp() {
      this.isDragging = false;
      document.removeEventListener('mousemove', this.onDocumentMouseMove);
      document.removeEventListener('mouseup', this.onDocumentMouseUp);
    },

    /** 스트립 호버 — 시간 툴팁 표시 */
    onStripMouseMove(e) {
      if (this.isDragging) return;
      const strip = this.$refs.stripRef;
      if (!strip) return;

      const rect = strip.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      this.hoverX = localX;

      // 마우스 위치의 시간 계산:
      // 화면 좌표 → 타임라인 비율 (썸네일 오프셋 고려)
      const stripWidth = rect.width;
      const offsetPercent = (50 - this.progress);
      const timePercent = ((localX / stripWidth) * 100) - offsetPercent;
      const clampedPercent = Math.max(0, Math.min(100, timePercent));
      const timeSec = (clampedPercent / 100) * (this.videoDuration || 0);

      const m = Math.floor(timeSec / 60).toString().padStart(2, '0');
      const s = Math.floor(timeSec % 60).toString().padStart(2, '0');
      this.hoverTimeLabel = `${m}:${s}`;
      this.showHoverTooltip = true;
    },

    /** 스트립 마우스리브 — 툴팁 숨김 */
    onStripMouseLeave() {
      if (!this.isDragging) {
        this.showHoverTooltip = false;
      }
    },
  },
};
</script>

<style scoped>
/* 플로팅 컨트롤바는 이제 floating-controls.css에서 관리됨 */
/* 여기서는 스코프된 스타일만 필요한 경우 정의 */
</style>
