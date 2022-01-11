import fs from 'fs';
import readline from 'readline';
import { connectDB } from '../db';
import type { GlobalOptions } from '../types';
import { getConfig, logger } from '../utils';

interface ImportOptions extends GlobalOptions {
  overwrite: boolean;
}

export default function action(filepath: string, opts: ImportOptions): void {
  let shouldExit = false;

  if (typeof opts.overwrite !== 'boolean') {
    logger.error('Overwrite must be a boolean');
    shouldExit = true;
  }
  if (shouldExit) process.exit(1);

  const config = getConfig(opts.config);
  const db = connectDB(config);

  if (opts.overwrite) {
    db.prepare('DELETE FROM site').run();
  }

  const input = fs.createReadStream(filepath);
  const rl = readline.createInterface({
    input,
    terminal: false,
    crlfDelay: Number.POSITIVE_INFINITY, // allow any line endings
  });

  const queue: string[] = [];
  let count = 0;

  const hasSites = db
    .prepare('SELECT 1 FROM site LIMIT 1')
    .pluck()
    .get() as number;

  // Techniques to prevent duplicate URLs have quite a lot of overhead so only
  // use them when actually necessary
  if (hasSites) {
    db.prepare('CREATE UNIQUE INDEX tmp_unique_site ON site(url)').run();
  }

  // TODO: Validate lines as they are read
  const drainQueue = () => {
    db.exec(`BEGIN TRANSACTION;
INSERT OR IGNORE INTO site(url) VALUES
${queue.map((site) => `('${site}')`).join(',')};
COMMIT;`);
    count += queue.length;
    queue.length = 0;
  };

  logger.info('Importing sites...');

  rl.on('line', (line) => {
    queue.push(line);

    // Chunk into 10000 at a time to prevent memory issues
    if (queue.length === 10_000) drainQueue();
  });

  rl.on('close', () => {
    if (queue.length > 0) drainQueue();

    if (hasSites) {
      db.prepare('DROP INDEX IF EXISTS tmp_unique_site').run();
      db.pragma('incremental_vacuum');
    }

    logger.info(`Done. Imported ${count.toLocaleString()} sites.`);
  });
}
