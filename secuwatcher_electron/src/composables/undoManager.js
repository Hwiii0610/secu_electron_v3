/**
 * Undo Manager Composable
 *
 * Provides basic undo functionality for masking operations
 * - Maintains an undo stack (max 20 entries)
 * - Each entry stores action type and state snapshot
 * - Supports undoing masking area changes and object selection/deselection
 * - Integrates with keyboard shortcuts (Ctrl+Z)
 *
 * @example
 * const undoManager = createUndoManager(detection);
 *
 * // Record an action
 * undoManager.recordMaskingChange('add', currentState);
 *
 * // Undo last action
 * undoManager.undo();
 *
 * // Check if undo is available
 * if (undoManager.canUndo()) {
 *   undoManager.undo();
 * }
 */

/**
 * Create an undo manager instance
 *
 * @param {Object} getDetectionStore - Function that returns the detection store
 * @returns {Object} Undo manager methods
 */
export function createUndoManager(getDetectionStore) {
  // Max undo stack size to prevent memory leaks
  const MAX_STACK_SIZE = 20;

  // Undo stack: stores action history
  let undoStack = [];

  /**
   * Create a snapshot of current masking state
   * @returns {Object} State snapshot
   */
  function createStateSnapshot() {
    const store = getDetectionStore();
    return {
      maskingLogs: JSON.parse(JSON.stringify(store.maskingLogs)),
      maskingLogsMap: JSON.parse(JSON.stringify(store.maskingLogsMap)),
      newMaskings: JSON.parse(JSON.stringify(store.newMaskings)),
      maskBiggestTrackId: store.maskBiggestTrackId,
    };
  }

  /**
   * Restore state from snapshot
   * @param {Object} snapshot - State snapshot to restore
   */
  function restoreStateSnapshot(snapshot) {
    const store = getDetectionStore();
    store.maskingLogs = snapshot.maskingLogs;
    store.maskingLogsMap = snapshot.maskingLogsMap;
    store.newMaskings = snapshot.newMaskings;
    store.maskBiggestTrackId = snapshot.maskBiggestTrackId;
  }

  /**
   * Record a masking change action
   * @param {string} actionType - Type of action: 'add', 'delete', 'modify'
   * @param {Object} [metadata] - Additional action metadata
   */
  function recordAction(actionType, metadata = {}) {
    const store = getDetectionStore();

    // Create undo entry
    const entry = {
      actionType,
      timestamp: Date.now(),
      stateBefore: createStateSnapshot(),
      metadata,
    };

    // Add to undo stack
    undoStack.push(entry);

    // Limit stack size
    if (undoStack.length > MAX_STACK_SIZE) {
      undoStack = undoStack.slice(-MAX_STACK_SIZE);
    }
  }

  /**
   * Record a masking area change
   * @param {string} changeType - 'add', 'delete', 'modify'
   * @param {Object} details - Details about the change
   */
  function recordMaskingChange(changeType, details = {}) {
    recordAction(`masking_${changeType}`, {
      changeType,
      ...details,
    });
  }

  /**
   * Record an object selection change
   * @param {string} changeType - 'select', 'deselect'
   * @param {string} objectId - ID of the object
   */
  function recordObjectSelectionChange(changeType, objectId) {
    recordAction(`object_${changeType}`, {
      objectId,
    });
  }

  /**
   * Undo the last recorded action
   * @returns {boolean} True if undo was successful
   */
  function undo() {
    if (!canUndo()) {
      console.log('[UndoManager] No actions to undo');
      return false;
    }

    const entry = undoStack.pop();
    if (!entry) return false;

    // Restore state from before the action
    restoreStateSnapshot(entry.stateBefore);

    // Dispatch event for UI update
    window.dispatchEvent(
      new CustomEvent('undo-completed', {
        detail: {
          actionType: entry.actionType,
          metadata: entry.metadata,
        },
      })
    );

    return true;
  }

  /**
   * Check if undo is available
   * @returns {boolean}
   */
  function canUndo() {
    return undoStack.length > 0;
  }

  /**
   * Get current undo stack size
   * @returns {number}
   */
  function getStackSize() {
    return undoStack.length;
  }

  /**
   * Clear undo stack
   */
  function clear() {
    undoStack = [];
  }

  /**
   * Get last action info (for debugging)
   * @returns {Object|null}
   */
  function getLastAction() {
    return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
  }

  /**
   * Get undo stack for debugging
   * @returns {Array}
   */
  function getStack() {
    return undoStack.map(entry => ({
      actionType: entry.actionType,
      timestamp: entry.timestamp,
      metadata: entry.metadata,
    }));
  }

  return {
    recordAction,
    recordMaskingChange,
    recordObjectSelectionChange,
    undo,
    canUndo,
    getStackSize,
    clear,
    getLastAction,
    getStack,
  };
}

/**
 * Create a global undo manager that can be used app-wide
 * @param {Object} getDetectionStore - Function that returns the detection store
 * @returns {Object} Global undo manager instance
 */
export function createGlobalUndoManager(getDetectionStore) {
  let instance = null;

  return {
    /**
     * Initialize the global undo manager
     */
    initialize() {
      if (!instance) {
        instance = createUndoManager(getDetectionStore);
      }
      return instance;
    },

    /**
     * Get the instance
     */
    getInstance() {
      return instance;
    },

    /**
     * Destroy the instance
     */
    destroy() {
      if (instance) {
        instance.clear();
        instance = null;
      }
    },
  };
}
