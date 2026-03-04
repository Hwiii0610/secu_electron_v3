# SecuWatcher Keyboard Shortcuts Guide

## Navigation Shortcuts

### Menu Navigation
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Tab` | Next Menu Item | Navigate to the next menu item (wraps around) |
| `Shift+Tab` | Previous Menu Item | Navigate to the previous menu item (wraps around) |
| `→` (Right Arrow) | Next Menu Item | Same as Tab when in menu |
| `←` (Left Arrow) | Previous Menu Item | Same as Shift+Tab when in menu |
| `Home` | First Menu Item | Jump to first menu item |
| `End` | Last Menu Item | Jump to last menu item |
| `Space` / `Enter` | Activate Menu | Activate focused menu item |

### Video Playback
| Shortcut | Action | Description |
|----------|--------|-------------|
| `Space` | Play/Pause | Toggle video playback |
| `→` (Right Arrow) | Step Forward | Move forward one frame (or configured step) |
| `←` (Left Arrow) | Step Backward | Move backward one frame (or configured step) |
| `↑` (Up Arrow) | Increase Step Size | Cycle to next frame step mode (1F → 1s → 5s → 10s) |
| `↓` (Down Arrow) | Decrease Step Size | Cycle to previous frame step mode (10s → 5s → 1s → 1F) |
| `A` | Jump to Track Start | Jump to first frame of hovered object |
| `D` | Jump to Track End | Jump to last frame of hovered object |

## Global Shortcuts

| Shortcut | Menu Item | Description |
|----------|-----------|-------------|
| `Ctrl+O` | 파일 열기 | Open video file dialog |
| `Ctrl+Shift+A` | 자동객체탐지 | Auto object detection |
| `Ctrl+Shift+S` | 선택객체탐지 | Selection object detection |
| `Ctrl+M` | 수동 마스킹 | Manual masking mode |
| `Ctrl+Alt+M` | 전체마스킹 | Full video masking |
| `Ctrl+P` | 미리보기 | Toggle preview mode |
| `Ctrl+E` | 내보내기 | Export video |
| `Ctrl+B` | 일괄처리 | Batch processing |
| `Ctrl+,` | 설정 | Settings |

### Modifier Keys
- **Windows/Linux**: Use `Ctrl` key
- **macOS**: Use `Cmd` key instead of `Ctrl`

## Dialog & Modal Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Escape` | Close Dialog | Close any open modal or menu |
| `Tab` | Navigate Options | Move focus through dialog options |
| `Shift+Tab` | Previous Option | Move focus backward through options |
| `Space` / `Enter` | Select Radio | Select/toggle radio button or checkbox |

### Masking Dialog Shortcuts
| Shortcut | Action |
|----------|--------|
| `Tab` | Move to next masking option |
| `Shift+Tab` | Move to previous masking option |
| `Space` / `Enter` | Select masking mode or range |
| `Escape` | Close dialog without masking |

## Focus & Selection

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Tab` | Next Element | Move focus to next interactive element |
| `Shift+Tab` | Previous Element | Move focus to previous interactive element |
| `Enter` | Confirm/Select | Activate button or confirm dialog |
| `Escape` | Cancel | Cancel dialog or close menu |

## Tips & Best Practices

### 1. Quick Video Playback Control
- Use `Space` to pause/play quickly while reviewing frames
- Use `→` / `←` to step frame-by-frame through important sections
- Use `↑` / `↓` to adjust step size without clicking

### 2. Fast Object Navigation
- Hover over an object in the video
- Press `A` to jump to its start, `D` to jump to its end
- Great for tracking objects through a video

### 3. Masking Workflow
- Press `Ctrl+M` to open masking dialog
- Use `Tab` to navigate masking options
- Press `Space` / `Enter` to select desired mode
- Press `Escape` if you want to cancel

### 4. Menu Access
- You can navigate the top menu bar using arrow keys
- Press `Enter` / `Space` to activate a menu item
- Shortcuts are shown as tooltips on hover

### 5. Accessibility Features
- **Visual Focus Ring**: All interactive elements show a blue outline when focused via keyboard
- **Keyboard-Only Navigation**: Entire application can be used without mouse
- **Shortcut Hints**: Hover over menu items to see keyboard shortcut
- **Screen Reader Support**: All dialogs have proper ARIA labels

## Shortcut Reference by Task

### Task: Load and Analyze Video
1. Press `Ctrl+O` to open file dialog
2. Select a video file
3. Wait for video to load
4. Use `Space` / Arrow keys to navigate frames

### Task: Auto Detect Objects
1. Press `Ctrl+Shift+A` (or use menu)
2. If multi-file mode is enabled, select files
3. Detection will start automatically

### Task: Manually Mask Area
1. Press `Ctrl+M` to open masking dialog
2. Select masking mode (polygon/rectangle)
3. Select range (all/to-here/from-here/here-only)
4. Press `Enter` to confirm
5. Click/drag on video to create mask

### Task: Export Video
1. Press `Ctrl+E` to open export dialog
2. Configure export settings (use Tab to navigate)
3. Press `Enter` to start export

## Troubleshooting

### Shortcuts Not Working?
- ✅ Make sure you're not typing in an input field (focus will be released after typing)
- ✅ Some shortcuts may be disabled if:
  - No video is loaded (requires file to be selected)
  - A detection is in progress (certain features locked)
  - A dialog is open (press `Escape` to close it)

### Focus Lost?
- Press `Escape` to close any open modal
- Press `Tab` to restore focus to the main menu

### Arrow Keys Not Working?
- These only work when a video is loaded
- Make sure `selectedFileIndex >= 0`
- Check that an input field is not focused

## Keyboard Accessibility Features

This application is designed for full keyboard accessibility:

✅ **Tab Navigation**: Navigate all interactive elements
✅ **Focus Indicators**: 2px blue outline shows current focus
✅ **Semantic Markup**: Proper roles and labels for screen readers
✅ **Keyboard Shortcuts**: Quick access to common functions
✅ **Modal Focus Trapping**: Tab stays within dialogs
✅ **Escape to Close**: Standard behavior for modals

---

**Last Updated**: March 4, 2026
**Version**: Phase 3 Implementation
