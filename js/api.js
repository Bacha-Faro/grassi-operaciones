import { SUPABASE_URL } from './config.js?v=20261103-1713';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261103-1713') : await import('./api-demo.js?v=20261103-1713');
export const api = mod.api;
