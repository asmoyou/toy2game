import { defineConfig } from 'vite';
import { seoPlugin } from '../../scripts/seo.mjs';

export default defineConfig({ plugins: [seoPlugin({ gameId: 'balance-astronaut' })] });
