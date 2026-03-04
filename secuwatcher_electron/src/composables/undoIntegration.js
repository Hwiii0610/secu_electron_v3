/**
 * Undo Integration with Keyboard Shortcuts
 *
 * Integrates the undo manager with the keyboard shortcut system
 * to enable Ctrl+Z (Cmd+Z on Mac) for undo functionality
 */

import { createUndoManager } from './undoManager.js';
import { KeyboardShortcuts } from '../utils/keyboard.js';

/**
 * Create integrated undo with keyboard shortcuts
 * @param {Object} getDetectionStore - Function that returns the detection store
 * @returns {Object} Integrated undo manager with keyboard shortcuts
 */
export function createUndoWithKeyboardShortcuts(getDetectionStore) {
  const undoManager = createUndoManager(getDetectionStore);
  const shortcuts = new KeyboardShortcuts();

  /**
   * Initialize keyboard shortcuts for undo
   */
  function initialize() {
    // Register Ctrl+Z (or Cmd+Z on Mac) for undo
    shortcuts.register('Ctrl+Z', () => {
      performUndo();
    }, {
      preventDefault: true,
      checkInputFocus: true,
    });

    // Attach global keyboard listener
    document.addEventListener('keydown', (event) => {
      shortcuts.handleKeyDown(event);
    });
  }

  /**
   * Perform undo operation
   */
  function performUndo() {
    if (undoManager.undo()) {
      // Show toast notification
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: {
            message: 'Undo completed',
            type: 'success',
          },
        })
      );
    } else {
      // Show toast notification that there's nothing to undo
      window.dispatchEvent(
        new CustomEvent('show-toast', {
          detail: {
            message: 'Nothing to undo',
            type: 'info',
          },
        })
      );
    }
  }

  /**
   * Cleanup resources
   */
  function cleanup() {
    shortcuts.clear();
    document.removeEventListener('keydown', (event) => {
      shortcuts.handleKeyDown(event);
    });
  }

  return {
    undoManager,
    shortcuts,
    initialize,
    performUndo,
    cleanup,
  };
}

/**
 * Create a global undo system for the app
 * Call this once in App.vue mounted/setup
 */
export let globalUndoSystem = null;

export function initializeGlobalUndoSystem(getDetectionStore) {
  if (!globalUndoSystem) {
    globalUndoSystem = createUndoWithKeyboardShortcuts(getDetectionStore);
    globalUndoSystem.initialize();
  }
  return globalUndoSystem;
}

export function getGlobalUndoSystem() {
  return globalUndoSystem;
}

export function cleanupGlobalUndoSystem() {
  if (globalUndoSystem) {
    globalUndoSystem.cleanup();
    globalUndoSystem = null;
  }
}
