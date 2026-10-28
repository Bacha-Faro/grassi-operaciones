import { SUPABASE_URL } from './config.js';
const mod = SUPABASE_URL ? await import('./api-supabase.js') : await import('./api-demo.js');
export const api = mod.api;
