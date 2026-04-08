// @ts-check
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';

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
    },
  },
  plugins: [pluginReact(), pluginSvgr()],
  tools: {
    rspack: {
      plugins: [codeInspectorPlugin({ bundler: 'rspack' })],
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
