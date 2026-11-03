import { SUPABASE_URL } from './config.js?v=20261102-1650';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261102-1650') : await import('./api-demo.js?v=20261102-1650');
export const api = mod.api;
