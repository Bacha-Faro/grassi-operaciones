// Droguería · Conciliación: lo que la droguería despachó (Quantio) contra lo que cada farmacia ingresó (Plex).
// Hasta que Galbop habilite las APIs, en la demo trabaja con datos de prueba y en producción muestra el aviso de conexión pendiente.
import { h, money, n, fecha, modal, empty, descargarCSV } from '../ui.js?v=20261113-1943';

const ESTADOS = {
  ok:           ['Conciliado', 'ok'],
  diferencia:   ['Con diferencia', 'bad'],
  sin_ingresar: ['Sin ingresar', 'bad'],
  demorado:     ['Ingresado con demora', 'warn'],
  sin_confirmar:['Sin confirmar en Plex', 'warn'],
  en_camino:    ['En camino', 'info'],
};
const PLEX_TXT = { N: 'Pendiente de confirmar', C: 'Confirmado', A: 'Anulado', U: 'Actualizado' };
const DEMORA_MAX = 2; // días: más que esto se marca como demora
const dias = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400e3);
const hoyISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const sumarDias = (f, d) => { const t = new Date(`${f}T12:00:00`); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

export function estadoDe(c, hoy = hoyISO()) {
  const i = c.ingreso;
  if (!i || i.estado === 'A') return dias(c.fecha, hoy) <= DEMORA_MAX ? 'en_camino' : 'sin_ingresar';
  if (i.unidades_recibidas !== c.unidades) return 'diferencia';
  if (i.estado === 'N') return 'sin_confirmar';
  if (dias(c.fecha, i.fecha) > DEMORA_MAX) return 'demorado';
  return 'ok';
}
const pillEstado = e => h('span', { class: `pill pill-${ESTADOS[e][1]}` }, ESTADOS[e][0]);

export async function render({ api, cat }) {
  let desde = sumarDias(hoyISO(), -30), hasta = hoyISO(), fSuc = '', fEstado = 'problemas', q = '';
  let datos = { modo: 'demo', filas: [] };
  const cont = h('div', { class: 'stack' });
  const aviso = h('div');

  async function cargar() {
    cont.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
    datos = await api.conciliacion({ desde, hasta });
    datos.filas.forEach(c => { c._estado = estadoDe(c); c._dif = c.ingreso ? c.ingreso.unidades_recibidas - c.unidades : null; });
    aviso.replaceChildren(datos.modo === 'demo'
      ? h('p', { class: 'aviso aviso-warn' }, h('strong', {}, 'Datos de prueba. '), 'Así se va a ver cuando estén conectados Quantio (lo que despacha la droguería) y Plex (lo que ingresa cada farmacia). Los números no son reales.')
      : datos.modo === 'sin_conexion'
        ? h('p', { class: 'aviso aviso-muted' }, h('strong', {}, 'Conexión pendiente. '), 'Esperando que el proveedor de Plex y Quantio habilite el acceso a sus sistemas. Cuando esté, esta pantalla se llena sola.')
        : null);
    pintar();
  }

  const filtradas = () => datos.filas.filter(c => (!fSuc || String(c.sucursal_id) === fSuc)
    && (fEstado === 'todos' || (fEstado === 'problemas' ? c._estado !== 'ok' && c._estado !== 'en_camino' : c._estado === fEstado))
    && (!q || c.comprobante.toLowerCase().includes(q) || c.renglones.some(r => r.producto.toLowerCase().includes(q) || r.lote.toLowerCase().includes(q))));

  function detalle(c) {
    const i = c.ingreso;
    modal({ title: `${c.tipo === 'remito' ? 'Remito' : 'Factura'} ${c.comprobante}`, wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'conc-lados' },
          h('div', { class: 'conc-lado' }, h('small', { class: 'eyebrow' }, 'Despachó la droguería (Quantio)'),
            h('strong', {}, fecha(c.fecha)), h('span', {}, `${c.sucursal} · ${n(c.unidades)} unidades · ${money(c.total)}`)),
          h('div', { class: 'conc-lado' }, h('small', { class: 'eyebrow' }, `Ingresó la farmacia (Plex)`),
            i ? [h('strong', {}, `${fecha(i.fecha)}${dias(c.fecha, i.fecha) ? ` · ${dias(c.fecha, i.fecha)} día${dias(c.fecha, i.fecha) > 1 ? 's' : ''} después` : ' · en el día'}`),
              h('span', {}, `${n(i.unidades_recibidas)} recibidas de ${n(i.unidades_facturadas)} · ${PLEX_TXT[i.estado] || i.estado}`)]
              : [h('strong', {}, 'Todavía no se ingresó'), h('span', { class: 'muted' }, `Hace ${dias(c.fecha, hoyISO())} días que salió de la droguería.`)])),
        h('div', {}, pillEstado(c._estado)),
        c._dif ? h('p', { class: `aviso aviso-${c._dif < 0 ? 'bad' : 'warn'}` }, c._dif < 0
          ? `Faltan ${n(-c._dif)} unidad${c._dif < -1 ? 'es' : ''}: la farmacia recibió menos de lo despachado. Revisar con la farmacia y la droguería antes de cerrar.`
          : `Sobran ${n(c._dif)} unidad${c._dif > 1 ? 'es' : ''}: la farmacia cargó más de lo despachado.`) : null,
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ['Producto', 'Lote', 'Vence', 'Cant.', 'Precio', 'Subtotal'].map((x, k) => h('th', { class: k >= 3 ? 'num' : '' }, x)))),
          h('tbody', {}, c.renglones.map(r => h('tr', {}, h('td', {}, r.producto), h('td', { class: 'mono' }, r.lote), h('td', {}, fecha(r.vence)),
            h('td', { class: 'num' }, n(r.cantidad)), h('td', { class: 'num' }, money(r.precio)), h('td', { class: 'num' }, money(r.cantidad * r.precio))))))),
        h('small', { class: 'muted' }, 'El detalle por producto y lote viene de Quantio. De Plex se toma el total de unidades recibidas del comprobante.')),
      actions: [{ label: 'Cerrar' }] });
  }

  function pintar() {
    const todas = datos.filas;
    if (!todas.length) return cont.replaceChildren(datos.modo === 'sin_conexion'
      ? empty('Sin datos todavía', 'La conciliación empieza a funcionar cuando se conecten Quantio y Plex.')
      : empty('No hay comprobantes en esas fechas'));
    const cuenta = e => todas.filter(c => c._estado === e).length;
    const ingresadas = todas.filter(c => c.ingreso && c.ingreso.estado !== 'A');
    const demoraProm = ingresadas.length ? ingresadas.reduce((a, c) => a + dias(c.fecha, c.ingreso.fecha), 0) / ingresadas.length : null;
    const faltan = todas.reduce((a, c) => a + (c._dif < 0 ? -c._dif : 0), 0);
    const exigibles = todas.filter(c => c._estado !== 'en_camino').length;
    const kpi = (v, l, tono) => h('div', { class: `kpi ${tono || ''}` }, h('strong', {}, v), h('span', {}, l));
    const kpis = h('div', { class: 'kpis tk-kpis' },
      kpi(n(todas.length), 'comprobantes despachados'),
      kpi(exigibles ? `${Math.round(cuenta('ok') / exigibles * 100)}%` : '—', 'conciliados sin problemas'),
      kpi(cuenta('diferencia'), 'con diferencia de unidades', cuenta('diferencia') ? 'bad' : ''),
      kpi(n(faltan), 'unidades faltantes', faltan ? 'bad' : ''),
      kpi(cuenta('sin_ingresar'), `sin ingresar (más de ${DEMORA_MAX} días)`, cuenta('sin_ingresar') ? 'bad' : ''),
      kpi(cuenta('sin_confirmar'), 'sin confirmar en Plex', cuenta('sin_confirmar') ? 'warn' : ''),
      kpi(demoraProm === null ? '—' : `${demoraProm.toFixed(1).replace('.', ',')} días`, 'demora promedio de ingreso', demoraProm > DEMORA_MAX ? 'warn' : ''));

    // resumen por farmacia
    const porSuc = {};
    for (const c of todas) (porSuc[c.sucursal] ||= []).push(c);
    const resumen = h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', {}, 'Por farmacia')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover rep-tbl' },
        h('thead', {}, h('tr', {}, ['Farmacia', 'Despachados', 'Conciliados', 'Con diferencia', 'Faltan (unid.)', 'Sin ingresar', 'Demora prom.'].map((x, k) => h('th', { class: k ? 'num' : '' }, x)))),
        h('tbody', {}, Object.entries(porSuc).sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true })).map(([s, cs]) => {
          const ing = cs.filter(c => c.ingreso), ex = cs.filter(c => c._estado !== 'en_camino').length;
          const d = cs.filter(c => c._estado === 'diferencia').length, si = cs.filter(c => c._estado === 'sin_ingresar').length;
          const fa = cs.reduce((a, c) => a + (c._dif < 0 ? -c._dif : 0), 0);
          const dp = ing.length ? ing.reduce((a, c) => a + dias(c.fecha, c.ingreso.fecha), 0) / ing.length : null;
          return h('tr', { tabindex: 0, title: 'Ver solo esta farmacia', onclick: () => { fSuc = String(cs[0].sucursal_id); selSuc.value = fSuc; pintar(); } },
            h('td', {}, h('strong', {}, s)), h('td', { class: 'num' }, cs.length),
            h('td', { class: 'num' }, ex ? `${Math.round(cs.filter(c => c._estado === 'ok').length / ex * 100)}%` : '—'),
            h('td', { class: `num${d ? ' txt-bad' : ''}` }, d || '—'), h('td', { class: `num${fa ? ' txt-bad' : ''}` }, fa || '—'),
            h('td', { class: `num${si ? ' txt-bad' : ''}` }, si || '—'),
            h('td', { class: `num${dp > DEMORA_MAX ? ' txt-warn' : ''}` }, dp === null ? '—' : `${dp.toFixed(1).replace('.', ',')} d`));
        })))));

    const rows = filtradas().sort((a, b) => b.fecha.localeCompare(a.fecha) || a.sucursal.localeCompare(b.sucursal, 'es', { numeric: true }));
    const lista = h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', {}, `Comprobantes (${rows.length})`)),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover' },
        h('thead', {}, h('tr', {}, ['Despacho', 'Comprobante', 'Farmacia', 'Unid.', 'Recibidas', 'Ingreso en Plex', 'Estado'].map((x, k) => h('th', { class: k === 3 || k === 4 ? 'num' : '' }, x)))),
        h('tbody', {}, rows.slice(0, 300).map(c => h('tr', { tabindex: 0, onclick: () => detalle(c), onkeydown: e => { if (e.key === 'Enter') detalle(c); } },
          h('td', {}, fecha(c.fecha)), h('td', { class: 'mono' }, c.comprobante), h('td', {}, c.sucursal),
          h('td', { class: 'num' }, n(c.unidades)),
          h('td', { class: `num${c._dif ? ' txt-bad' : ''}` }, c.ingreso ? `${n(c.ingreso.unidades_recibidas)}${c._dif ? ` (${c._dif > 0 ? '+' : ''}${c._dif})` : ''}` : '—'),
          h('td', {}, c.ingreso ? `${fecha(c.ingreso.fecha)}${dias(c.fecha, c.ingreso.fecha) > DEMORA_MAX ? ` · ${dias(c.fecha, c.ingreso.fecha)} días` : ''}` : '—'),
          h('td', {}, pillEstado(c._estado)))))))
        : h('p', { class: 'muted' }, fEstado === 'problemas' ? 'Sin problemas con estos filtros. 👍' : 'No hay comprobantes con estos filtros.'),
      rows.length > 300 ? h('small', { class: 'muted' }, 'Se muestran los 300 más recientes. Descargá el CSV para ver todos.') : null);

    cont.replaceChildren(kpis, resumen, lista);
  }

  const descargar = () => {
    const rows = filtradas();
    descargarCSV(`Conciliacion drogueria ${desde} a ${hasta}`, [['Despacho', 'Tipo', 'Comprobante', 'Farmacia', 'Unidades despachadas', 'Total', 'Ingreso Plex', 'Estado Plex', 'Unidades recibidas', 'Diferencia', 'Días de demora', 'Estado'],
      ...rows.map(c => [fecha(c.fecha), c.tipo, c.comprobante, c.sucursal, c.unidades, c.total, c.ingreso ? fecha(c.ingreso.fecha) : '', c.ingreso ? PLEX_TXT[c.ingreso.estado] : '',
        c.ingreso?.unidades_recibidas ?? '', c._dif ?? '', c.ingreso ? dias(c.fecha, c.ingreso.fecha) : '', ESTADOS[c._estado][0]])]);
  };

  const farmacias = cat.sucursales.filter(s => s.tipo === 'sucursal');
  const selSuc = h('select', { 'aria-label': 'Farmacia', onchange: e => { fSuc = e.target.value; pintar(); } },
    h('option', { value: '' }, 'Todas las farmacias'), farmacias.map(s => h('option', { value: s.id }, s.nombre)));
  const inDesde = h('input', { type: 'date', value: desde, 'aria-label': 'Desde', onchange: e => { desde = e.target.value; cargar(); } });
  const inHasta = h('input', { type: 'date', value: hasta, 'aria-label': 'Hasta', onchange: e => { hasta = e.target.value; cargar(); } });
  await cargar();

  return h('div', { class: 'view conciliacion' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Droguería'), h('h1', {}, 'Conciliación'),
        h('p', { class: 'muted' }, 'Lo que despachó la droguería contra lo que ingresó cada farmacia: faltantes, comprobantes sin cargar y demoras.')),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: descargar }, 'Descargar CSV'))),
    aviso,
    h('div', { class: 'toolbar filters' },
      h('label', { class: 'check-mini' }, 'Desde ', inDesde), h('label', { class: 'check-mini' }, 'Hasta ', inHasta),
      selSuc,
      h('select', { 'aria-label': 'Estado', onchange: e => { fEstado = e.target.value; pintar(); } },
        h('option', { value: 'problemas' }, 'Solo con problemas'), h('option', { value: 'todos' }, 'Todos'),
        Object.entries(ESTADOS).map(([k, [l]]) => h('option', { value: k }, l))),
      h('input', { type: 'search', placeholder: 'Comprobante, producto o lote…', 'aria-label': 'Buscar', oninput: e => { q = e.target.value.trim().toLowerCase(); pintar(); } })),
    cont);
}
