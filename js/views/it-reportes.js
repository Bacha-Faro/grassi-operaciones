// Soporte IT · Reportes del mes: cuántos tickets, de dónde, de qué, cuánto se tardó y qué equipos fallan más. Solo IT.
import { h, empty, fechaHora, tkNum, descargarCSV } from '../ui.js?v=20261113-1822';
import { plazo, minutosHabiles, PRIORIDADES, PRIO_TXT, TIPOS_EQUIPO } from './ticket.js?v=20261113-1822';

const ESTADO_TXT = { nuevo: 'Nuevo', en_curso: 'En curso', en_espera: 'En espera', resuelto: 'Resuelto', cerrado: 'Cerrado', anulado: 'Anulado' };
const durTxt = m => m === null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 480 ? `${(m / 60).toFixed(1).replace('.', ',')} h` : `${(m / 480).toFixed(1).replace('.', ',')} días`;
const prom = arr => arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : null;
const pctTxt = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—';

export async function render({ api }) {
  const [tickets, equipos, guias, usos] = await Promise.all([api.tickets(), api.itEquipos(), api.itSoluciones(), api.itSolucionesUsos().catch(() => [])]);
  // meses con datos (y el actual)
  const clave = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
  const hoyK = clave(new Date());
  const meses = [...new Set([hoyK, ...tickets.map(t => clave(t.created_at))])].sort().reverse();
  const mesTxt = k => { const t = new Date(`${k}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); };
  let mes = hoyK;
  const cont = h('div', { class: 'stack' });

  const kpi = (n, l, tono) => h('div', { class: `kpi ${tono || ''}` }, h('strong', {}, n), h('span', {}, l));
  const barra = (v, max, tono = '') => h('span', { class: `rep-barra ${tono}` }, h('span', { style: `width:${max ? Math.max(4, Math.round(v / max * 100)) : 0}%` }));
  const tabla = (titulo, cols, filas, nota) => h('section', { class: 'block rep-bloque' },
    h('div', { class: 'block-head' }, h('h2', {}, titulo)),
    filas.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl rep-tbl' },
      h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.startsWith('#') ? 'num' : '' }, c.replace(/^#/, ''))))),
      h('tbody', {}, filas))) : h('p', { class: 'muted' }, 'Sin datos este mes.'),
    nota ? h('small', { class: 'muted' }, nota) : null);

  function pintar() {
    const delMes = tickets.filter(t => clave(t.created_at) === mes && t.estado !== 'anulado');
    const anulados = tickets.filter(t => clave(t.created_at) === mes && t.estado === 'anulado').length;
    const resueltosMes = tickets.filter(t => t.resuelto_at && clave(t.resuelto_at) === mes);
    const conResp = delMes.filter(t => t.primera_respuesta_at);
    const enPlazo = conResp.filter(t => plazo(t).enPlazo).length;
    const pResp = prom(conResp.map(t => minutosHabiles(t.created_at, t.primera_respuesta_at)));
    const pResol = prom(resueltosMes.map(t => minutosHabiles(t.created_at, t.resuelto_at)));
    const usosMes = usos.filter(u => clave(u.created_at) === mes);
    if (!delMes.length && !resueltosMes.length && !usosMes.length) {
      return cont.replaceChildren(empty(`Sin tickets en ${mesTxt(mes).toLowerCase()}`, 'Cuando las sucursales carguen tickets, acá vas a ver los números del mes.'));
    }
    const kpis = h('div', { class: 'kpis tk-kpis' },
      kpi(delMes.length, 'tickets cargados'),
      kpi(delMes.filter(t => t.prioridad === 'critica').length, 'críticos', delMes.some(t => t.prioridad === 'critica') ? 'bad' : ''),
      kpi(resueltosMes.length, 'resueltos en el mes'),
      kpi(pctTxt(enPlazo, conResp.length), 'primera respuesta en plazo', conResp.length && enPlazo / conResp.length < 0.8 ? 'warn' : ''),
      kpi(durTxt(pResp), 'primera respuesta promedio'),
      kpi(durTxt(pResol), 'resolución promedio'),
      kpi(delMes.filter(t => t.reaperturas).length, 'reabiertos', delMes.some(t => t.reaperturas) ? 'warn' : ''),
      kpi(usosMes.length, 'resueltos con las guías (sin ticket)'));

    // por sucursal
    const porSuc = {};
    for (const t of delMes) (porSuc[t.sucursal || '—'] ||= []).push(t);
    const maxS = Math.max(0, ...Object.values(porSuc).map(x => x.length));
    const filasSuc = Object.entries(porSuc).sort((a, b) => b[1].length - a[1].length).map(([s, ts]) => {
      const r = ts.filter(t => t.primera_respuesta_at);
      return h('tr', {}, h('td', {}, s), h('td', { class: 'num' }, barra(ts.length, maxS), ` ${ts.length}`),
        h('td', { class: 'num' }, ts.filter(t => t.prioridad === 'critica').length || '—'),
        h('td', { class: 'num' }, durTxt(prom(r.map(t => minutosHabiles(t.created_at, t.primera_respuesta_at))))),
        h('td', { class: 'num' }, ts.filter(t => !['resuelto', 'cerrado'].includes(t.estado)).length || '—'));
    });
    // por categoría
    const porCat = {};
    for (const t of delMes) (porCat[t.categoria || '—'] ||= []).push(t);
    const maxC = Math.max(0, ...Object.values(porCat).map(x => x.length));
    const filasCat = Object.entries(porCat).sort((a, b) => b[1].length - a[1].length).map(([c, ts]) => h('tr', {}, h('td', {}, c),
      h('td', { class: 'num' }, barra(ts.length, maxC), ` ${ts.length}`), h('td', { class: 'num' }, pctTxt(ts.length, delMes.length)),
      h('td', { class: 'num' }, durTxt(prom(ts.filter(t => t.resuelto_at).map(t => minutosHabiles(t.created_at, t.resuelto_at)))))));
    // por prioridad
    const filasPrio = PRIORIDADES.map(([k]) => {
      const ts = delMes.filter(t => t.prioridad === k), r = ts.filter(t => t.primera_respuesta_at);
      return ts.length ? h('tr', {}, h('td', {}, PRIO_TXT[k]), h('td', { class: 'num' }, ts.length),
        h('td', { class: 'num' }, pctTxt(r.filter(t => plazo(t).enPlazo).length, r.length)),
        h('td', { class: 'num' }, durTxt(prom(r.map(t => minutosHabiles(t.created_at, t.primera_respuesta_at)))))) : null;
    }).filter(Boolean);
    // equipos con más tickets (en el mes)
    const porEq = {};
    for (const t of delMes.filter(t => t.equipo_id)) (porEq[t.equipo_id] ||= []).push(t);
    const filasEq = Object.entries(porEq).sort((a, b) => b[1].length - a[1].length).slice(0, 10).map(([id, ts]) => {
      const e = equipos.find(x => x.id === +id);
      return h('tr', {}, h('td', {}, h('strong', {}, e?.nombre || ts[0].equipo || 'Equipo'), h('small', { class: 'muted' }, ` · ${ts[0].sucursal}`)),
        h('td', {}, e ? TIPOS_EQUIPO[e.tipo] : '—'), h('td', { class: 'num' }, ts.length),
        h('td', {}, h('small', {}, [...new Set(ts.map(t => t.categoria))].join(', '))));
    });
    const sinEquipo = delMes.filter(t => !t.equipo_id).length;
    // guías que resolvieron
    const porGuia = {};
    for (const u of usosMes) porGuia[u.solucion_id] = (porGuia[u.solucion_id] || 0) + 1;
    const filasGuia = Object.entries(porGuia).sort((a, b) => b[1] - a[1]).map(([id, n]) => h('tr', {}, h('td', {}, guias.find(g => g.id === +id)?.titulo || 'Guía borrada'), h('td', { class: 'num' }, n)));

    cont.replaceChildren(kpis,
      anulados ? h('small', { class: 'muted' }, `No se cuentan ${anulados} ticket${anulados > 1 ? 's' : ''} anulado${anulados > 1 ? 's' : ''}. Los tiempos son en horario de IT (lun a vie, 8 a 16).`)
        : h('small', { class: 'muted' }, 'Los tiempos son en horario de IT (lun a vie, 8 a 16).'),
      h('div', { class: 'rep-grid' },
        tabla('Por sucursal', ['Sucursal o área', '#Tickets', '#Críticos', '#1.ª resp.', '#Abiertos'], filasSuc),
        tabla('Por categoría', ['Categoría', '#Tickets', '#%', '#Resolución'], filasCat),
        tabla('Por prioridad', ['Prioridad', '#Tickets', '#En plazo', '#1.ª resp.'], filasPrio),
        tabla('Equipos con más tickets', ['Equipo', 'Tipo', '#Tickets', 'Categorías'], filasEq,
          sinEquipo ? `${sinEquipo} ticket${sinEquipo > 1 ? 's' : ''} del mes no indica${sinEquipo > 1 ? 'n' : ''} equipo.` : null),
        tabla('Guías que resolvieron sin ticket', ['Guía', '#Veces'], filasGuia)));
  }
  pintar();

  const descargar = () => {
    const rows = tickets.filter(t => clave(t.created_at) === mes).sort((a, b) => a.created_at.localeCompare(b.created_at));
    descargarCSV(`Tickets IT ${mesTxt(mes)}`, [['Ticket', 'Cargado', 'Sucursal', 'Categoría', 'Equipo', 'Asunto', 'Prioridad', 'Estado', 'Primera respuesta', 'Respuesta (min hábiles)', 'En plazo', 'Resuelto', 'Resolución (min hábiles)', 'Reaperturas', 'Solución'],
      ...rows.map(t => [tkNum(t.id), fechaHora(t.created_at), t.sucursal, t.categoria, t.equipo || '', t.asunto, PRIO_TXT[t.prioridad], ESTADO_TXT[t.estado] || t.estado,
        t.primera_respuesta_at ? fechaHora(t.primera_respuesta_at) : '', t.primera_respuesta_at ? minutosHabiles(t.created_at, t.primera_respuesta_at) : '',
        t.primera_respuesta_at ? (plazo(t).enPlazo ? 'Sí' : 'No') : '', t.resuelto_at ? fechaHora(t.resuelto_at) : '',
        t.resuelto_at ? minutosHabiles(t.created_at, t.resuelto_at) : '', t.reaperturas || 0, t.solucion || ''])]);
  };

  return h('div', { class: 'view it-reportes' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Soporte IT'), h('h1', {}, 'Reportes'),
        h('p', { class: 'muted' }, 'Los números del mes: de dónde vienen los tickets, de qué son y cuánto se tarda.')),
      h('div', { class: 'toolbar' },
        h('select', { 'aria-label': 'Mes', onchange: e => { mes = e.target.value; pintar(); } }, meses.map(k => h('option', { value: k, selected: k === mes }, mesTxt(k)))),
        h('button', { class: 'btn', onclick: descargar }, 'Descargar CSV'))),
    cont);
}
