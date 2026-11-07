import { SUPABASE_URL } from './config.js?v=20261107-1537';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261107-1537') : await import('./api-demo.js?v=20261107-1537');
export const api = mod.api;
