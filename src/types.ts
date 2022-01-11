declare global {
  interface Error {
    /** Extra details about the error to send along with error reports. */
    details?: any;
  }
}

export interface CrawlerConfig {
  /**
   * Optional root directory to resolve all other configuration paths from. When
   * not specified, the current working directory is used.
   */
  ROOT_DIR?: string;
  /** Database file path. If a file does not exist it will be created. */
  DB_PATH: string;
  /** Database schema SQL file path. */
  DB_SQL_PATH: string;
  /** TrackX API endpoint, including project key. */
  API_ENDPOINT: string;
}

export interface GlobalOptions {
  /** File path to TrackX Crawler configuration. */
  config: string;
  verbose: boolean;
}
