// Droguería: utilidades compartidas (turnos de lectura, fechas en hora de Argentina, rangos ANMAT, códigos de bacha).
import { h } from '../ui.js?v=20261113-1943';

// fecha y hora de Argentina, sin depender de la zona de la compu
const partes = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(d).map(p => [p.type, p.value]));
export const hoyAR = () => { const p = partes(); return `${p.year}-${p.month}-${p.day}`; };
export const horaAR = () => { const p = partes(); return `${p.hour}:${p.minute}`; };
export const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const fechaLarga = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fechaCorta = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

// lecturas: lunes a viernes 4, sábados 2, domingos y feriados ninguna
export const TODOS_TURNOS = ['08:10', '12:00', '15:30', '18:50'];
// feriados nacionales (tabla feriados, los carga IT). Cada vista los carga antes de usar turnosDe.
export const FERIADOS = new Map();
let feriadosOk = false;
export async function cargarFeriados(api) {
  if (feriadosOk) return;
  try { for (const x of await api.feriados()) FERIADOS.set(x.fecha, x); feriadosOk = true; } catch { /* sin feriados, se usan los días de semana */ }
}
export const feriadoDe = f => (FERIADOS.get(f)?.tipo === 'feriado' ? FERIADOS.get(f) : null);
export const turnosDe = f => { const w = new Date(`${f}T12:00:00`).getDay(); return w === 0 || feriadoDe(f) ? [] : w === 6 ? ['08:10', '12:00'] : TODOS_TURNOS; };
const minutos = t => +t.slice(0, 2) * 60 + +t.slice(3);
// estado de un turno de hoy: 'hecho' | 'ahora' (desde la hora hasta 1 h después) | 'atrasado' | 'proximo'
export function estadoTurno(f, turno, cargadas, total) {
  if (cargadas >= total) return 'hecho';
  if (f < hoyAR()) return 'atrasado';
  if (f > hoyAR()) return 'proximo';
  const ahora = minutos(horaAR()), t = minutos(turno);
  return ahora < t - 15 ? 'proximo' : ahora <= t + 60 ? 'ahora' : 'atrasado';
}
export const fmt = v => v === null || v === undefined ? '—' : String(v).replace('.', ',');
export const rangoTxt = p => `${fmt(p.t_min)} a ${fmt(p.t_max)} °C${p.mide_humedad ? ` · HR ${fmt(p.h_min)} a ${fmt(p.h_max)} %` : ''}`;
export const fuera = (p, t, hum) => t < p.t_min || t > p.t_max || (p.mide_humedad && hum !== null && hum !== undefined && (hum < p.h_min || hum > p.h_max));

// bachas: "7", "bch7", "BCH-0007" → BCH-0007
export function codigoBacha(txt) {
  const v = String(txt || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = v.match(/^(?:BCH|BC|BAC)?-?(\d{1,4})$/);
  return m ? `BCH-${m[1].padStart(4, '0')}` : v;
}
export const ESTADO_BACHA = { disponible: ['En Droguería', 'ok'], afuera: ['En sucursal', 'info'], vencida: ['Demorada', 'bad'] };
export const pillBacha = e => h('span', { class: `pill pill-${ESTADO_BACHA[e]?.[1] || 'muted'}` }, ESTADO_BACHA[e]?.[0] || e);
