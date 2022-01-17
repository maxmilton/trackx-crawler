export {};

document.addEventListener('securitypolicyviolation', (event) => {
  const reportKeys = [
    'blockedURI',
    'columnNumber',
    'disposition',
    'documentURI',
    'effectiveDirective',
    'lineNumber',
    'originalPolicy',
    'referrer',
    'sample',
    'sourceFile',
    'statusCode',
    'violatedDirective',
  ] as const;
  const body: Record<string, unknown> = {};

  for (const key of reportKeys) {
    body[key] = event[key];
  }

  fetch('%API_ENDPOINT%/report', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/reports+json' },
    body: JSON.stringify([
      {
        body,
        type: 'csp-violation',
        url: window.location.href,
      },
    ]),
  }).catch(console.error);
});

// https://developer.mozilla.org/en-US/docs/Web/API/ReportingObserver
// https://web.dev/reporting-observer/

if ('ReportingObserver' in globalThis) {
  // @ts-expect-error - still too new
  // eslint-disable-next-line
  const observer = new ReportingObserver(
    (reports: any) => {
      fetch('%API_ENDPOINT%/report', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/reports+json' },
        body: JSON.stringify(reports),
      }).catch(console.error);
    },
    { buffered: true },
  );

  // eslint-disable-next-line
  observer.observe();
}
