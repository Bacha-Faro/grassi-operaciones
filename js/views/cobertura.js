// RRHH · Cobertura: quién falta y cuándo (vacaciones, días libres, francos, eventos), por mes o por sucursal. Reemplaza la planilla de cobertura.
import { h, toast, modal, field, empty, tabs } from '../ui.js?v=20261113-1822';
import { hoyAR, sumarDias, COLORES, grupoSuc, estiloSuc, ordenSuc, nombreSuc, TIPOS, lunesDe, fechaTxt, fechaDia, mesTxt, rango, diasEntre, fichaAusencia } from './rrhh-comun.js?v=20261113-1822';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ultimoDia = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const mesMas = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export async function render({ api, cat }) {
  const hoy = hoyAR();
  let mes = hoy.slice(0, 7), vista = 'calendario', filtroSuc = '', filtroTipo = '', soloConfirmar = false;
  let [empleados, ausencias] = await Promise.all([api.rrhhEmpleados(), api.rrhhAusencias()]);
  const sucursales = cat.sucursales;
  const sucDe = id => sucursales.find(s => s.id === id);
  const emp = id => empleados.find(e => e.id === id);
  const sucDeAus = a => sucDe(emp(a.empleado_id)?.sucursal_id);
  const cont = h('div', { class: 'cob-cont' });
  const recargar = async () => { [empleados, ausencias] = await Promise.all([api.rrhhEmpleados(), api.rrhhAusencias()]); pintar(); };
  const abrir = a => fichaAusencia({ api, a, empleados, sucursales, ausencias, onDone: recargar });

  const pasaFiltro = a => (!filtroSuc || String(emp(a.empleado_id)?.sucursal_id ?? 'sin') === filtroSuc) && (!filtroTipo || a.tipo === filtroTipo) && (!soloConfirmar || a.aproximada);
  // cuántos faltan por sucursal y por día (los eventos no cuentan como ausencia)
  const faltanDia = (f, sid) => ausencias.filter(a => a.tipo !== 'evento' && a.desde <= f && a.hasta >= f && (emp(a.empleado_id)?.sucursal_id ?? null) === sid);
  const choques = f => {
    const porSuc = {};
    for (const a of ausencias) if (a.tipo !== 'evento' && a.desde <= f && a.hasta >= f) { const sid = emp(a.empleado_id)?.sucursal_id; if (sid) (porSuc[sid] ||= []).push(a); }
    return Object.entries(porSuc).filter(([, v]) => v.length > 1).map(([sid, v]) => ({ suc: sucDe(+sid), aus: v }));
  };

  const barra = (a, extra = {}) => h('button', { type: 'button', class: `cob-barra t-${a.tipo}${a.aproximada ? ' aprox' : ''}${extra.cls || ''}`, style: `${estiloSuc(sucDeAus(a))};${extra.style || ''}`,
    title: `${emp(a.empleado_id)?.nombre} · ${nombreSuc(sucDeAus(a))}\n${TIPOS[a.tipo].label}${a.titulo ? `: ${a.titulo}` : ''} · ${rango(a)} (${a.dias} día${a.dias > 1 ? 's' : ''})${a.aproximada ? '\nFecha estimada: falta confirmar' : ''}`,
    onclick: () => abrir(a) },
    h('span', { class: 'cob-nombre' }, emp(a.empleado_id)?.nombre || '¿?'),
    a.tipo !== 'vacaciones' ? h('span', { class: 'cob-tipo' }, a.tipo === 'evento' && a.titulo ? a.titulo : TIPOS[a.tipo].label) : null,
    a.aproximada ? h('span', { class: 'cob-aprox', 'aria-label': 'fecha estimada' }, '≈') : null);

  // ---------- calendario del mes: una fila por semana, cada ausencia es una franja ----------
  function calendario() {
    const ini = `${mes}-01`, fin = `${mes}-${ultimoDia(mes)}`;
    const semanas = [];
    for (let l = lunesDe(ini); l <= fin; l = sumarDias(l, 7)) semanas.push(l);
    const lista = ausencias.filter(pasaFiltro);
    return h('div', { class: 'cob-cal' },
      h('div', { class: 'cob-dias' }, DIAS.map((d, i) => h('span', { class: i > 4 ? 'finde' : '' }, d))),
      semanas.map(l => {
        const dom = sumarDias(l, 6);
        const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(l, i));
        const enSemana = lista.filter(a => a.desde <= dom && a.hasta >= l)
          .sort((x, y) => x.desde.localeCompare(y.desde) || y.dias - x.dias);
        // carriles: cada franja va en el primer renglón libre
        const carriles = [];
        const items = enSemana.map(a => {
          const s = a.desde < l ? 0 : diasEntre(l, a.desde) - 1, e = a.hasta > dom ? 6 : diasEntre(l, a.hasta) - 1;
          let c = carriles.findIndex(finC => finC < s); if (c < 0) { c = carriles.length; carriles.push(-1); }
          carriles[c] = e;
          return barra(a, { cls: `${a.desde < l ? ' sigue-izq' : ''}${a.hasta > dom ? ' sigue-der' : ''}${e - s < 1 ? ' corta' : ''}`, style: `grid-column:${s + 1}/${e + 2};grid-row:${c + 2}` });
        });
        return h('div', { class: 'cob-semana', style: `--filas:${Math.max(carriles.length, 1)}` },
          fechas.map((f, i) => {
            const ch = choques(f);
            return h('div', { class: `cob-fecha${f.slice(0, 7) !== mes ? ' fuera' : ''}${f === hoy ? ' es-hoy' : ''}${i > 4 ? ' finde' : ''}`, style: `grid-column:${i + 1};grid-row:1/-1` },
              h('span', { class: 'cob-num' }, String(+f.slice(8))),
              ch.length ? h('span', { class: 'cob-choque', title: ch.map(c => `${nombreSuc(c.suc)}: faltan ${c.aus.length} (${c.aus.map(a => emp(a.empleado_id)?.nombre).join(', ')})`).join('\n') }, `⚠ ${ch.map(c => nombreSuc(c.suc)).join(', ')}`) : null);
          }),
          items);
      }));
  }

  // ---------- por sucursal: una fila por sucursal, una columna por día ----------
  function porSucursal() {
    const n = ultimoDia(mes), fechas = Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
    const ids = [...new Set(empleados.filter(e => e.activo).map(e => e.sucursal_id ?? null))].sort((a, b) => ordenSuc(sucDe(a), sucDe(b)))
      .filter(sid => !filtroSuc || String(sid ?? 'sin') === filtroSuc);
    const verDia = (f, sid, aus) => modal({ title: `${nombreSuc(sucDe(sid))} · ${fechaDia(f)}`,
      body: h('ul', { class: 'cob-lista-dia' }, aus.map(a => h('li', {}, h('button', { class: 'link', onclick: () => abrir(a) }, emp(a.empleado_id)?.nombre),
        ` · ${TIPOS[a.tipo].label} · ${rango(a)}${a.aproximada ? ' (fecha estimada)' : ''}`))) });
    return h('div', { class: 'table-wrap cob-suc-wrap' }, h('table', { class: 'cob-suc' },
      h('thead', {}, h('tr', {}, h('th', { class: 'cob-suc-nom' }, 'Sucursal'),
        fechas.map(f => { const w = new Date(`${f}T12:00:00`).getDay(); return h('th', { class: `${w === 0 || w === 6 ? 'finde' : ''}${f === hoy ? ' es-hoy' : ''}` }, h('small', {}, DIAS[(w + 6) % 7][0]), String(+f.slice(8))); }))),
      h('tbody', {}, ids.map(sid => {
        const s = sucDe(sid);
        return h('tr', { style: estiloSuc(s) }, h('th', { class: 'cob-suc-nom' }, h('span', { class: 'cob-punto' }), nombreSuc(s)),
          fechas.map(f => {
            const aus = faltanDia(f, sid).filter(a => !filtroTipo || a.tipo === filtroTipo);
            const w = new Date(`${f}T12:00:00`).getDay();
            return h('td', { class: `${aus.length ? 'con' : ''}${aus.length > 1 && sid ? ' choque' : ''}${w === 0 || w === 6 ? ' finde' : ''}`,
              title: aus.map(a => emp(a.empleado_id)?.nombre).join('\n') || null, onclick: aus.length ? () => verDia(f, sid, aus) : null }, aus.length ? String(aus.length) : '');
          }));
      }))));
  }

  // ---------- lista del mes ----------
  function lista() {
    const ini = `${mes}-01`, fin = `${mes}-${ultimoDia(mes)}`;
    const rows = ausencias.filter(a => a.desde <= fin && a.hasta >= ini && pasaFiltro(a))
      .sort((a, b) => ordenSuc(sucDeAus(a), sucDeAus(b)) || a.desde.localeCompare(b.desde));
    if (!rows.length) return empty('No hay ausencias en este mes', 'Con los filtros elegidos.');
    return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl cob-tbl' },
      h('thead', {}, h('tr', {}, ['Persona', 'Sucursal', 'Tipo', 'Desde', 'Hasta', 'Días', ''].map(t => h('th', { class: t === 'Días' ? 'num' : '' }, t)))),
      h('tbody', {}, rows.map(a => h('tr', { class: 'clic', onclick: () => abrir(a) },
        h('td', {}, h('strong', {}, emp(a.empleado_id)?.nombre)),
        h('td', {}, h('span', { class: 'cob-chip', style: estiloSuc(sucDeAus(a)) }, nombreSuc(sucDeAus(a)))),
        h('td', {}, TIPOS[a.tipo].label, a.titulo ? h('small', { class: 'muted' }, ` · ${a.titulo}`) : null),
        h('td', {}, fechaDia(a.desde)), h('td', {}, fechaDia(a.hasta)), h('td', { class: 'num' }, String(a.dias)),
        h('td', {}, a.aproximada ? h('span', { class: 'pill pill-warn' }, 'Fecha a confirmar') : null))))));
  }

  // ---------- descargar la cobertura de una sucursal (reemplaza el archivo por sucursal) ----------
  function descargar() {
    const ids = [...new Set(empleados.map(e => e.sucursal_id).filter(Boolean))].sort((a, b) => ordenSuc(sucDe(a), sucDe(b)));
    const suc = h('select', { id: 'dl-suc' }, h('option', { value: '' }, 'Todas las sucursales'), ids.map(id => h('option', { value: id, selected: String(id) === filtroSuc }, sucDe(id)?.nombre)));
    const desde = h('input', { type: 'date', id: 'dl-desde', value: `${mes}-01` });
    const hasta = h('input', { type: 'date', id: 'dl-hasta', value: `${mesMas(mes, 11)}-${ultimoDia(mesMas(mes, 11))}` });
    const sinEventos = h('input', { type: 'checkbox', id: 'dl-ev', checked: true });
    modal({ title: 'Descargar cobertura', body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Una planilla con las ausencias de la sucursal, para mandarle o imprimir.'),
      field('Sucursal', suc), h('div', { class: 'grid2' }, field('Desde', desde), field('Hasta', hasta)),
      h('label', { class: 'check-mini' }, sinEventos, ' Incluir eventos y días libres')),
      actions: [{ label: 'Cancelar' }, { label: 'Descargar (Excel/CSV)', kind: 'primary', onClick: () => {
        const rows = ausencias.filter(a => a.desde <= hasta.value && a.hasta >= desde.value && (!suc.value || emp(a.empleado_id)?.sucursal_id === +suc.value)
          && (sinEventos.checked || a.tipo === 'vacaciones')).sort((a, b) => a.desde.localeCompare(b.desde));
        if (!rows.length) { toast('No hay ausencias en esas fechas', 'bad'); return false; }
        const filas = [['Persona', 'Sucursal', 'Tipo', 'Desde', 'Hasta', 'Días', 'Detalle', 'Fecha a confirmar']];
        for (const a of rows) filas.push([emp(a.empleado_id)?.nombre, sucDeAus(a)?.nombre || 'Sin sucursal', TIPOS[a.tipo].label,
          a.desde.split('-').reverse().join('/'), a.hasta.split('-').reverse().join('/'), a.dias, a.titulo || '', a.aproximada ? 'Sí' : '']);
        const txt = '﻿' + filas.map(f => f.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const nom = suc.value ? sucDe(+suc.value)?.nombre : 'todas las sucursales';
        const el = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv' })), download: `Cobertura ${nom}.csv` });
        document.body.append(el); el.click(); el.remove();
      } }] });
  }

  // ---------- encabezado, filtros y referencias ----------
  const aConfirmar = () => ausencias.filter(a => a.aproximada && a.hasta >= hoy).length;
  const sinSuc = () => empleados.filter(e => e.activo && !e.sucursal_id).length;
  function pintar() {
    const idsSuc = [...new Set(empleados.map(e => e.sucursal_id ?? null))].sort((a, b) => ordenSuc(sucDe(a), sucDe(b)));
    const grupos = [...new Set(idsSuc.map(id => grupoSuc(sucDe(id))))];
    const selSuc = h('select', { 'aria-label': 'Sucursal', onchange: e => { filtroSuc = e.target.value; pintar(); } },
      h('option', { value: '' }, 'Todas las sucursales'),
      idsSuc.map(id => h('option', { value: id ?? 'sin', selected: String(id ?? 'sin') === filtroSuc }, id ? sucDe(id)?.nombre : 'Sin sucursal')));
    const selTipo = h('select', { 'aria-label': 'Tipo', onchange: e => { filtroTipo = e.target.value; pintar(); } },
      h('option', { value: '' }, 'Todos los tipos'), Object.entries(TIPOS).map(([k, t]) => h('option', { value: k, selected: k === filtroTipo }, t.label)));
    const nConf = aConfirmar(), nSin = sinSuc();
    cont.replaceChildren(
      nConf || nSin ? h('div', { class: 'notice cob-aviso' },
        nConf ? h('span', {}, h('strong', {}, `${nConf} fecha${nConf > 1 ? 's' : ''} a confirmar`), ' (importadas del Excel por semana). ',
          h('button', { class: 'link', onclick: () => { soloConfirmar = !soloConfirmar; vista = 'lista'; pintarTabs(); pintar(); } }, soloConfirmar ? 'Ver todas' : 'Ver solo esas')) : null,
        nSin ? h('span', {}, h('strong', {}, `${nSin} persona${nSin > 1 ? 's' : ''} sin sucursal`), ': asignala en ', h('a', { href: '#empleados' }, 'Empleados'), '.') : null) : null,
      h('div', { class: 'toolbar cob-barra-mes' },
        h('div', { class: 'cob-mes' },
          h('button', { class: 'btn', 'aria-label': 'Mes anterior', onclick: () => { mes = mesMas(mes, -1); pintar(); } }, '‹'),
          h('strong', {}, mesTxt(mes)),
          h('button', { class: 'btn', 'aria-label': 'Mes siguiente', onclick: () => { mes = mesMas(mes, 1); pintar(); } }, '›'),
          mes !== hoy.slice(0, 7) ? h('button', { class: 'link', onclick: () => { mes = hoy.slice(0, 7); pintar(); } }, 'Hoy') : null),
        h('div', { class: 'filters toolbar' }, selSuc, selTipo,
          soloConfirmar ? h('button', { class: 'pill pill-warn cob-quitar', onclick: () => { soloConfirmar = false; pintar(); } }, 'Solo a confirmar ✕') : null)),
      h('div', { class: 'cob-refs' }, grupos.map(g => h('span', { class: 'cob-chip', style: `--s-bg:${COLORES[g].bg};--s-bd:${COLORES[g].bd}` }, COLORES[g].txt)),
        h('span', { class: 'cob-ref-aprox' }, '≈ fecha estimada'), h('span', { class: 'cob-ref-choque' }, '⚠ dos o más de la misma sucursal')),
      vista === 'calendario' ? calendario() : vista === 'sucursal' ? porSucursal() : lista());
  }
  const tabBar = h('div');
  const pintarTabs = () => tabBar.replaceChildren(tabs([['calendario', 'Calendario'], ['sucursal', 'Por sucursal'], ['lista', 'Lista']], vista, v => { vista = v; pintarTabs(); pintar(); }));
  pintarTabs(); pintar();

  return h('div', { class: 'view cobertura' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'RRHH Grassi'), h('h1', {}, 'Cobertura'),
        h('p', { class: 'muted' }, 'Vacaciones, días libres, francos y eventos de cada sucursal. Tocá una franja para ver o corregir.')),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', onclick: descargar }, 'Descargar'),
        h('button', { class: 'btn primary', id: 'au-nueva', onclick: () => fichaAusencia({ api, a: { desde: mes === hoy.slice(0, 7) ? hoy : `${mes}-01` }, empleados, sucursales, ausencias, onDone: recargar }) }, '+ Cargar ausencia'))),
    h('div', { class: 'toolbar no-print' }, tabBar),
    cont);
}
