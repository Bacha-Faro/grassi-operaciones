import { SUPABASE_URL } from './config.js?v=20261111-1253';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261111-1253') : await import('./api-demo.js?v=20261111-1253');
export const api = mod.api;
