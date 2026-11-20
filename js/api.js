import { SUPABASE_URL } from './config.js?v=20261120-1345';
const mod = SUPABASE_URL ? await import('./api-supabase.js?v=20261120-1345') : await import('./api-demo.js?v=20261120-1345');
export const api = mod.api;
