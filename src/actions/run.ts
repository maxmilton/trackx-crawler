/* eslint-disable no-plusplus */

import colors from 'kleur';
import { firefox, type Page, type Route } from 'playwright-firefox';
import { connectDB } from '../db';
import type { CrawlerConfig, GlobalOptions } from '../types';
import {
  addExpectCTHeader,
  addNELHeader,
  getConfig,
  logger,
  modifyCSPHeader,
  modifyReportingEndpointsHeader,
  modifyReportToHeader,
  resolveURL,
} from '../utils';

// These resource types can still trigger a CSP violation etc. They should only
// be blocked when saving bandwidth is deemed more important and capturing all
// errors and browser reports.
// eslint-disable-next-line unicorn/prefer-set-has
const RESOURCE_EXCLUSTIONS = ['image', 'stylesheet', 'media', 'font', 'other'];

function routeHandler(page: Page, config: CrawlerConfig, opts: RunOptions) {
  return async (route: Route) => {
    try {
      const request = route.request();
      const type = request.resourceType();

      if (opts.block && RESOURCE_EXCLUSTIONS.includes(type)) {
        await route.abort();
        return;
      }

      if (type !== 'document' && type !== 'script' && type !== 'stylesheet') {
        await route.continue();
        return;
      }

      const response = await page.request.fetch(request, {
        timeout: opts.timeout * 1000,
      });
      const headers = response.headers();

      if (headers['content-security-policy']) {
        headers['content-security-policy'] = modifyCSPHeader(
          headers['content-security-policy'],
          config,
        );
      }
      if (headers['content-security-policy-report-only']) {
        headers['content-security-policy-report-only'] = modifyCSPHeader(
          headers['content-security-policy-report-only'],
          config,
        );
      }

      headers['expect-ct'] = addExpectCTHeader(config);
      headers.nel = addNELHeader();
      headers['report-to'] = modifyReportToHeader(headers['report-to'], config);
      headers['reporting-endpoints'] = modifyReportingEndpointsHeader(
        headers['reporting-endpoints'],
        config,
      );

      await route.fulfill({ response, headers });
    } catch (error) {
      logger.warn(error);
      await route.continue();
    }
  };
}

function randomItem<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

async function followLink(
  page: Page,
  seen: string[],
  incrementPageCount: () => void,
): Promise<boolean> {
  const currentURL = new URL(page.url());
  seen.push(currentURL.origin + currentURL.pathname);

  const links = page.locator('a:visible');
  const validLinks = [];
  const count = await links.count();

  if (count === 0) return false;

  const validIndexes = await links.evaluateAll(
    // eslint-disable-next-line unicorn/no-array-reduce
    (list, _seen) => list.reduce((acc, item, index) => {
      const href = item.getAttribute('href');

      if (href) {
        const linkURL = new URL(href, window.location.href);

        if (
          linkURL.origin === window.location.origin
            && !linkURL.hash
            && href !== '#'
            && !_seen.includes(linkURL.origin + linkURL.pathname)
            && (linkURL.protocol === 'https:' || linkURL.protocol === 'http:')
            // @ts-expect-error - FIXME:!
            && item.target !== '_blank'
            && item.getAttribute('role') !== 'button'
        ) {
          acc.push(index);
        }
      }

      return acc;
    }, [] as number[]),
    seen,
  );

  for (let index = 0; index < count; index++) {
    if (validIndexes.includes(index)) {
      validLinks.push(links.nth(index));
    }
  }

  if (validLinks.length === 0) return false;

  // FIXME: Handle links which are no longer valid; retry click on a different link

  // TODO: Should we track which pages have been visited and avoid visiting again?

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      randomItem(validLinks).click({ force: true }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      logger.warn(error.name, error.message);
    } else {
      logger.error(error);
      return false;
    }
  }

  incrementPageCount();
  return true;
}

interface Site {
  id: number;
  url: string;
}

interface RunOptions extends GlobalOptions {
  readonly block: boolean;
  readonly debug: boolean | undefined;
  readonly depth: number;
  readonly max: number;
  readonly order: string;
  readonly parallel: number;
  readonly restart: boolean;
  readonly timeout: number;
}

export default async function action(opts: RunOptions): Promise<void> {
  let shouldExit = false;

  if (opts.debug !== undefined) {
    if (typeof opts.debug !== 'boolean') {
      logger.error('Debug must be a boolean');
      shouldExit = true;
    } else if (opts.debug) {
      process.env.CRAWLER_DEBUG = '1';
    }
  }
  if (!Number.isInteger(opts.depth) || opts.depth < 0) {
    logger.error('Depth must be a number greater than or equal to 0');
    shouldExit = true;
  }
  if (!Number.isInteger(opts.max) || opts.max < 1) {
    logger.error('Max must be a number greater than 0');
    shouldExit = true;
  }
  if (!Number.isInteger(opts.timeout) || opts.timeout < 0) {
    logger.error('Timeout must be a number greater than or equal to 0');
    shouldExit = true;
  }
  if (!Number.isInteger(opts.parallel) || opts.parallel < 1) {
    logger.error('Parallel must be a number greater than 0');
    shouldExit = true;
  }
  if (opts.block !== undefined && typeof opts.block !== 'boolean') {
    logger.error('Block must be a boolean');
    shouldExit = true;
  }
  if (opts.restart !== undefined && typeof opts.restart !== 'boolean') {
    logger.error('Restart must be a boolean');
    shouldExit = true;
  }
  if (opts.order !== 'asc' && opts.order !== 'random') {
    logger.error('Order must be "asc" or "random"');
    shouldExit = true;
  }
  if (shouldExit) process.exit(1);

  const config = getConfig(opts.config);
  const db = connectDB(config);

  const getValidSiteCountStmt = db
    .prepare('SELECT COUNT(*) FROM site WHERE handled = 0')
    .pluck();
  const addRunStmt = db.prepare(
    "INSERT INTO run(ts_start, options) VALUES(datetime('now'), ?)",
  );
  const setRunErrorStmt = db.prepare('UPDATE run SET error = 1 WHERE id = ?');
  const updateRunSiteCountStmt = db.prepare(
    'UPDATE run SET site_count = site_count + 1 WHERE id = ?',
  );
  const updateRunPageCountStmt = db.prepare(
    'UPDATE run SET page_count = page_count + 1 WHERE id = ?',
  );
  const updateRunSkippedCountStmt = db.prepare(
    'UPDATE run SET skipped_count = skipped_count + 1 WHERE id = ?',
  );
  const updateRunEndStmt = db.prepare(
    "UPDATE run SET ts_end = datetime('now') WHERE id = ?",
  );
  const resetSites = db.prepare(
    'UPDATE site SET handled = 0, error = 0, resolved = NULL',
  );
  const getSitesStmt = db.prepare(
    opts.order === 'random'
      ? 'SELECT id, url FROM site WHERE handled = 0 ORDER BY RANDOM() LIMIT 100'
      : 'SELECT id, url FROM site WHERE handled = 0 LIMIT 100',
  );
  const setSiteHandledStmt = db.prepare(
    'UPDATE site SET handled = 1 WHERE id = ?',
  );
  const setSiteErrorStmt = db.prepare('UPDATE site SET error = 1 WHERE id = ?');
  const setSiteResolvedStmt = db.prepare(
    'UPDATE site SET resolved = ? WHERE id = ?',
  );

  const runId = addRunStmt.run(
    JSON.stringify({
      API_ENDPOINT: config.API_ENDPOINT,
      config: opts.config,
      debug: opts.debug,
      depth: opts.depth,
      max: opts.max,
      order: opts.order,
      parallel: opts.parallel,
      restart: opts.restart,
      timeout: opts.timeout,
    }),
  ).lastInsertRowid;

  function incrementPageCount() {
    updateRunPageCountStmt.run(runId);
  }

  function onFatalError() {
    setRunErrorStmt.run(runId);
  }

  process.on('uncaughtExceptionMonitor', onFatalError);
  process.on('unhandledRejection', onFatalError);

  if (opts.restart) {
    resetSites.run();
  }

  const siteCount = getValidSiteCountStmt.get() as number;

  if (siteCount === 0) {
    logger.error('No unvisited sites found in database');
    process.exit(1);
  } else if (siteCount < opts.max) {
    logger.warn(
      `Only ${siteCount} unvisited sites, but max is set to ${opts.max}`,
    );
  }

  const clientCode = process.env.TRACKX_CODE!.replace(
    '%API_ENDPOINT%',
    config.API_ENDPOINT,
  );

  // const browser = await chromium.launch({
  const browser = await firefox.launch({
    headless: !opts.debug,
    // devtools: Boolean(opts.debug), // Chrome only

    firefoxUserPrefs: {
      // block audio and video autoplay
      'media.autoplay.block-event.enabled': true,
      'media.autoplay.block-webaudio': true,
      'media.autoplay.blocking_policy': 2,
      'media.autoplay.default': 5,
      // disable loading images
      'permissions.default.image': 2,
      // enable Report-To header support
      // https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API#browser_compatibility
      'dom.reporting.header.enabled': true,
    },
  });
  const context = await browser.newContext({
    // bypassCSP: true,
    reducedMotion: 'reduce',
    // Set location to Tokyo, Japan
    geolocation: {
      latitude: 35.689_487,
      longitude: 139.691_706,
    },
  });

  context.setDefaultNavigationTimeout(opts.timeout * 1000);
  // Playwright router can't intercept service worker requests so disable them
  // @ts-expect-error - force disable SW
  await context.addInitScript(() => delete window.navigator.serviceWorker);

  async function goto(site: Site): Promise<void> {
    let resolved;

    try {
      const colonIndex = site.url.indexOf(':');
      resolved = await resolveURL(
        colonIndex === -1 || colonIndex > 5 ? `http://${site.url}` : site.url,
      );
    } catch (error) {
      if (
        error instanceof Error
        && (error.message.startsWith('HTTP ')
          || error.message === 'Too many redirects')
      ) {
        logger.warn(error.message, error.details);
      } else {
        logger.warn(error);
      }

      // Throw so we can catch it to count skipped sites
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw null;
    }

    setSiteResolvedStmt.run(String(resolved), site.id);

    const page = await context.newPage();

    page.on('crash', (crashedPage) => {
      throw new Error(`Page crashed: ${crashedPage.url()}`);
    });
    if (opts.verbose || opts.debug) {
      page.on('pageerror', (err) => {
        logger.error(colors.red('Page Error:'), err);
      });
      page.on('console', (msg) => {
        const loc = msg.location();
        logger.log(
          colors.dim(
            `${loc.url || page.url()}:${loc.lineNumber}:${
              loc.columnNumber
            } [${msg.type()}]`,
          ),
          msg.text(),
        );
      });
    }

    // https://playwright.dev/docs/next/network/#modify-responses
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    await page.route(() => true, routeHandler(page, config, opts));

    await page.addInitScript(clientCode.replace('%WEBSITE%', site.url));

    try {
      await page.goto(String(resolved), {
        waitUntil: 'networkidle',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        logger.warn(error.name, error.message);
      } else {
        await page.close();
        throw error;
      }
    }

    incrementPageCount();

    if (opts.depth > 1) {
      let remainingDepth = opts.depth;

      try {
        const seen: string[] = [];

        while (
          --remainingDepth
          // eslint-disable-next-line no-await-in-loop
          && (await followLink(page, seen, incrementPageCount))
        );
      } catch (error) {
        if (remainingDepth === opts.depth - 1) {
          throw error;
        }
        logger.warn(error);
      }
    }

    await page.close();
  }

  const queue: Site[] = [];
  let handled = 0;
  let skipped = 0;

  const enqueue = () => {
    const sites = getSitesStmt.all() as Site[];

    if (sites.length > 0) {
      queue.push(...sites);
    }
  };

  const takeSite = async () => {
    // if (handled + 1 >= opts.max) return;
    if (handled + 1 > opts.max) return;
    handled++;

    if (queue.length === 0) {
      enqueue();
    }

    const site = queue.shift();

    if (site) {
      setSiteHandledStmt.run(site.id);
      updateRunSiteCountStmt.run(runId);

      logger.info(
        colors.green('[+]'),
        colors.yellow(`${handled}/${opts.max}`),
        site.url,
      );

      try {
        await goto(site);
      } catch (error) {
        if (error) logger.error(error);
        setSiteErrorStmt.run(site.id);
        updateRunSkippedCountStmt.run(runId);
        skipped++;
      }
    }

    await takeSite();
  };

  await Promise.all(
    Array.from({ length: opts.parallel }).map(() => takeSite()),
  );
  await browser.close();
  updateRunEndStmt.run(runId);

  logger.info('Done!', 'Visited:', handled, 'Skipped:', skipped);
}
