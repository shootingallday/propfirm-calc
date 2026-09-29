import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { env: { TZ: 'America/New_York' } } });
