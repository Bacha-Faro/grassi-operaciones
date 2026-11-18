import { SUPABASE_URL } from './config.js?v=20261117-1553';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261117-1553') : await import('./api-demo.js?v=20261117-1553');
export const api = mod.api;
