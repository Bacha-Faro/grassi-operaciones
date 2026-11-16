import { SUPABASE_URL } from './config.js?v=20261116-1838';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261116-1838') : await import('./api-demo.js?v=20261116-1838');
export const api = mod.api;
