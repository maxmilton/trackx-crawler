import sade from 'sade';
import * as trackx from 'trackx/node';
import check from './actions/check';
import importSites from './actions/import-sites';
import run from './actions/run';
import { deferred } from './utils';

trackx.setup(deferred.endpoint, (data, reason) => {
  if (reason instanceof Error) {
    // eslint-disable-next-line no-param-reassign
    data.meta.details ??= reason.details;
  }
  // Strip out logger decorations
  // eslint-disable-next-line no-control-regex, no-param-reassign
  data.message = data.message.replace(/^\u001B\[\d\dm.{8}\u001B\[39m,/, '');
  return data;
});
trackx.meta.release = process.env.APP_RELEASE;
trackx.meta.NODE_ENV = process.env.NODE_ENV || 'NULL';
trackx.ping();

if (process.env.NODE_ENV !== 'production') {
  Error.stackTraceLimit = 40;
}

const prog = sade('txc');

prog
  .version(process.env.APP_RELEASE!)
  .option(
    '-c, --config',
    'Use specified configuration file',
    process.env.CONFIG_PATH || 'crawler.config.json',
  )
  .option('-V, --verbose', 'Show verbose output');

prog
  .command('check')
  .describe('Check configuration and database health.')
  .example('check')
  .action(check);

prog
  .command('import <filepath>')
  .describe(
    'Import a newline separated list of websites to crawl. Duplicates are ignored.',
  )
  .option('-o, --overwrite', 'Overwrite existing sites', false)
  .example('import ./sites.txt')
  .action(importSites);

prog
  .command('run')
  .describe('Run a new site crawl.')
  .option(
    '--browser',
    "Browser to use for crawling, can be 'chromium', 'firefox', or 'webkit'",
    'firefox',
  )
  .option(
    '-d, --depth',
    'Try follow a same-origin link picked at random, a number of times',
    0,
  )
  .option(
    '-m, --max',
    'Maximum number of websites to crawl this run',
    Number.POSITIVE_INFINITY,
  )
  .option(
    '-b, --block',
    'Block downloading data heavy resources (images, stylesheets, media, fonts, etc.)',
  )
  .option(
    '-t, --timeout',
    'Maximum time in seconds for navigation and requests',
    30,
  )
  .option('-p, --parallel', 'Number of websites to crawl in parallel', 1)
  .option(
    '-r, --restart',
    'Crawl websites even if they have already been crawled',
  )
  .option(
    '-o, --order',
    "Website selection order, can be 'asc' or 'random'",
    'asc',
  )
  .option('--bypass-csp', 'Bypass content security policy checks')
  .option('--proxy', 'Use a network proxy server')
  .option('--debug', 'Enable debug logging and use a headfull browser')
  .example('run --max 1000')
  .example('run -p 5 -m 10000 -d 3')
  .example('run')
  .action(run);

prog.parse(process.argv);
