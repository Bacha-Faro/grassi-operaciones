import { SUPABASE_URL } from './config.js?v=20261111-1328';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261111-1328') : await import('./api-demo.js?v=20261111-1328');
export const api = mod.api;
