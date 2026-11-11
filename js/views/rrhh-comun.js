// RRHH: utilidades compartidas (colores de sucursal, tipos de ausencia, fechas y la ficha para cargar o editar una ausencia).
import { h, toast, modal, field, confirmar } from '../ui.js?v=20261111-1328';
import { hoyAR, sumarDias } from './drog-comun.js?v=20261111-1328';
export { hoyAR, sumarDias };

// Colores de las sucursales, los mismos que usa RRHH en su planilla de cobertura
export const COLORES = {
  1: { bg: '#fff2cc', bd: '#c9a227', txt: 'Gral. Paz' },
  2: { bg: '#cfe2f3', bd: '#4a8cc9', txt: 'Centro' },
  3: { bg: '#d9ead3', bd: '#5a9e46', txt: 'Fotheringham' },
  4: { bg: '#fde0c2', bd: '#e08a1e', txt: 'Banda Norte' },
  5: { bg: '#fff59d', bd: '#bfa800', txt: 'Alberdi' },
  6: { bg: '#f4cccc', bd: '#cc5c5c', txt: 'Belgrano' },
  zona: { bg: '#f6e0a6', bd: '#b8860b', txt: 'Zona' },
  virtual: { bg: '#e4d9f2', bd: '#8a6bbf', txt: 'Virtual' },
  otro: { bg: '#e3e7ee', bd: '#7d8799', txt: 'Áreas' },
  sin: { bg: '#eceff3', bd: '#a0a8b8', txt: 'Sin sucursal' },
};
// grupo de color de una sucursal (por el número del nombre: "Suc 2 Centro" → 2; las de la zona, mostaza)
export function grupoSuc(s) {
  if (!s) return 'sin';
  if (/virtual/i.test(s.nombre)) return 'virtual';
  const m = String(s.nombre).match(/^Suc (\d+)/);
  if (m) return +m[1] <= 6 ? +m[1] : 'zona';
  return 'otro';
}
export const colorDe = s => COLORES[grupoSuc(s)];
export const estiloSuc = s => { const c = colorDe(s); return `--s-bg:${c.bg};--s-bd:${c.bd}`; };
// orden para listar sucursales: 1 a 6, zona, virtual, áreas
export const ordenSuc = (a, b) => {
  const k = s => { const g = grupoSuc(s); return typeof g === 'number' ? g : { zona: 50, virtual: 80, otro: 90, sin: 99 }[g]; };
  const n = s => +(String(s?.nombre).match(/^Suc (\d+)/)?.[1] || 0);
  return k(a) - k(b) || n(a) - n(b) || String(a?.nombre).localeCompare(String(b?.nombre), 'es');
};
export const nombreSuc = s => s ? s.nombre.replace(/^Suc \d+ /, '') : 'Sin sucursal';

export const TIPOS = {
  vacaciones: { label: 'Vacaciones', corto: 'Vac.' },
  dia_libre: { label: 'Día libre', corto: 'Libre' },
  franco: { label: 'Franco', corto: 'Franco' },
  evento: { label: 'Evento', corto: 'Evento' },
  licencia: { label: 'Licencia', corto: 'Lic.' },
};
export const ACUERDOS = { franquera: 'Franquera (todos los sábados)', manana_fija: 'Sábado fijo a la mañana (8 a 13)', por_medio: 'Sábado de por medio', no_trabaja: 'No trabaja sábados' };

// fechas (texto AAAA-MM-DD, sin zonas horarias)
const D = f => new Date(`${f}T12:00:00`);
export const diasEntre = (a, b) => Math.round((D(b) - D(a)) / 86400000) + 1;
export const lunesDe = f => sumarDias(f, -((D(f).getDay() + 6) % 7));
export const fechaTxt = f => D(f).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
export const fechaDia = f => D(f).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
export const mesTxt = ym => { const t = D(`${ym}-01`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
// período de vacaciones: de octubre a septiembre (oct. 2026 a sep. 2027 = período 2026)
export const periodoDe = f => +f.slice(0, 4) - (+f.slice(5, 7) < 10 ? 1 : 0);
export const rango = a => a.desde === a.hasta ? fechaTxt(a.desde) : `${fechaTxt(a.desde)} al ${fechaTxt(a.hasta)}`;

// quiénes de la misma sucursal faltan en las mismas fechas
export function superpuestas(a, ausencias, empleados) {
  const emp = empleados.find(e => e.id === +a.empleado_id);
  if (!emp?.sucursal_id) return [];
  return ausencias.filter(x => x.id !== a.id && x.empleado_id !== emp.id && x.tipo !== 'evento' && x.desde <= a.hasta && x.hasta >= a.desde
    && empleados.find(e => e.id === x.empleado_id)?.sucursal_id === emp.sucursal_id);
}

// ficha para cargar o editar una ausencia
export function fichaAusencia({ api, a = {}, empleados, sucursales, ausencias, onDone }) {
  const nueva = !a.id;
  const sucDe = id => sucursales.find(s => s.id === id);
  const activos = empleados.filter(e => e.activo || e.id === a.empleado_id);
  const grupos = [...new Set(activos.map(e => e.sucursal_id ?? 0))].sort((x, y) => ordenSuc(sucDe(x), sucDe(y)));
  const persona = h('select', { id: 'au-persona', required: true }, h('option', { value: '' }, 'Elegí la persona…'),
    grupos.map(g => h('optgroup', { label: g ? sucDe(g)?.nombre || 'Otra' : 'Sin sucursal' },
      activos.filter(e => (e.sucursal_id ?? 0) === g).map(e => h('option', { value: e.id, selected: e.id === a.empleado_id }, e.nombre)))));
  const tipo = h('select', { id: 'au-tipo' }, Object.entries(TIPOS).map(([k, t]) => h('option', { value: k, selected: k === (a.tipo || 'vacaciones') }, t.label)));
  const desde = h('input', { type: 'date', id: 'au-desde', value: a.desde || '', required: true });
  const hasta = h('input', { type: 'date', id: 'au-hasta', value: a.hasta || '', required: true });
  const periodo = h('input', { type: 'number', id: 'au-periodo', min: 2020, max: 2100, value: a.periodo || '', placeholder: 'Ej.: 2026' });
  const titulo = h('input', { id: 'au-titulo', maxlength: 120, value: a.titulo || '', placeholder: 'Ej.: Entrega de título' });
  const nota = h('input', { id: 'au-nota', maxlength: 500, value: a.nota && !a.aproximada ? a.nota : (a.nota || '').replace(/\.?\s*Importada del Excel:.*$/, ''), placeholder: 'Opcional' });
  const aprox = h('input', { type: 'checkbox', id: 'au-aprox', checked: !!a.aproximada });
  const dias = h('strong', {}, '—');
  const aviso = h('div', { class: 'notice warn', hidden: true });
  const filaPeriodo = field('Período de vacaciones', periodo, 'De octubre a septiembre: oct. 2026 a sep. 2027 es el período 2026.');
  const filaTitulo = field('Título', titulo);
  const actualizar = () => {
    if (desde.value && (!hasta.value || hasta.value < desde.value)) hasta.value = desde.value;
    const n = desde.value && hasta.value ? diasEntre(desde.value, hasta.value) : null;
    dias.textContent = n ? `${n} día${n > 1 ? 's' : ''} corrido${n > 1 ? 's' : ''}` : '—';
    filaPeriodo.hidden = tipo.value !== 'vacaciones'; filaTitulo.hidden = tipo.value !== 'evento';
    if (tipo.value === 'vacaciones' && !periodo.value && desde.value) periodo.value = periodoDe(desde.value);
    const sup = persona.value && n ? superpuestas({ id: a.id, empleado_id: persona.value, desde: desde.value, hasta: hasta.value }, ausencias, empleados) : [];
    aviso.hidden = !sup.length;
    aviso.replaceChildren(h('strong', {}, `Se superpone con ${sup.length === 1 ? 'otra persona' : `${sup.length} personas`} de la misma sucursal: `),
      sup.map(x => `${empleados.find(e => e.id === x.empleado_id)?.nombre} (${rango(x)})`).join(' · '));
  };
  for (const el of [persona, tipo, desde, hasta]) el.addEventListener('change', actualizar);
  actualizar();

  const guardar = async () => {
    if (!persona.value) { toast('Elegí la persona', 'bad'); return false; }
    if (!desde.value || !hasta.value) { toast('Completá las fechas', 'bad'); return false; }
    if (tipo.value === 'evento' && !titulo.value.trim()) { toast('Poné un título para el evento', 'bad'); return false; }
    const notaFinal = [nota.value.trim(), aprox.checked ? 'Importada del Excel: el Excel solo indica la semana, confirmar la fecha exacta.' : ''].filter(Boolean).join('. ');
    try {
      await api.rrhhGuardarAusencia({ id: a.id, empleado_id: persona.value, tipo: tipo.value, desde: desde.value, hasta: hasta.value, dias: diasEntre(desde.value, hasta.value),
        periodo: tipo.value === 'vacaciones' ? periodo.value : null, titulo: tipo.value === 'evento' ? titulo.value.trim() : null, nota: notaFinal || null, aproximada: aprox.checked });
      toast(nueva ? 'Ausencia cargada' : 'Cambios guardados'); onDone?.();
    } catch (e) { toast(e.message, 'bad'); return false; }
  };
  const borrar = async () => {
    if (!(await confirmar('Borrar ausencia', `¿Borrar ${TIPOS[a.tipo].label.toLowerCase()} de ${empleados.find(e => e.id === a.empleado_id)?.nombre} (${rango(a)})?`, 'Borrar', 'danger'))) return false;
    try { await api.rrhhBorrarAusencia(a.id); toast('Ausencia borrada'); onDone?.(); } catch (e) { toast(e.message, 'bad'); return false; }
  };
  modal({ title: nueva ? 'Cargar ausencia' : 'Editar ausencia',
    body: h('div', { class: 'stack' },
      field('Persona', persona),
      h('div', { class: 'grid2' }, field('Tipo', tipo), h('div', { class: 'au-dias' }, h('small', { class: 'muted' }, 'Duración'), dias)),
      h('div', { class: 'grid2' }, field('Desde', desde), field('Hasta', hasta)),
      aviso, filaPeriodo, filaTitulo, field('Nota', nota),
      h('label', { class: 'check-mini au-aprox' }, aprox, ' Fecha estimada: falta confirmarla',
        h('small', { class: 'muted' }, ' (las importadas del Excel solo tenían la semana)'))),
    actions: [
      ...(nueva ? [] : [{ label: 'Borrar', kind: 'danger-link', onClick: borrar }]),
      { label: 'Cancelar' }, { label: nueva ? 'Cargar' : 'Guardar', kind: 'primary', onClick: guardar }] });
}
