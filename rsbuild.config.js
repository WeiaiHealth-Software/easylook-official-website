// @ts-check
import process from 'node:process';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { Compilation, sources } from '@rspack/core';

import { codeInspectorPlugin } from 'code-inspector-plugin';

// Docs: https://rsbuild.rs/config/
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

const { parsed } = loadEnv({
  cwd: process.cwd(),
  mode: process.env.NODE_ENV,
});

const normalizePublicUrl = (value) => {
  if (!value || value === '/') {
    return '/';
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}/`;
};

const publicUrl = normalizePublicUrl(parsed.PUBLIC_URL ?? process.env.PUBLIC_URL);
const buildInfo = {
  VERSION: packageJson.version,
  BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
  COMMIT_HASH: process.env.GIT_COMMIT_HASH || process.env.GITHUB_SHA || 'unknown',
  RELEASE_ID:
    process.env.RELEASE_ID || process.env.GITHUB_SHA || process.env.GIT_COMMIT_HASH || 'local',
};

class BuildMetadataPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('BuildMetadataPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'BuildMetadataPlugin',
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          const asset = compilation.getAsset('index.html');
          if (asset) {
            const content = asset.source.source().toString();
            const filtered = content
              .split(/\r?\n/)
              .filter((line) => {
                const trimmed = line.trim();
                return !(
                  trimmed.startsWith('<meta name="easylook:version"') ||
                  trimmed.startsWith('<meta name="easylook:commit"') ||
                  trimmed.startsWith('<meta name="easylook:release"') ||
                  trimmed.startsWith('<script id="buildinfo"')
                );
              })
              .join('\n');

            const injected = [
              `  <meta name="easylook:version" content="${buildInfo.VERSION}" />`,
              `  <meta name="easylook:commit" content="${buildInfo.COMMIT_HASH}" />`,
              `  <meta name="easylook:release" content="${buildInfo.RELEASE_ID}" />`,
              `  <script id="buildinfo" type="application/json">${JSON.stringify(buildInfo)}</script>`,
            ].join('\n');

            compilation.updateAsset(
              'index.html',
              new sources.RawSource(filtered.replace('</head>', `${injected}\n</head>`)),
            );
          }

          compilation.emitAsset(
            'version.json',
            new sources.RawSource(`${JSON.stringify(buildInfo, null, 2)}\n`),
          );
        },
      );
    });
  }
}

export default defineConfig({
  server: {
    base: publicUrl,
  },
  dev: {
    assetPrefix: publicUrl,
  },
  output: {
    assetPrefix: publicUrl,
    distPath: 'build',
  },
  source: {
    define: {
      'import.meta.env.APP_VERSION': JSON.stringify(packageJson.version),
      'import.meta.env.BUILD_INFO': JSON.stringify(buildInfo),
    },
  },
  plugins: [pluginReact(), pluginSvgr()],
  tools: {
    rspack: {
      plugins: [codeInspectorPlugin({ bundler: 'rspack' }), new BuildMetadataPlugin()],
    },
  },
  html: {
    favicon: './public/favicon.svg',
    title: '视立优 EASYLOOK - 专业的视力保护解决方案提供商',
    meta: {
      description:
        '视立优 EASYLOOK 专业的视力保护解决方案提供商，深耕于眼视光医疗行业，致力于为大众提供近视防控、行为视光、视觉康复、成人视疲劳等各类眼视光前沿性产品。',
      'og:title': '视立优 EASYLOOK - 专业的视力保护解决方案提供商',
      'og:description':
        '视立优 EASYLOOK 专业的视力保护解决方案提供商，深耕于眼视光医疗行业，致力于为大众提供近视防控、行为视光、视觉康复、成人视疲劳等各类眼视光前沿性产品。',
      'og:image': `${publicUrl}company.jpg`,
      'og:type': 'website',
      'twitter:card': 'summary_large_image',
      'twitter:title': '视立优 EASYLOOK - 专业的视力保护解决方案提供商',
      'twitter:description':
        '视立优 EASYLOOK 专业的视力保护解决方案提供商，深耕于眼视光医疗行业，致力于为大众提供近视防控、行为视光、视觉康复、成人视疲劳等各类眼视光前沿性产品。',
      'twitter:image': `${publicUrl}company.jpg`,
    },
  },
});
