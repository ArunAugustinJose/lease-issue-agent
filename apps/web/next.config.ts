import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(process.cwd(), '../../.env') });
const config: NextConfig = { transpilePackages: ['@marina/contracts'] };
export default config;
