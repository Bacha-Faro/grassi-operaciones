import { SUPABASE_URL } from './config.js?v=20261111-1635';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261111-1635') : await import('./api-demo.js?v=20261111-1635');
export const api = mod.api;
