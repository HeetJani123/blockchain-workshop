import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
const config = (phase: string): NextConfig => ({ output: 'export', devIndicators: false, outputFileTracingRoot: process.cwd(), distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next' });
export default config;
