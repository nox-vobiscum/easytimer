export const SAFE_PREVIEW_ELEMENTS = Object.freeze(new Set([
  "P",
  "BR",
  "STRONG",
  "EM",
  "UL",
  "OL",
  "LI",
  "A"
]));

export function normalizeSafePreviewHref(rawHref) {
  if (typeof rawHref !== "string" || rawHref !== rawHref.trim() || !/^https?:\/\//i.test(rawHref)) return null;
  try {
    const url = new URL(rawHref);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
