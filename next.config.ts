import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const config = (phase: string): NextConfig => {
  const isDevelopment = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    output: 'export',
    devIndicators: false,
    outputFileTracingRoot: process.cwd(),
    distDir: isDevelopment ? '.next-dev' : '.next',
    // Keep the exported app interactive when `out/index.html` is opened directly
    // or when a workshop host mounts it below a URL prefix.
    assetPrefix: isDevelopment ? undefined : '.',
  };
};
export default config;
