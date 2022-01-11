import { green, red, yellow } from 'kleur/colors';
import { connectDB } from '../db';
import type { GlobalOptions } from '../types';
import { getConfig, logger } from '../utils';

export default function action(opts: GlobalOptions): void {
  const config = getConfig(opts.config);
  const db = connectDB(config);

  logger.info('Configuration OK');
  logger.info('Database connection OK');

  let errors = 0;
  let warnings = 0;
  let ok = 2;

  // https://www.sqlite.org/pragma.html#pragma_integrity_check
  const integrity = db.pragma('integrity_check(3)') as [
    { integrity_check: string },
  ];

  if (integrity.length > 1 || integrity[0].integrity_check !== 'ok') {
    logger.error('Database integrity failed, your database may be corrupt');
    process.exitCode = 1;
    errors += 1;
  } else {
    logger.info('Database integrity OK');
    ok += 1;
  }

  // TODO: Remove? We don't have any foreign keys in our database
  // // https://www.sqlite.org/pragma.html#pragma_foreign_key_check
  // const foreignKeys = db.pragma('foreign_key_check') as any[];

  // if (foreignKeys.length > 0) {
  //   logger.error('Database foreign key check failed');
  //   process.exitCode = 1;
  //   errors += 1;
  // } else {
  //   logger.info('Database foreign keys OK');
  //   ok += 1;
  // }

  const dbWrite = db
    .prepare("INSERT INTO site(url, resolved) VALUES('CHECK_TEST', 'ok')")
    .run();

  if (dbWrite.changes !== 1) {
    logger.error('Database write failed');
    process.exitCode = 1;
    errors += 1;
  } else {
    logger.info('Database write OK');
    ok += 1;
  }

  const dbReadStmt = db
    .prepare("SELECT resolved FROM site WHERE url = 'CHECK_TEST'")
    .pluck();
  const dbRead1 = dbReadStmt.get() as string;

  if (dbRead1 !== 'ok') {
    logger.error('Database read failed');
    process.exitCode = 1;
    errors += 1;
  } else {
    logger.info('Database read OK');
    ok += 1;
  }

  const dbDelete = db
    .prepare("DELETE FROM site WHERE url = 'CHECK_TEST'")
    .run();
  const dbRead2 = dbReadStmt.get() as string;

  if (dbDelete.changes !== 1 || dbRead2 !== undefined) {
    logger.error('Database delete failed');
    process.exitCode = 1;
    errors += 1;
  } else {
    logger.info('Database delete OK');
    ok += 1;
  }

  const totalSiteCount = db
    .prepare('SELECT COUNT(*) FROM site')
    .pluck()
    .get() as number;

  if (totalSiteCount === 0) {
    logger.error('No sites in database');
    process.exitCode = 1;
    errors += 1;
  } else {
    logger.info(totalSiteCount, 'sites found in database');
    ok += 1;
  }

  const validSiteCount = db
    .prepare('SELECT COUNT(*) FROM site WHERE handled = 0')
    .pluck()
    .get() as number;

  if (validSiteCount === 0) {
    logger.warn('No unvisited sites in database');
    warnings += 1;
  } else {
    logger.info(validSiteCount, 'unvisited sites found in database');
    ok += 1;
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nSummary: ${green(`${ok} OK`)}, ${red(`${errors} errors`)}, ${yellow(
      `${warnings} warnings`,
    )}\n`,
  );
}
