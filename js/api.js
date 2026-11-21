import { SUPABASE_URL } from './config.js?v=20261121-1423';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261121-1423') : await import('./api-demo.js?v=20261121-1423');
export const api = mod.api;
