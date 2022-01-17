import { globalAgent } from 'http';
import { request, RequestOptions } from 'https';
import {
  blue, dim, red, yellow,
} from 'kleur/colors';
import path from 'path';
import type { CrawlerConfig } from './types';

export const deferred = {
  $endpoint:
    process.env.API_ENDPOINT || 'https://api.trackx.app/v1/pt1ttp4y66n',

  get endpoint(): string {
    return this.$endpoint;
  },
  set endpoint(value: string) {
    this.$endpoint = value;
  },
};

export const logger = {
  /* eslint-disable no-console */
  error(this: void, ...args: unknown[]): void {
    console.error(red('✗ error '), ...args);
    process.exitCode = 1;
  },
  warn(this: void, ...args: unknown[]): void {
    console.warn(yellow('‼ warn  '), ...args);
  },
  log(this: void, ...args: unknown[]): void {
    console.log('◆ log   ', ...args);
  },
  info(this: void, ...args: unknown[]): void {
    console.info(blue('ℹ info  '), ...args);
  },
  debug(this: void, ...args: unknown[]): void {
    console.debug(dim('● debug '), ...args);
  },
  /* eslint-enable no-console */
};

export function getConfig(
  filepath: string,
): CrawlerConfig & { CONFIG_PATH: string } {
  const CONFIG_PATH = path.resolve(process.cwd(), filepath);
  // eslint-disable-next-line max-len
  // eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-dynamic-require, global-require
  const rawConfig = require(CONFIG_PATH) as CrawlerConfig;
  // Override config values with env vars
  for (const key of Object.keys(rawConfig)) {
    if (typeof process.env[key] !== 'undefined') {
      // @ts-expect-error - unavoidable string indexing
      rawConfig[key] = process.env[key];
    }
  }
  const rootDir = path.resolve(process.cwd(), rawConfig.ROOT_DIR || '.');

  deferred.endpoint = rawConfig.API_ENDPOINT;

  return {
    ...rawConfig,
    CONFIG_PATH,
    DB_PATH: path.resolve(rootDir, rawConfig.DB_PATH),
    DB_SQL_PATH: path.resolve(rootDir, rawConfig.DB_SQL_PATH),
  };
}

export function modifyCSPHeader(header: string, config: CrawlerConfig): string {
  let newHeader = header;

  const defaultSrcIndex = newHeader.indexOf('default-src');

  if (defaultSrcIndex !== -1) {
    // Add to existing default-src directive
    const nextSemiIndex = newHeader.indexOf(';', defaultSrcIndex);
    newHeader = `${newHeader.slice(
      0,
      nextSemiIndex !== -1 ? nextSemiIndex : undefined,
    )} ${new URL(config.API_ENDPOINT).origin}${
      nextSemiIndex !== -1 ? newHeader.slice(nextSemiIndex) : ''
    }`;
  }

  const connectSrcIndex = newHeader.indexOf('connect-src');

  if (connectSrcIndex !== -1) {
    // Add to existing connect-src directive
    const nextSemiIndex = newHeader.indexOf(';', connectSrcIndex);
    newHeader = `${newHeader.slice(
      0,
      nextSemiIndex !== -1 ? nextSemiIndex : undefined,
    )} ${new URL(config.API_ENDPOINT).origin}${
      nextSemiIndex !== -1 ? newHeader.slice(nextSemiIndex) : ''
    }`;
  }

  const reportUriIndex = newHeader.indexOf('report-uri');

  if (reportUriIndex === -1) {
    // Add new report-uri directive
    newHeader += `;report-uri ${config.API_ENDPOINT}/report`;
  } else {
    // Replace existing report-uri directive
    const nextSemiIndex = newHeader.indexOf(';', reportUriIndex);
    newHeader = `${newHeader.slice(0, reportUriIndex)}report-uri ${
      config.API_ENDPOINT
    }/report${nextSemiIndex !== -1 ? newHeader.slice(nextSemiIndex) : ''}`;
  }

  return newHeader;
}

/** @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Network_Error_Logging */
export function addNELHeader(): string {
  return JSON.stringify({
    report_to: 'default',
    max_age: 1800,
  });
}

/** @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expect-CT */
export function addExpectCTHeader(config: CrawlerConfig): string {
  return `max-age=1800, report-uri="${config.API_ENDPOINT}/report"`;
}

/** @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-to */
export function modifyReportToHeader(
  header: string,
  config: CrawlerConfig,
): string {
  return [
    JSON.stringify({
      max_age: 1800,
      endpoints: [{ url: `${config.API_ENDPOINT}/report` }],
      group: 'default',
    }),
    header,
  ].join(',');
}

export function modifyReportingEndpointsHeader(
  header: string,
  config: CrawlerConfig,
): string {
  if (header) {
    const defaultIndex = header.indexOf('default=');

    if (defaultIndex !== -1) {
      const nextCommaIndex = header.indexOf(',', defaultIndex);

      return `${header.slice(0, defaultIndex)}default=${
        config.API_ENDPOINT
      }/report${nextCommaIndex !== -1 ? header.slice(nextCommaIndex) : ''}`;
    }

    return `${header}, default="${config.API_ENDPOINT}/report"`;
  }

  return `default="${config.API_ENDPOINT}/report"`;
}

/**
 * Resolve a URL to its final form after following any redirects.
 *
 * Redirects are followed up to 10 times.
 */
export function resolveURL(url: string | URL): Promise<URL>;
export function resolveURL(
  url: string | URL,
  chain?: string[],
  method?: string,
): Promise<URL>;
export function resolveURL(
  url: string | URL,
  chain: string[] = [],
  method = 'HEAD',
): Promise<URL> {
  const parsed = new URL(url);
  chain.push(parsed.href);

  return new Promise((resolve, reject) => {
    if (chain.length > 10) {
      const error = new Error('Too many redirects');
      error.details = chain;
      reject(error);
      return;
    }

    const options: RequestOptions = {
      method,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36',
      },
    };
    if (parsed.protocol === 'http:') {
      options.agent = globalAgent;
    }

    request(parsed, options, (res) => {
      if (process.env.CRAWLER_DEBUG) {
        logger.debug(
          `[URL] HTTP ${method} ${String(res.statusCode)}`,
          parsed.href,
        );
      }

      // TODO: Prevent infinite redirect loop on 303/405 + GET
      //  ↳ Would have to compare the last request method, status, and URL
      //  ↳ Very unlikely to happen, so maybe don't handle it?
      if (
        !res.statusCode
        || res.statusCode < 200
        || (res.statusCode > 299
          && res.statusCode !== 301 // MOVED_PERMANENTLY
          && res.statusCode !== 302 // FOUND; temporary redirect
          && res.statusCode !== 303 // SEE_OTHER
          && res.statusCode !== 307 // TEMPORARY_REDIRECT
          && res.statusCode !== 308 // PERMANENT_REDIRECT
          && res.statusCode !== 405) // METHOD_NOT_ALLOWED
      ) {
        // As a last resort, try a GET request because some sites return a
        // different status for HEAD requests than GET requests.
        if (method === 'HEAD') {
          resolve(resolveURL(parsed, chain, 'GET'));
        } else {
          if (chain.length === 2) {
            const error = new Error(`HTTP ${String(res.statusCode)}`);
            error.details = parsed.href;
            reject(error);
          }
          resolve(parsed);
        }
        return;
      }

      if (
        (res.statusCode === 303 && !res.headers.location)
        || res.statusCode === 405
      ) {
        resolve(resolveURL(parsed, chain, 'GET'));
      }

      if (res.headers.location) {
        resolve(resolveURL(new URL(res.headers.location, parsed), chain));
      } else {
        resolve(parsed);
      }
    })
      .on('timeout', reject)
      .on('error', reject)
      .end();
  });
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
