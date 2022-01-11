import SqliteDB, { Database } from 'better-sqlite3';
import fs from 'fs';
import type { CrawlerConfig } from './types';
import { logger } from './utils';

export function connectDB(config: CrawlerConfig): Database {
  const db = new SqliteDB(config.DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? logger.debug : undefined,
  });

  process.on('exit', () => db.close());
  process.on('SIGHUP', () => process.exit(128 + 1));
  process.on('SIGINT', () => process.exit(128 + 2));
  process.on('SIGTERM', () => process.exit(128 + 15));

  db.pragma('trusted_schema = OFF');
  db.pragma('journal_mode = WAL');
  db.pragma('auto_vacuum = 2'); // incremental

  const tablesExist = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='run'")
    .pluck()
    .get() as 1 | undefined;

  if (!tablesExist) {
    db.exec('VACUUM');
    logger.info('Database empty, initialising...');
    db.exec(fs.readFileSync(config.DB_SQL_PATH, 'utf8'));
    logger.info('Database initialised.');
  }

  return db;
}
