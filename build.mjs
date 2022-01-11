// eslint-disable-next-line max-len
/* eslint-disable @typescript-eslint/no-unsafe-assignment, import/no-extraneous-dependencies, no-console */

import esbuild from 'esbuild';
import { decodeUTF8, encodeUTF8, writeFiles } from 'esbuild-minify-templates';
import fs from 'fs/promises';
import { gitHash, isDirty } from 'git-ref';
import path from 'path';

// Workaround for no JSON import in ESM yet
/** @type {import('./package.json')} */
// eslint-disable-next-line unicorn/prefer-json-parse-buffer
const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'));

const mode = process.env.NODE_ENV;
const dev = mode === 'development';
const release = `v${pkg.version}-${gitHash()}${isDirty() ? '-dev' : ''}`;

/** @type {esbuild.Plugin} */
const analyzeMeta = {
  name: 'analyze-meta',
  setup(build) {
    if (!build.initialOptions.metafile) return;

    build.onEnd(
      (result) => result.metafile
        && build.esbuild.analyzeMetafile(result.metafile).then(console.log),
    );
  },
};

/** @type {esbuild.Plugin} */
const minifyJS = {
  name: 'minify-js',
  setup(build) {
    // if (!build.initialOptions.minify) return;
    if (build.initialOptions.write !== false) return;

    build.onEnd(async (result) => {
      if (result.outputFiles) {
        for (let index = 0; index < result.outputFiles.length; index += 1) {
          const file = result.outputFiles[index];

          if (path.extname(file.path) !== '.js') return;

          // eslint-disable-next-line no-await-in-loop
          const out = await build.esbuild.transform(decodeUTF8(file.contents), {
            loader: 'js',
            minify: true,
            // target: build.initialOptions.target,
          });

          // eslint-disable-next-line no-param-reassign
          result.outputFiles[index].contents = encodeUTF8(out.code);
        }
      }
    });
  },
};

// TrackX client script (injected into pages)
const out = await esbuild.build({
  entryPoints: ['src/trackx.ts'],
  outfile: 'dist/trackx.js',
  platform: 'browser',
  target: ['es2021'],
  define: {
    'process.env.APP_RELEASE': JSON.stringify(release),
    'process.env.NODE_ENV': JSON.stringify(mode),
  },
  plugins: [analyzeMeta, minifyJS],
  banner: { js: '"use strict";' },
  bundle: true,
  minify: !dev,
  sourcemap: dev && 'inline',
  watch: dev,
  metafile: !dev && process.stdout.isTTY,
  write: false,
  logLevel: 'debug',
});

// CLI script
await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  target: ['node16'],
  platform: 'node',
  define: {
    'process.env.APP_RELEASE': JSON.stringify(release),
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.TRACKX_CODE': JSON.stringify(
      decodeUTF8(out.outputFiles[0].contents),
    ),
    //       'process.env.TRACKX_CODE':
    //         JSON.stringify(`const script = document.createElement('script');
    // script.crossOrigin = '';
    // script.textContent = ${JSON.stringify(out.outputFiles?.[0].text)};
    // // eslint-disable-next-line unicorn/prefer-dom-node-append
    // (document.head||document.documentElement).appendChild(script);
    // script.remove();`),
  },
  external: [
    'better-sqlite3',
    'playwright-firefox',
    'source-map',
    'source-map-support',
  ],
  plugins: [analyzeMeta, minifyJS, writeFiles()],
  banner: { js: '#!/usr/bin/env node\n"use strict";' },
  bundle: true,
  sourcemap: true,
  minify: !dev,
  watch: dev,
  metafile: !dev && process.stdout.isTTY,
  logLevel: 'debug',
});
