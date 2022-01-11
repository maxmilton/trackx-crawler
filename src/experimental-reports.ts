export {};

document.addEventListener('securitypolicyviolation', (event) => {
  // Map keys to kebab case like a browser-sent CSP report
  // https://github.com/report-uri/report-uri-js/blob/5d15be34e6be5facecca2af4d1f562841cdd7fab/report-uri-js.js
  const reportKeys = {
    blockedURI: 'blocked-uri',
    columnNumber: 'column-number',
    disposition: 'disposition',
    documentURI: 'document-uri',
    effectiveDirective: 'effective-directive',
    lineNumber: 'line-number',
    originalPolicy: 'original-policy',
    referrer: 'referrer',
    sample: 'sample',
    sourceFile: 'source-file',
    statusCode: 'status-code',
    violatedDirective: 'violated-directive',
  } as const;
  const body = {};

  // eslint-disable-next-line guard-for-in
  for (const key in reportKeys) {
    // @ts-expect-error - TODO:!
    // eslint-disable-next-line
    body[reportKeys[key]] = event[key];
  }

  fetch('%API_ENDPOINT%/report', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': body,
    }),
  }).catch(console.error);
});

// https://developer.mozilla.org/en-US/docs/Web/API/ReportingObserver#browser_compatibility
if ('ReportingObserver' in globalThis) {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const observer = new ReportingObserver(
    (reports) => {
      fetch('%API_ENDPOINT%/report', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/reports+json' },
        body: JSON.stringify(reports),
      }).catch(console.error);
    },
    { buffered: true },
  );

  observer.observe();
}

const enum ReportTypes {
  Crash = 'crash',
  Deprecation = 'deprecation',
  Intervention = 'intervention',
}

interface CrashReportBody {
  [key: string]: any;
  crashId: string;
  reason?: string;
}

interface DeprecationReportBody {
  [key: string]: any;
  id: string;
  anticipatedRemoval?: Date;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface InterventionReportBody {
  [key: string]: any;
  id: string;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

type ReportBody =
  | CrashReportBody
  | DeprecationReportBody
  | InterventionReportBody;

interface Report {
  [key: string]: any;
  type: ReportTypes;
  url: string;
  body?: ReportBody;
}

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ReportingObserver
 * @see https://web.dev/reporting-observer/
 */
declare class ReportingObserver {
  constructor(
    callback: (reports: Report[], observer: ReportingObserver) => void,
    options?: { buffered?: boolean; types?: ReportTypes[] },
  );
  observe(): void;
  disconnect(): void;
  takeRecords(): Report[];
}
