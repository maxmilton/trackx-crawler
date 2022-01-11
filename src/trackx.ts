/* eslint-disable no-param-reassign */

import * as trackx from 'trackx/modern';
import './experimental-reports';

// Increase max stack frames
Error.stackTraceLimit = 40;

trackx.setup('%API_ENDPOINT%', (payload, reason) => {
  if (!payload.meta.details && reason != null && typeof reason === 'object') {
    const details: Record<string, unknown> = {};

    // eslint-disable-next-line guard-for-in
    for (const key in reason) {
      details[key] = (reason as Record<string, unknown>)[key] ?? null;
    }

    payload.meta.details = Object.keys(details).length > 0 ? details : '';
  }

  payload.meta.ctor ??= (() => {
    try {
      // @ts-expect-error - access in try/catch for safety
      return reason.constructor.name; // eslint-disable-line
    } catch {
      return '';
    }
  })();
  payload.meta.proto ??= Object.prototype.toString.call(reason);

  return payload;
});

trackx.ping();

trackx.meta.agent = 'trackx-crawler';
trackx.meta.release = process.env.APP_RELEASE;
trackx.meta.website = '%WEBSITE%';
trackx.meta.title = document.title;
trackx.meta.referrer = document.referrer;
const ancestors = globalThis.location.ancestorOrigins;
trackx.meta.ancestors = (ancestors?.length && [...ancestors]) || '';
trackx.meta.embedded = (() => {
  try {
    return window.frameElement?.nodeName;
  } catch {
    // SecurityError when parent is cross-origin
    return 'cross-origin';
  }
})() || '';

if (process.env.NODE_ENV !== 'production') {
  trackx.meta.NODE_ENV = process.env.NODE_ENV || 'NULL';
}
