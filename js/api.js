import { SUPABASE_URL } from './config.js?v=20261113-1745';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261113-1745') : await import('./api-demo.js?v=20261113-1745');
export const api = mod.api;
