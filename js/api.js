import { SUPABASE_URL } from './config.js?v=20261114-1439';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261114-1439') : await import('./api-demo.js?v=20261114-1439');
export const api = mod.api;
