import { SUPABASE_URL } from './config.js?v=20261121-1455';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261121-1455') : await import('./api-demo.js?v=20261121-1455');
export const api = mod.api;
