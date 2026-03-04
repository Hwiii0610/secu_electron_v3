/**
 * 키보드 네비게이션 및 단축키 관리 유틸리티
 *
 * 애플리케이션 전역 키보드 이벤트 처리를 통합합니다.
 * - 메뉴 네비게이션 (Tab, 좌우 화살표)
 * - 모달 포커스 트래핑
 * - 단축키 바인딩 (Ctrl+O, Space 등)
 */

/**
 * 포커스 트래핑 관리자
 * 모달이 열려있을 때 Tab 키로 포커스를 모달 내부에만 유지합니다.
 */
export class FocusTrap {
  constructor(element) {
    this.element = element;
    this.focusableElements = [];
    this.firstElement = null;
    this.lastElement = null;
  }

  activate() {
    this.updateFocusableElements();
    this.element?.addEventListener('keydown', this.handleKeyDown.bind(this));
    // 포커스를 첫 번째 포커스 가능 요소로 이동
    this.firstElement?.focus();
  }

  deactivate() {
    this.element?.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  updateFocusableElements() {
    const focusableSelectors = [
      'button',
      '[href]',
      'input',
      'select',
      'textarea',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    this.focusableElements = Array.from(
      this.element?.querySelectorAll(focusableSelectors) || []
    ).filter(el => !el.hasAttribute('disabled'));

    this.firstElement = this.focusableElements[0];
    this.lastElement = this.focusableElements[this.focusableElements.length - 1];
  }

  handleKeyDown(event) {
    if (event.code !== 'Tab') return;

    if (event.shiftKey) {
      // Shift+Tab: 역방향
      if (document.activeElement === this.firstElement) {
        event.preventDefault();
        this.lastElement?.focus();
      }
    } else {
      // Tab: 정방향
      if (document.activeElement === this.lastElement) {
        event.preventDefault();
        this.firstElement?.focus();
      }
    }
  }
}

/**
 * 키보드 단축키 레지스트리
 * 애플리케이션 전역 단축키를 관리합니다.
 */
export class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
  }

  /**
   * 단축키 등록
   * @param {string} combo - 단축키 조합 (예: 'Ctrl+O', 'Space', 'Escape')
   * @param {Function} handler - 실행 함수
   * @param {Object} options - 옵션
   * @param {boolean} options.preventDefault - 기본 동작 방지
   * @param {boolean} options.checkInputFocus - 입력 요소 포커스 확인
   */
  register(combo, handler, options = {}) {
    const defaults = { preventDefault: true, checkInputFocus: true };
    const config = { ...defaults, ...options };
    this.shortcuts.set(combo, { handler, config });
  }

  /**
   * 단축키 해제
   */
  unregister(combo) {
    this.shortcuts.delete(combo);
  }

  /**
   * 모든 단축키 해제
   */
  clear() {
    this.shortcuts.clear();
  }

  /**
   * 키 이벤트 처리
   */
  handleKeyDown(event) {
    if (!this.enabled) return;

    const combo = this.getCombo(event);
    const shortcut = this.shortcuts.get(combo);

    if (!shortcut) return;

    const { checkInputFocus, preventDefault } = shortcut.config;

    // 입력 요소 포커스 확인
    if (checkInputFocus && this.isInputFocused()) return;

    if (preventDefault) {
      event.preventDefault();
    }

    shortcut.handler(event);
  }

  /**
   * 키 조합 문자열 생성
   */
  getCombo(event) {
    const keys = [];

    if (event.ctrlKey || event.metaKey) keys.push('Ctrl');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');

    keys.push(this.getKeyName(event.code));

    return keys.join('+');
  }

  /**
   * 키 이름 정규화
   */
  getKeyName(code) {
    const keyMap = {
      'Space': 'Space',
      'Escape': 'Escape',
      'Enter': 'Enter',
      'Tab': 'Tab',
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
    };

    if (keyMap[code]) return keyMap[code];

    // KeyX -> X, Digit1 -> 1
    return code.replace(/^(Key|Digit)/, '');
  }

  /**
   * 입력 요소가 포커스 상태인지 확인
   */
  isInputFocused() {
    const activeElement = document.activeElement;
    return !!(activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    ));
  }

  /**
   * 단축키 비활성화
   */
  disable() {
    this.enabled = false;
  }

  /**
   * 단축키 활성화
   */
  enable() {
    this.enabled = true;
  }
}

/**
 * 메뉴 네비게이션 관리자
 * 키보드로 메뉴 항목을 네비게이트합니다.
 */
export class MenuNavigation {
  constructor(menuSelector = '[role="menuitem"]') {
    this.menuSelector = menuSelector;
    this.menuItems = [];
    this.currentIndex = -1;
  }

  /**
   * 메뉴 초기화
   */
  initialize() {
    this.updateMenuItems();
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * 메뉴 정리
   */
  cleanup() {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * 메뉴 항목 목록 업데이트
   */
  updateMenuItems() {
    this.menuItems = Array.from(document.querySelectorAll(this.menuSelector));
  }

  /**
   * 키 이벤트 처리
   */
  handleKeyDown(event) {
    const activeElement = document.activeElement;
    const isMenuFocused = this.menuItems.includes(activeElement);

    if (!isMenuFocused) return;

    switch (event.code) {
      case 'ArrowRight':
        event.preventDefault();
        this.focusNext();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.focusPrev();
        break;
      case 'Home':
        event.preventDefault();
        this.focusFirst();
        break;
      case 'End':
        event.preventDefault();
        this.focusLast();
        break;
    }
  }

  /**
   * 다음 메뉴 항목에 포커스
   */
  focusNext() {
    const nextIndex = (this.currentIndex + 1) % this.menuItems.length;
    this.focusAt(nextIndex);
  }

  /**
   * 이전 메뉴 항목에 포커스
   */
  focusPrev() {
    const prevIndex = (this.currentIndex - 1 + this.menuItems.length) % this.menuItems.length;
    this.focusAt(prevIndex);
  }

  /**
   * 첫 번째 메뉴 항목에 포커스
   */
  focusFirst() {
    this.focusAt(0);
  }

  /**
   * 마지막 메뉴 항목에 포커스
   */
  focusLast() {
    this.focusAt(this.menuItems.length - 1);
  }

  /**
   * 지정된 인덱스의 메뉴 항목에 포커스
   */
  focusAt(index) {
    if (index < 0 || index >= this.menuItems.length) return;
    this.currentIndex = index;
    this.menuItems[index]?.focus();
  }
}

/**
 * 글로벌 키보드 매니저
 * 전체 애플리케이션의 키보드 네비게이션을 조율합니다.
 */
export function createKeyboardManager() {
  const shortcuts = new KeyboardShortcuts();
  const menuNav = new MenuNavigation();
  let focusTrap = null;

  return {
    shortcuts,
    menuNav,

    /**
     * 초기화
     */
    initialize() {
      menuNav.initialize();
      this.registerDefaultShortcuts();
    },

    /**
     * 정리
     */
    cleanup() {
      menuNav.cleanup();
      focusTrap?.deactivate();
      shortcuts.clear();
    },

    /**
     * 기본 단축키 등록
     */
    registerDefaultShortcuts() {
      // Escape: 모달/메뉴 닫기
      shortcuts.register('Escape', () => {
        this.closeAllModals();
      }, { preventDefault: false });
    },

    /**
     * 모든 모달 닫기
     */
    closeAllModals() {
      window.dispatchEvent(new CustomEvent('keyboard-close-all-modals'));
    },

    /**
     * 모달 포커스 트래핑 활성화
     */
    enableFocusTrap(element) {
      focusTrap?.deactivate();
      focusTrap = new FocusTrap(element);
      focusTrap.activate();
    },

    /**
     * 모달 포커스 트래핑 비활성화
     */
    disableFocusTrap() {
      focusTrap?.deactivate();
      focusTrap = null;
    },
  };
}

export default {
  FocusTrap,
  KeyboardShortcuts,
  MenuNavigation,
  createKeyboardManager,
};
