import { SUPABASE_URL } from './config.js?v=20261119-1503';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261119-1503') : await import('./api-demo.js?v=20261119-1503');
export const api = mod.api;
