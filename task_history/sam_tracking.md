# SAM2 연속 추적: 동적 크롭 영역 갱신

## Context
`_continuous_tracking()` (sam2_detector.py:227-361)에서 `forward_frames=-1` 연속 추적 시,
크롭 영역이 최초 클릭 위치에 고정됨. 객체가 이동하면 크롭 영역을 벗어나 추적이 실패함.

**해결**: 각 청크 완료 후 마지막 검출 bbox 중심으로 크롭 영역을 갱신.

---

## 수정 파일

| 파일 | 변경 |
|------|------|
| `secuwatcher_python/sam2_detector.py` | `_continuous_tracking()` 내 청크 루프 끝에 크롭 갱신 로직 추가 |

---

## 변경 상세 (`sam2_detector.py`)

### 위치: 청크 루프 끝 (line 348 `if last_crop_bbox is None:` 이후)

현재 코드 흐름:
```
for chunk_idx in range(num_chunks):
    try:
        temp_dir, extracted = _extract_crop_frames(..., crop_region, ...)  # 고정 crop_region
        ...
        for sam2_idx in range(extracted):
            ...
            orig_bbox = _remap_bbox_to_original(crop_bbox, cx1, cy1, ...)  # 고정 cx1, cy1
    finally:
        cleanup

    if stopped_early: break
    if last_crop_bbox is None: break
    # ← 여기에 크롭 갱신 추가
```

### 추가 코드:

```python
    # ── 다음 청크를 위한 크롭 영역 갱신 ──
    # last_crop_bbox(크롭 좌표) 중심 → 원본 좌표로 변환
    bbox_cx = cx1 + (last_crop_bbox[0] + last_crop_bbox[2]) // 2
    bbox_cy = cy1 + (last_crop_bbox[1] + last_crop_bbox[3]) // 2

    new_crop_region = _compute_crop_region(bbox_cx, bbox_cy, frame_w, frame_h, crop_size)
    new_cx1, new_cy1 = new_crop_region[0], new_crop_region[1]

    # last_crop_bbox를 새 크롭 좌표계로 변환 (다음 청크 box prompt용)
    last_crop_bbox = [
        last_crop_bbox[0] + cx1 - new_cx1,
        last_crop_bbox[1] + cy1 - new_cy1,
        last_crop_bbox[2] + cx1 - new_cx1,
        last_crop_bbox[3] + cy1 - new_cy1,
    ]

    crop_region = new_crop_region
    cx1, cy1 = new_cx1, new_cy1
    _log(f"크롭 영역 갱신: ({new_cx1},{new_cy1})-({new_crop_region[2]},{new_crop_region[3]})")
```

### `crop_size` 변수 추가 (line 237 부근):

현재:
```python
chunk_size = _config.getint('sam2', 'chunk_size', fallback=_CHUNK_SIZE)
```

변경:
```python
chunk_size = _config.getint('sam2', 'chunk_size', fallback=_CHUNK_SIZE)
crop_size = _config.getint('sam2', 'crop_size', fallback=384)
```

---

## 검증

1. 객체가 크롭 영역 밖으로 이동하는 긴 영상에서 `forward_frames=-1` 실행
2. 로그에서 "크롭 영역 갱신" 메시지 확인 → 매 청크마다 좌표 변경 확인
3. 검출된 bbox가 객체 이동 경로를 따라가는지 JSON 결과 확인
