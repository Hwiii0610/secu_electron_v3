/**
 * 기하학 유틸리티
 */

/**
 * 점이 다각형 내부에 있는지 확인 (ray casting algorithm)
 *
 * @param {Object} point - { x, y }
 * @param {Array} polygonPoints - [{ x, y }, ...]
 * @returns {boolean}
 */
export function isPointInPolygon(point, polygonPoints) {
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 0.00001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 박스 객체를 문자열 형식으로 변환
 *
 * @param {Object} box - { x, y, w, h }
 * @returns {string} '[x1, y1, x2, y2]'
 */
export function getBBoxString(box) {
  const x1 = Math.round(box.x);
  const y1 = Math.round(box.y);
  const x2 = Math.round(box.x + box.w);
  const y2 = Math.round(box.y + box.h);
  return `[${x1}, ${y1}, ${x2}, ${y2}]`;
}
