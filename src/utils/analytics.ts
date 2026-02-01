type TrackParams = Record<string, string | number | boolean>;

const onceKeys = new Set<string>();
const throttles = new Map<string, number>();

function nowMs() {
  return Date.now();
}

export function trackEvent(name: string, params?: TrackParams) {
  try {
    // Electron only. Main process sanitizes event names and params.
    window.electron?.trackEvent?.(name, params);
  } catch {}
}

/**
 * Normalized "feature usage" event.
 *
 * NOTE: To analyze this in GA4, register an event-scoped custom dimension for
 * the parameter name `feature` (and optionally `context`).
 */
export function trackFeature(feature: string, params?: TrackParams) {
  trackEvent('feature_use', { feature: String(feature || '').slice(0, 120), ...(params || {}) });
}

export function trackFeatureOnce(feature: string, params?: TrackParams) {
  const key = `feature:${feature}`;
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  trackFeature(feature, { once: true, ...(params || {}) });
}

export function trackFeatureThrottled(feature: string, throttleMs: number, params?: TrackParams) {
  const key = `feature_throttle:${feature}`;
  const last = throttles.get(key) ?? 0;
  const n = nowMs();
  if (n - last < Math.max(0, throttleMs || 0)) return;
  throttles.set(key, n);
  trackFeature(feature, params);
}

