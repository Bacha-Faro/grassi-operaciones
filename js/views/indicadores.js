// Indicadores: gasto y consumo por período, sucursal, categoría e insumo; precios por proveedor.
import { h, money, n, pct, empty, groupBy, sum, cargarScript } from '../ui.js?v=20261107-1537';

const charts = [];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const SERIES = ['--s1', '--s2', '--s3'];

function baseOpts(extra = {}) {
  const ink = css('--muted'), grid = css('--grid');
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: ink, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' } },
      tooltip: { backgroundColor: css('--surface'), titleColor: css('--fg'), bodyColor: css('--fg'), borderColor: css('--line'), borderWidth: 1, padding: 10,
        callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${money(c.parsed[extra.indexAxis === 'y' ? 'x' : 'y'])}` } } },
    scales: {
      x: { ticks: { color: ink }, grid: { display: extra.indexAxis === 'y', color: grid }, border: { color: grid } },
      y: { ticks: { color: ink }, grid: { display: extra.indexAxis !== 'y', color: grid }, border: { display: false } } },
    ...extra,
  };
}
const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const kTicks = v => `$${compact.format(v)}`;

function chart(canvas, cfg) {
  if (!window.Chart) { canvas.replaceWith(h('p', { class: 'muted' }, 'No se pudo cargar la librería de gráficos.')); return; }
  charts.push(new window.Chart(canvas, cfg));
}

export async function render({ api, cat }) {
  charts.splice(0).forEach(c => c.destroy());
  const [rows, precios, tiempos, periodos] = await Promise.all([api.consumo(), api.precios(), api.tiempos(), api.periodos(),
    cargarScript('vendor/chart.umd.js').catch(() => null)]);
  if (!rows.length) return empty('Todavía no hay datos', 'Los indicadores se arman a medida que se auditan solicitudes.');

  const pers = periodos.filter(p => rows.some(r => r.periodo === p.nombre)).sort((a, b) => a.desde.localeCompare(b.desde));
  const conAuditoria = pers.filter(p => rows.some(r => r.periodo === p.nombre && r.estado_item !== 'pendiente'));
  // por defecto el último período cerrado: el abierto todavía está incompleto
  let perSel = [...conAuditoria].reverse().find(p => p.estado === 'cerrado')?.nombre || conAuditoria.at(-1)?.nombre || pers.at(-1).nombre;
  let catSel = '';
  const root = h('div', { class: 'stack' });

  function pintar() {
    charts.splice(0).forEach(c => c.destroy());
    const R = rows.filter(r => !catSel || r.categoria === catSel);
    const idx = pers.findIndex(p => p.nombre === perSel);
    const prev = pers[idx - 1]?.nombre;
    const delPer = R.filter(r => r.periodo === perSel);
    const gasto = sum(delPer, r => r.monto), gastoPrev = prev ? sum(R.filter(r => r.periodo === prev), r => r.monto) : null;
    const pedido = sum(delPer, r => r.cantidad_solicitada * r.precio_unit);
    // solicitudes de ese período: se cargan desde ~20 días antes del inicio hasta su fin
    const ini = new Date(pers[idx].desde) - 20 * 864e5, fin = +new Date(pers[idx].hasta) + 864e5;
    const tPer = tiempos.filter(t => t.horas_a_auditoria !== null && +new Date(t.created_at) >= ini && +new Date(t.created_at) < fin);
    const hAud = tPer.length ? sum(tPer, t => t.horas_a_auditoria) / tPer.length : null;

    // ahorro potencial: cotización más baja que el precio pagado en el período
    const ultimoPorProv = {};
    for (const p of precios) { const k = `${p.producto}|${p.proveedor}`; if (!ultimoPorProv[k] || p.fecha > ultimoPorProv[k].fecha) ultimoPorProv[k] = p; }
    const mejor = {};
    for (const p of Object.values(ultimoPorProv)) if (!mejor[p.producto] || p.precio < mejor[p.producto].precio) mejor[p.producto] = p;
    const ahorros = Object.values(groupBy(delPer, r => r.producto)).map(rs => {
      const m = mejor[rs[0].producto]; const cant = sum(rs, r => r.cantidad_aprobada);
      return m && m.proveedor !== rs[0].proveedor && m.precio < rs[0].precio_unit ? { producto: rs[0].producto, proveedor: m.proveedor, ahorro: (rs[0].precio_unit - m.precio) * cant, pu: rs[0].precio_unit, alt: m.precio } : null;
    }).filter(Boolean).sort((a, b) => b.ahorro - a.ahorro);

    const tiles = h('div', { class: 'kpis' },
      kpi('Gasto aprobado', money(gasto), gastoPrev ? `${pct((gasto / gastoPrev - 1) * 100)} vs ${prev}` : 'Sin período anterior', gastoPrev && gasto > gastoPrev * 1.1 ? 'warn' : null),
      kpi('Aprobado sobre lo pedido', pedido ? `${Math.round(gasto / pedido * 100)}%` : '—', `${money(pedido - gasto)} recortado en auditoría`),
      kpi('Tiempo a auditoría', hAud === null ? '—' : hAud < 24 ? `${Math.round(hAud)} h` : `${(hAud / 24).toFixed(1)} días`, 'Promedio desde que la sucursal envía'),
      kpi('Ahorro posible', money(sum(ahorros, a => a.ahorro)), ahorros.length ? `${ahorros.length} insumos con cotización más baja` : 'Sin cotizaciones más baratas', ahorros.length ? 'good' : null));

    // 1) evolución mensual por categoría
    const cats = cat.categorias.map(c => c.nombre).filter(c => !catSel || c === catSel);
    const cv1 = h('canvas', { 'aria-label': 'Gasto mensual por categoría', role: 'img' });
    // 2) por sucursal
    const porSuc = Object.entries(groupBy(delPer, r => r.sucursal)).map(([s, rs]) => [s, sum(rs, r => r.monto)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const cv2 = h('canvas', { 'aria-label': `Gasto por sucursal en ${perSel}`, role: 'img' });
    // 3) top insumos
    const top = Object.entries(groupBy(delPer, r => r.producto)).map(([p, rs]) => ({ p, monto: sum(rs, r => r.monto), cant: sum(rs, r => r.cantidad_aprobada) }))
      .filter(x => x.monto > 0).sort((a, b) => b.monto - a.monto).slice(0, 10);
    const cv3 = h('canvas', { 'aria-label': `Insumos con más gasto en ${perSel}`, role: 'img' });
    // 4) precios
    const prodsConPrecio = [...new Set(precios.filter(p => !catSel || p.categoria === catSel).map(p => p.producto))].sort();
    const prodSel = h('select', { id: 'ind-prod', 'aria-label': 'Insumo para ver precios', onchange: () => pintarPrecio() },
      prodsConPrecio.map(p => h('option', { value: p, selected: p === (top[0]?.p) }, p)));
    const cvWrap = h('div', { class: 'chart-box' });
    const precioInfo = h('p', { class: 'muted' });
    function pintarPrecio() {
      const ps = precios.filter(p => p.producto === prodSel.value).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const fechas = [...new Set(ps.map(p => p.fecha.slice(0, 7)))].sort();
      const provs = [...new Set(ps.map(p => p.proveedor))].slice(0, 3);
      const cv = h('canvas', { 'aria-label': `Precio de ${prodSel.value}`, role: 'img' });
      cvWrap.replaceChildren(cv);
      chart(cv, { type: 'line', data: { labels: fechas.map(etiquetaMes), datasets: provs.map((pv, i) => ({
        label: pv, spanGaps: true, borderColor: css(SERIES[i]), backgroundColor: css(SERIES[i]), borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0,
        pointBorderColor: css('--surface'), pointBorderWidth: 2, stepped: false,
        data: fechas.map(f => ps.filter(p => p.proveedor === pv && p.fecha.startsWith(f)).at(-1)?.precio ?? null) })) },
        options: baseOpts({ scales: { x: { ticks: { color: css('--muted') }, grid: { display: false } }, y: { ticks: { color: css('--muted'), callback: kTicks, maxTicksLimit: 6 }, grid: { color: css('--grid') }, border: { display: false } } } }) });
      const pagos = ps.filter(p => p.fuente === 'oc');
      if (pagos.length > 1) precioInfo.textContent = `Variación desde ${etiquetaMes(pagos[0].fecha.slice(0, 7))}: ${pct((pagos.at(-1).precio / pagos[0].precio - 1) * 100)} (${money(pagos[0].precio)} → ${money(pagos.at(-1).precio)}).`;
      else precioInfo.textContent = 'Todavía no hay compras suficientes para ver la evolución.';
    }

    // 5) matriz sucursal x categoría
    const sucs = [...new Set(delPer.filter(r => r.monto > 0).map(r => r.sucursal))].sort();
    const matriz = h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Sucursal'), cats.map(c => h('th', { class: 'num' }, c)), h('th', { class: 'num' }, 'Total'))),
      h('tbody', {}, sucs.map(s => h('tr', {}, h('td', {}, s),
        cats.map(c => h('td', { class: 'num' }, money(sum(delPer.filter(r => r.sucursal === s && r.categoria === c), r => r.monto)))),
        h('td', { class: 'num strong' }, money(sum(delPer.filter(r => r.sucursal === s), r => r.monto)))))),
      h('tfoot', {}, h('tr', {}, h('td', {}, 'Total'), cats.map(c => h('td', { class: 'num' }, money(sum(delPer.filter(r => r.categoria === c), r => r.monto)))), h('td', { class: 'num' }, money(gasto))))));

    root.replaceChildren(tiles,
      h('div', { class: 'charts' },
        card(`Gasto mensual por categoría`, 'Lo aprobado en cada período, a precio de compra', h('div', { class: 'chart-box tall' }, cv1), 'wide'),
        card(`Gasto por sucursal · ${perSel}`, null, h('div', { class: 'chart-box', style: `height:${Math.max(220, porSuc.length * 30 + 40)}px` }, cv2)),
        card(`Insumos con más gasto · ${perSel}`, null, h('div', { class: 'chart-box', style: `height:${Math.max(220, top.length * 30 + 40)}px` }, cv3)),
        card('Precio por proveedor', 'Precios pagados en órdenes de compra y cotizaciones cargadas', h('div', { class: 'stack' }, prodSel, cvWrap, precioInfo), 'wide'),
        ahorros.length ? card('Dónde se puede ahorrar', `Insumos de ${perSel} con una cotización más baja que lo pagado`, h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Pagado'), h('th', {}, 'Mejor cotización'), h('th', { class: 'num' }, 'Ahorro'))),
          h('tbody', {}, ahorros.slice(0, 8).map(a => h('tr', {}, h('td', {}, a.producto), h('td', { class: 'num' }, money(a.pu)),
            h('td', {}, `${money(a.alt)} · `, h('span', { class: 'muted' }, a.proveedor)), h('td', { class: 'num strong' }, money(a.ahorro))))))), 'wide') : null,
        card(`Consumo por sucursal y categoría · ${perSel}`, null, matriz, 'wide')));

    const ultimos = pers.slice(Math.max(0, idx - 11), idx + 1);
    chart(cv1, { type: 'bar', data: { labels: ultimos.map(p => etiquetaMes(p.desde.slice(0, 7))), datasets: cats.map((c, i) => ({
      label: c, backgroundColor: css(SERIES[i % 3]), borderColor: css('--surface'), borderWidth: { top: 2 }, borderSkipped: 'bottom', maxBarThickness: 36,
      borderRadius: i === cats.length - 1 ? { topLeft: 4, topRight: 4 } : 0,
      data: ultimos.map(p => sum(R.filter(r => r.periodo === p.nombre && r.categoria === c), r => r.monto)) })) },
      options: baseOpts({ scales: { x: { stacked: true, ticks: { color: css('--muted') }, grid: { display: false } }, y: { stacked: true, ticks: { color: css('--muted'), callback: kTicks, maxTicksLimit: 6 }, grid: { color: css('--grid') }, border: { display: false } } } }) });
    const hbar = (cv, labels, data) => chart(cv, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: css('--s1'), borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'left', maxBarThickness: 18 }] },
      options: baseOpts({ indexAxis: 'y', plugins: { legend: { display: false }, tooltip: baseOpts({ indexAxis: 'y' }).plugins.tooltip },
        scales: { x: { ticks: { color: css('--muted'), callback: kTicks, maxTicksLimit: 5 }, grid: { color: css('--grid') }, border: { display: false } }, y: { ticks: { color: css('--fg') }, grid: { display: false } } } }) });
    hbar(cv2, porSuc.map(x => x[0]), porSuc.map(x => x[1]));
    hbar(cv3, top.map(x => x.p), top.map(x => x.monto));
    if (prodsConPrecio.length) pintarPrecio();
  }

  const selPer = h('select', { id: 'ind-per', 'aria-label': 'Período', onchange: e => { perSel = e.target.value; pintar(); } },
    [...pers].reverse().map(p => h('option', { value: p.nombre, selected: p.nombre === perSel }, p.nombre)));
  const selCat = h('select', { id: 'ind-cat', 'aria-label': 'Categoría', onchange: e => { catSel = e.target.value; pintar(); } },
    h('option', { value: '' }, 'Todas las categorías'), cat.categorias.map(c => h('option', { value: c.nombre }, c.nombre)));

  const view = h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Análisis'), h('h1', {}, 'Indicadores de consumo y compras'),
      h('p', { class: 'muted' }, 'Montos sin IVA. Lo pendiente de auditoría no suma al gasto.'))),
    h('div', { class: 'toolbar filters' }, selPer, selCat),
    root);
  requestAnimationFrame(pintar);
  return view;
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = ym => { const [y, m] = ym.split('-'); return `${MES[+m - 1]} ${y.slice(2)}`; };
const kpi = (label, valor, sub, tone) => h('div', { class: `kpi${tone ? ' kpi-' + tone : ''}` }, h('span', { class: 'kpi-label' }, label), h('strong', { class: 'kpi-val mono' }, valor), h('small', {}, sub));
const card = (title, sub, body, size) => h('section', { class: `chart-card${size ? ' ' + size : ''}` }, h('h2', {}, title), sub ? h('p', { class: 'muted' }, sub) : null, body);
