/**
 * Thin wrapper over the GA4 tag loaded in index.html. Safe to call anywhere:
 * off the live site (dev, tests, previews) gtag is a no-op queue.
 */

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const gtag = (...args: unknown[]) => {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') window.gtag(...args);
};

export function track(event: string, params: Params = {}) {
  gtag('event', event, params);
}

/** Same as track, but sent with the beacon transport so it survives the tab closing. */
export function trackOnExit(event: string, params: Params = {}) {
  gtag('event', event, { ...params, transport_type: 'beacon' });
}

export function setUserProps(props: Params) {
  gtag('set', 'user_properties', props);
}
