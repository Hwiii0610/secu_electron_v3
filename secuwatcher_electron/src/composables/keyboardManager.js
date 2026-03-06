/**
 * 키보드 단축키 관리 컴포저블
 *
 * TopMenuBar의 handleGlobalShortcuts 로직을 추출하여
 * 전역 키보드 이벤트를 관리합니다.
 *
 * @param {Object} deps
 * @param {Object} deps.menuHandler - { handleMenuItemClick(item) }
 */

export function createKeyboardManager(deps) {
  const { menuHandler } = deps;

  // 단축키 매핑 맵
  const keyboardMap = {
    'KeyO': '자동객체탐지',           // Ctrl+O (레거시 자동탐지)
    'Shift+KeyA': '자동객체탐지',     // Ctrl+Shift+A
    'Shift+KeyS': '선택객체탐지',     // Ctrl+Shift+S
    'KeyM': '수동 마스킹',             // Ctrl+M
    'Alt+KeyM': '전체마스킹',          // Ctrl+Alt+M
    'KeyP': '미리보기',               // Ctrl+P
    'KeyE': '내보내기',               // Ctrl+E
    'KeyB': '일괄처리',               // Ctrl+B
    'Comma': '설정',                   // Ctrl+,
  };

  /**
   * 전역 키다운 이벤트 핸들러
   * @param {KeyboardEvent} event
   */
  function handleGlobalShortcuts(event) {
    // Ctrl 또는 Cmd 키가 눌려있지 않으면 무시
    if (!event.ctrlKey && !event.metaKey) return;

    // Shift, Alt와 조합된 키 생성
    const key = event.shiftKey ? `Shift+${event.code}` :
                event.altKey ? `Alt+${event.code}` : event.code;

    // 맵에서 해당 메뉴 ID 찾기
    const menuId = keyboardMap[key];
    if (menuId) {
      event.preventDefault();
      menuHandler.handleMenuItemClick(menuId);
    }
  }

  /**
   * 키보드 이벤트 리스너 초기화
   */
  function initKeyboard() {
    window.addEventListener('keydown', handleGlobalShortcuts);
  }

  /**
   * 키보드 이벤트 리스너 정리
   */
  function destroyKeyboard() {
    window.removeEventListener('keydown', handleGlobalShortcuts);
  }

  return {
    initKeyboard,
    destroyKeyboard,
  };
}
