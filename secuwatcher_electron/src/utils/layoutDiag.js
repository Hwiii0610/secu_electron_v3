/**
 * Layout Diagnostic Utility for SecuWatcher
 *
 * 사용법 1: Electron DevTools 콘솔에서 실행
 *   - import('/src/utils/layoutDiag.js').then(m => m.runDiag())
 *
 * 사용법 2: 앱 내에서 Ctrl+Shift+D 로 오버레이 토글
 */

const LAYOUT_SELECTORS = [
  '.container',
  '.app-layout',
  '.sidebar',
  '.main-area',
  '.context-bar',
  '.video-wrapper',
  '.file-panel-container',
  '.floating-control-bar',
  '.file-actions',
  '.file-container',
  '.empty-state',
  '.file-panel-header',
  '.file-info-body',
];

/**
 * 주요 레이아웃 요소의 위치/크기 정보를 수집하여 텍스트로 출력
 */
export function runDiag() {
  const results = [];
  results.push('=== SecuWatcher Layout Diagnostic ===');
  results.push(`Viewport: ${window.innerWidth}x${window.innerHeight}`);
  results.push('');

  for (const selector of LAYOUT_SELECTORS) {
    const els = document.querySelectorAll(selector);
    if (els.length === 0) continue;

    els.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const suffix = els.length > 1 ? `[${i}]` : '';

      results.push(`${selector}${suffix}`);
      results.push(`  rect: ${Math.round(rect.left)},${Math.round(rect.top)} → ${Math.round(rect.right)},${Math.round(rect.bottom)} (${Math.round(rect.width)}×${Math.round(rect.height)})`);
      results.push(`  display:${cs.display} position:${cs.position} z:${cs.zIndex} overflow:${cs.overflow}`);

      if (cs.position === 'absolute' || cs.position === 'fixed') {
        results.push(`  offsets: T:${cs.top} R:${cs.right} B:${cs.bottom} L:${cs.left}`);
      }

      if (cs.display === 'grid') {
        results.push(`  grid: cols=${cs.gridTemplateColumns} rows=${cs.gridTemplateRows}`);
      }
      if (cs.display === 'flex') {
        results.push(`  flex: dir=${cs.flexDirection} gap=${cs.gap}`);
      }

      results.push(`  padding: ${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`);
      results.push(`  margin: ${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`);
      results.push(`  visible: ${cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0}`);
      results.push('');
    });
  }

  // 겹침 감지
  results.push('=== Overlap Detection ===');
  const visibleEls = [];
  for (const selector of LAYOUT_SELECTORS) {
    document.querySelectorAll(selector).forEach(el => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display !== 'none' && rect.width > 0 && rect.height > 0) {
        visibleEls.push({ selector, rect, el });
      }
    });
  }

  let overlapCount = 0;
  for (let i = 0; i < visibleEls.length; i++) {
    for (let j = i + 1; j < visibleEls.length; j++) {
      const a = visibleEls[i].rect;
      const b = visibleEls[j].rect;

      // 부모-자식 관계면 건너뜀
      if (visibleEls[i].el.contains(visibleEls[j].el) || visibleEls[j].el.contains(visibleEls[i].el)) continue;

      const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

      if (overlapX > 2 && overlapY > 2) {
        results.push(`⚠️ ${visibleEls[i].selector} ↔ ${visibleEls[j].selector}: ${Math.round(overlapX)}×${Math.round(overlapY)}px overlap`);
        overlapCount++;
      }
    }
  }

  if (overlapCount === 0) {
    results.push('✅ No overlaps detected');
  }

  const output = results.join('\n');
  console.log(output);
  return output;
}

/**
 * 디버그 오버레이 토글 — 모든 레이아웃 요소에 컬러 보더 표시
 */
let overlayActive = false;
const overlayStyles = new Map();

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F8C471',
];

export function toggleOverlay() {
  overlayActive = !overlayActive;

  if (overlayActive) {
    LAYOUT_SELECTORS.forEach((selector, idx) => {
      document.querySelectorAll(selector).forEach(el => {
        const color = COLORS[idx % COLORS.length];
        overlayStyles.set(el, {
          outline: el.style.outline,
          outlineOffset: el.style.outlineOffset,
        });
        el.style.outline = `2px solid ${color}`;
        el.style.outlineOffset = '-1px';

        // 라벨 추가 — fixed로 배치하여 부모 스크롤에 영향 없음
        const label = document.createElement('div');
        label.className = '__diag-label';
        label.textContent = selector;
        const elRect = el.getBoundingClientRect();
        label.style.cssText = `
          position:fixed; top:${elRect.top}px; left:${elRect.left}px; z-index:99999;
          background:${color}; color:#000; font-size:9px;
          padding:1px 4px; font-family:monospace; pointer-events:none;
          line-height:1.3; white-space:nowrap; max-width:${elRect.width}px; overflow:hidden;
        `;
        document.body.appendChild(label);
      });
    });
    console.log('🔍 Layout debug overlay ON — Ctrl+Shift+D to toggle');
  } else {
    // 제거
    overlayStyles.forEach((orig, el) => {
      el.style.outline = orig.outline;
      el.style.outlineOffset = orig.outlineOffset;
    });
    overlayStyles.clear();
    document.querySelectorAll('.__diag-label').forEach(l => l.remove());
    console.log('Layout debug overlay OFF');
  }
}

/**
 * 단일 요소 진단 — DevTools 콘솔에서 diag($0) 으로 사용
 * 선택한 요소 + 부모 체인 + 자식 요소 정보를 한번에 출력
 */
export function inspectElement(el) {
  if (!el) { console.log('❌ No element. Usage: diag($0)'); return; }

  const lines = [];
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);

  // 선택자 추정
  const sel = el.id ? `#${el.id}` : el.className
    ? '.' + [...el.classList].join('.')
    : el.tagName.toLowerCase();

  lines.push(`━━━ ${sel} (${el.tagName.toLowerCase()}) ━━━`);
  lines.push(`rect: ${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} (${Math.round(r.width)}×${Math.round(r.height)})`);
  lines.push(`display:${cs.display} position:${cs.position} z:${cs.zIndex} overflow:${cs.overflow}`);

  if (cs.position === 'absolute' || cs.position === 'fixed') {
    lines.push(`offsets: T:${cs.top} R:${cs.right} B:${cs.bottom} L:${cs.left}`);
  }
  if (cs.display === 'grid') lines.push(`grid: cols=${cs.gridTemplateColumns} rows=${cs.gridTemplateRows}`);
  if (cs.display === 'flex') lines.push(`flex: dir=${cs.flexDirection} gap=${cs.gap}`);

  lines.push(`padding: ${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`);
  lines.push(`margin: ${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`);
  lines.push(`bg: ${cs.backgroundColor}  border: ${cs.borderTop}`);

  // 부모 체인 (3단계)
  lines.push('');
  lines.push('── parent chain ──');
  let p = el.parentElement;
  for (let depth = 0; p && depth < 3; depth++) {
    const pr = p.getBoundingClientRect();
    const pcs = getComputedStyle(p);
    const psel = p.id ? `#${p.id}` : p.className
      ? '.' + [...p.classList].join('.')
      : p.tagName.toLowerCase();
    lines.push(`↑ ${psel} (${Math.round(pr.width)}×${Math.round(pr.height)}) display:${pcs.display} position:${pcs.position} overflow:${pcs.overflow}`);
    p = p.parentElement;
  }

  // 직계 자식 (최대 8개)
  const children = [...el.children].slice(0, 8);
  if (children.length > 0) {
    lines.push('');
    lines.push('── children ──');
    children.forEach(ch => {
      const cr = ch.getBoundingClientRect();
      const ccs = getComputedStyle(ch);
      const csel = ch.className
        ? '.' + [...ch.classList].join('.')
        : ch.tagName.toLowerCase();
      const vis = ccs.display !== 'none' && cr.width > 0;
      lines.push(`↓ ${csel} (${Math.round(cr.width)}×${Math.round(cr.height)}) display:${ccs.display} ${vis ? '' : '[HIDDEN]'}`);
    });
  }

  const output = lines.join('\n');
  console.log(output);
  return output;
}

/**
 * 리사이즈 모드 — 요소를 드래그로 크기 조절 가능하게 만듦
 * 사용법: resize($0) 또는 resize(document.querySelector('.file-panel-container'))
 * 조절 후 최종 크기가 콘솔에 출력됨
 */
let resizeObserver = null;

export function enableResize(el) {
  if (!el) { console.log('❌ No element. Usage: resize($0)'); return; }

  const origOverflow = el.style.overflow;
  el.style.overflow = 'auto';
  el.style.resize = 'both';
  el.style.outline = '2px dashed #3A82C4';
  el.style.outlineOffset = '-2px';
  el.style.cursor = 'nwse-resize';

  // 사이즈 변경 감시
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      console.log(`📐 ${Math.round(width)}×${Math.round(height)}px`);
    }
  });
  resizeObserver.observe(el);

  const sel = el.id ? `#${el.id}` : el.className
    ? '.' + [...el.classList].join('.') : el.tagName;
  console.log(`✅ ${sel} — 모서리를 드래그하여 크기 조절 가능. noresize($0) 으로 해제`);
}

export function disableResize(el) {
  if (!el) return;
  el.style.resize = 'none';
  el.style.outline = '';
  el.style.outlineOffset = '';
  el.style.cursor = '';
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  console.log('리사이즈 모드 해제');
}

/**
 * 파일패널 너비 즉시 테스트 — setPanel(400) 형태로 사용
 */
export function setPanel(width) {
  const el = document.querySelector('.file-panel-container');
  if (!el) { console.log('❌ .file-panel-container not found'); return; }
  el.style.width = width + 'px';
  console.log(`📐 file-panel-container → ${width}px`);
}

// 전역 등록: DevTools 콘솔에서 즉시 사용
if (typeof window !== 'undefined') {
  window.diag = inspectElement;
  window.diagAll = runDiag;
  window.resize = enableResize;
  window.noresize = disableResize;
  window.setPanel = setPanel;
}

// Ctrl+Shift+D 단축키 등록
if (typeof window !== 'undefined') {
  window.__diagCleanup?.();

  const handler = (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
      e.preventDefault();
      toggleOverlay();
    }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
      e.preventDefault();
      runDiag();
    }
  };
  window.addEventListener('keydown', handler);
  window.__diagCleanup = () => window.removeEventListener('keydown', handler);
}
