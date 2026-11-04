import { SUPABASE_URL } from './config.js?v=20261104-1250';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261104-1250') : await import('./api-demo.js?v=20261104-1250');
export const api = mod.api;
