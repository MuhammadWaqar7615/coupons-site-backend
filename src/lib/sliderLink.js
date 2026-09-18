export function normalizeSliderLink(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || '#';
}
