import { SUPABASE_URL } from './config.js?v=20261116-1346';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261116-1346') : await import('./api-demo.js?v=20261116-1346');
export const api = mod.api;
