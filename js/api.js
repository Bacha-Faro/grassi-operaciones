import { SUPABASE_URL } from './config.js?v=20261106-1324';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261106-1324') : await import('./api-demo.js?v=20261106-1324');
export const api = mod.api;
