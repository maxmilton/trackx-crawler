[![Build status](https://img.shields.io/github/workflow/status/maxmilton/trackx-crawler/ci)](https://github.com/maxmilton/trackx-crawler/actions)
[![Coverage status](https://img.shields.io/codeclimate/coverage/maxmilton/trackx-crawler)](https://codeclimate.com/github/maxmilton/trackx-crawler)
[![Licence](https://img.shields.io/github/license/maxmilton/trackx-crawler.svg)](https://github.com/maxmilton/trackx-crawler/blob/master/LICENSE)

# trackx-crawler

WIP.

Crawl website and capture errors and browser reports they produce.

When using the default API endpoint, you can view the results at <https://dash.trackx.app/projects/trackx-crawler> or <https://demo.trackx.app/projects/trackx-crawler>.

## Features

- 2 modes:
  1. Run against an imported list of websites, loading the home page and optionally deeper
  1. Crawl all pages within a target website/s

## Basic Usage Workflow

### Global no-install method

TODO: Also need to create the config; show copy/paste-able sample

```sh
pnpx trackx-crawler --help
```

```sh
pnpx trackx-crawler run --max 100
```

### Build the node app

1. Install dependencies:
   ```sh
   pnpm install
   ```
1. Build the app:
   ```sh
   pnpm run build
   ```

### Prepare website list and run a crawl

You can use any list of websites, however, in this example we use the top 10 million visited domains from Open Page Rank. This is an excellent and free resource that's updated roughly every 3 months.

1. Download the most visited websites CSV from [Open Page Rank](https://www.domcop.com/openpagerank/what-is-openpagerank) ([direct link to zip](https://www.domcop.com/files/top/top10milliondomains.csv.zip)).
1. Unzip the file.
1. Format CSV into a list of websites separated by newline (using the [sqlite3 CLI tool](https://sqlite.org/download.html)):
   ```sh
   sqlite3 --noheader --cmd ".eqp off"
   ```
   In the SQLite shell run each command:
   ```
   sqlite> .import --csv top10milliondomains.csv site
   sqlite> .output ./site-list.txt
   sqlite> .mode list
   sqlite> SELECT Domain FROM site LIMIT 100000;
   sqlite> .exit
   ```
1. Import the line delimited list into a new crawler database:
   ```sh
   txc import site-list.txt
   ```
1. Edit `crawler.config.json` as necessary.
1. Run the crawler:
   ```sh
   txc run --max 100
   ```

To see all `txc run` options run:

```sh
txc run --help
```

or to see all available actions run:

```sh
txc --help
```

## Tips

### Getting around TrackX API rate limiting

Normally a TrackX API instance runs behind a reverse proxy server like Nginx or HAProxy for rate limiting. While this is ideal for real world use cases, the crawler is a special exception where we don't want rate limiting.

It's normal to generate a lot of requests to the TrackX API, so we need a way around the rate limiting proxy. One way to achieve this, in a secure way, is to use SSH port forwarding.

To forward port `8000` from your remote server to port `8888` on your local machine:

```sh
ssh -L 8888:localhost:8000 user@yourserver
```

Then update `crawler.config.json`:

```json
"API_ENDPOINT": "http://127.0.0.1:8888/v1/xxxxxxxxxxx",
```

## Bugs

Report any bugs you encounter on the [GitHub issue tracker](https://github.com/maxmilton/trackx-crawler/issues).

## License

MIT license. See [LICENSE](https://github.com/maxmilton/trackx-crawler/blob/master/LICENSE).

---

© 2022 [Max Milton](https://maxmilton.com)
