// Droguería · Indicadores: servicio a farmacias, tiempos, stock, robot y compras.
// Los números los calcula la compu de IT con los datos de Quantio (herramientas/subir_indicadores.py) y los sube
// de lunes a sábado a la noche; esta pantalla solo los muestra. Ven IT y Dirección.
import { h, money, n, empty, tabs, modal, cargarScript, descargarCSV, fecha } from '../ui.js?v=20261120-1316';

const charts = [];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const nf1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const f1 = v => v == null ? '—' : nf1.format(v);
const f0 = v => v == null ? '—' : nf0.format(v);
const pc = (v, d = 1) => v == null ? '—' : `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v * 100)}%`;
const hs = v => v == null ? '—' : `${nf1.format(v)} h`;
const mill = v => v == null ? '—' : Math.abs(v) >= 1e6 ? `$ ${nf1.format(v / 1e6)} M` : money(v);
const fISO = s => s ? fecha(String(s).slice(0, 10)) : '—';

function chart(canvas, cfg) {
  if (!window.Chart) { canvas.replaceWith(h('p', { class: 'muted' }, 'No se pudo cargar la librería de gráficos.')); return; }
  charts.push(new window.Chart(canvas, cfg));
}
function opts(extra = {}, fmtY = f0) {
  const ink = css('--muted'), grid = css('--grid');
  const eje = extra.indexAxis === 'y' ? 'x' : 'y';
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false, labels: { color: ink, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' } },
      tooltip: { backgroundColor: css('--surface'), titleColor: css('--fg'), bodyColor: css('--fg'), borderColor: css('--line'), borderWidth: 1, padding: 10,
        callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${fmtY(c.parsed[eje])}` } } },
    scales: {
      x: { ticks: { color: ink, ...(eje === 'x' ? { callback: v => fmtY(v) } : {}) }, grid: { display: eje === 'x', color: grid }, border: { color: grid } },
      y: { ticks: { color: ink, ...(eje === 'y' ? { callback: v => fmtY(v) } : {}) }, grid: { display: eje === 'y', color: grid }, border: { display: false }, beginAtZero: true } },
    ...extra,
  };
}
const caja = (alto = 240) => { const c = h('canvas'); return [h('div', { class: 'ind-chart', style: `height:${alto}px` }, c), c]; };
const kpi = (val, label, sub, tono) => h('div', { class: `kpi${tono ? ' kpi-' + tono : ''}` }, h('span', { class: 'kpi-val' }, val), h('span', { class: 'kpi-label' }, label), sub ? h('small', {}, sub) : null);
// tono de una tarjeta: bueno / a mirar / malo según umbrales (menorEsMejor cuando bueno < malo)
const tono = (v, bueno, malo) => v == null ? '' : bueno < malo ? (v <= bueno ? 'good' : v >= malo ? 'bad' : 'warn') : (v >= bueno ? 'good' : v <= malo ? 'bad' : 'warn');
const tabla = (cols, filas) => h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
  h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.num ? 'num' : '' }, c.t)))),
  h('tbody', {}, filas.map(r => h('tr', {}, cols.map(c => { const v = c.f(r); return h('td', { class: [c.num ? 'num' : '', typeof c.cls === 'function' ? c.cls(r) : c.cls || ''].join(' ').trim() }, v); }))))));

export async function render({ api }) {
  charts.splice(0).forEach(c => c.destroy());
  const hace7 = new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10), hoyISO = new Date().toISOString().slice(0, 10);
  const [d, tPuntos, tLect, recep] = await Promise.all([api.indicadoresDrogueria(), api.tempPuntos().catch(() => null), api.tempLecturas(hace7, hoyISO).catch(() => null),
    api.recepcionesDrog ? api.recepcionesDrog().catch(() => null) : null,
    cargarScript('vendor/chart.umd.js').catch(() => null)]);
  if (!d || d.modo !== 'real') {
    return h('div', { class: 'view' },
      h('header', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Droguería'), h('h1', {}, 'Indicadores'))),
      empty('Todavía no hay indicadores', d?.modo === 'demo'
        ? 'En la versión real esta pantalla muestra servicio a farmacias, tiempos de pedido a remito, stock, robot y compras, con datos de Quantio que se actualizan cada noche.'
        : 'Se cargan solos cuando la compu de IT corre la exportación de Quantio (de lunes a sábado a las 19:15).'));
  }
  const D = d.ds;
  const K = Object.fromEntries((D.kpis || []).map(r => [r.clave, r.valor]));
  const clases = D.stock_clases || [];
  const clase = (g, c) => clases.find(r => r.grupo === g && r.clase === c);
  const sumaClases = (g, f) => clases.filter(r => r.grupo === g && f(r.clase)).reduce((a, r) => a + (+r.valor || 0), 0);
  const viejo = d.actualizado && Date.now() - new Date(d.actualizado) > 36 * 3600e3;
  let tab = sessionStorage.getItem('ind-tab') || 'resumen';
  let lista = 'En falta', robot = 'Sumar';
  const cuerpo = h('div', { class: 'tab-cont' });

  const nd = (n, b) => b ? `${f0(n)} de ${f0(b)}` : 'sin base';
  // tarjeta del resumen: nivel (P0…P3), valor, qué es, detalle; sin dato = gris con la fase en que se suma
  const tarjeta = (nivel, val, label, sub, t) => h('div', { class: `kpi ind-card${t ? ' kpi-' + t : ''}` },
    h('span', { class: 'ind-nivel' }, nivel), h('span', { class: 'kpi-val' }, val), h('span', { class: 'kpi-label' }, label), sub ? h('small', {}, sub) : null);
  const sinDato = (nivel, label, cuando) => h('div', { class: 'kpi ind-card ind-sin-dato' },
    h('span', { class: 'ind-nivel' }, nivel), h('span', { class: 'kpi-val' }, 'Sin dato'), h('span', { class: 'kpi-label' }, label), h('small', {}, cuando));

  function temperatura() {
    if (!tPuntos || !tLect) return null;
    const fuera = tLect.filter(l => l.fuera_rango);
    const habiles = [];
    for (let i = 1; i <= 7; i++) { const x = new Date(Date.now() - i * 86400e3); if (x.getDay() >= 1 && x.getDay() <= 5) habiles.push(x.toISOString().slice(0, 10)); }
    const esperadas = habiles.length * 4 * tPuntos.length;
    const cargadas = tLect.filter(l => habiles.includes(l.fecha)).length;
    return { fuera, esperadas, cargadas, puntos: Object.fromEntries(tPuntos.map(p => [p.id, p.nombre])) };
  }

  // tarjetas que salen del registro de llegadas (Droguería → Recepción), en vivo
  function recepcion() {
    if (!recep || !recep.length) return [
      sinDato('P1', 'mercadería pendiente de ingreso', 'Se mide desde que se registren llegadas en Recepción'),
      sinDato('P1', 'ingresada sin guardar', 'Se mide desde que se registren llegadas en Recepción'),
      sinDato('P1', 'dock-to-stock P90 (llegada → disponible)', 'Se mide desde que se registren llegadas en Recepción')];
    const hh = (a, b = Date.now()) => (new Date(b) - new Date(a)) / 3600e3;
    const pend = recep.filter(r => ['recibido', 'en_control', 'listo_ingreso'].includes(r.estado));
    const sinGuardar = recep.filter(r => r.estado === 'ingresado');
    const dts = recep.filter(r => r.estado === 'disponible' && r.disponible_at).map(r => hh(r.llegada_at, r.disponible_at)).sort((a, b) => a - b);
    const p90 = dts.length ? dts[Math.max(0, Math.ceil(dts.length * 0.9) - 1)] : null;
    const viejaPend = pend.length ? Math.max(...pend.map(r => hh(r.llegada_at))) : 0;
    return [
      tarjeta('P1', f0(pend.length), 'llegadas pendientes de ingreso a Quantio', pend.length ? `la más vieja llegó hace ${hs(viejaPend)}` : 'nada esperando', pend.some(r => hh(r.llegada_at) > 8) ? 'bad' : pend.length ? 'warn' : 'good'),
      tarjeta('P1', f0(sinGuardar.length), 'ingresadas en Quantio sin guardar en su lugar', sinGuardar.length ? `la más vieja, hace ${hs(Math.max(...sinGuardar.map(r => hh(r.ingresado_at || r.llegada_at))))}` : 'nada esperando', sinGuardar.some(r => hh(r.ingresado_at || r.llegada_at) > 4) ? 'warn' : 'good'),
      p90 == null ? sinDato('P1', 'dock-to-stock P90 (llegada → disponible)', 'Todavía ninguna llegada quedó disponible en los últimos 7 días')
        : tarjeta('P1', hs(p90), 'dock-to-stock P90: el 90% de lo recibido quedó disponible en menos de eso', `${f0(dts.length)} llegadas en 7 días · mediana ${hs(median(dts))}`, tono(p90, 8, 24))];
  }

  function resumen() {
    const T = temperatura();
    const ven90 = sumaClases('vencimiento', c => c === 'Vencido con stock' || c === 'Vence en 90 días');
    const horasInd = d.actualizado ? (Date.now() - new Date(d.actualizado)) / 3600e3 : null;
    const horasConc = d.conc?.fin ? (Date.now() - new Date(d.conc.fin)) / 3600e3 : null;
    const datosOk = horasInd != null && horasInd < 36 && (horasConc == null || (horasConc < 6 && d.conc.ok !== false));
    const EXC = (D.excepciones || []).slice();
    if (T) T.fuera.forEach(l => EXC.push({ prioridad: 'P0', tipo: 'Temperatura fuera de rango', detalle: `${T.puntos[l.punto_id] || 'Punto'} · ${f1(l.temperatura)} °C${l.humedad != null ? ` · ${f0(l.humedad)}% HR` : ''} · ${fISO(l.fecha)} ${l.turno}${l.accion ? ' · ' + l.accion : ' · sin acción registrada'}`, farmacia: 'Droguería', horas: null }));
    const ORD = { P0: 0, P1: 1, P2: 2, P3: 3 };
    EXC.sort((a, b) => ORD[a.prioridad] - ORD[b.prioridad] || (b.horas ?? -1) - (a.horas ?? -1));
    let filtro = 'todas';
    const zona = h('div');
    const pintar = () => {
      const L = EXC.filter(e => filtro === 'todas' || e.prioridad === filtro);
      zona.replaceChildren(L.length ? tabla([
        { t: 'Prioridad', f: e => h('span', { class: `pill ${e.prioridad === 'P0' ? 'pill-bad' : e.prioridad === 'P1' ? 'pill-warn' : 'pill-muted'}` }, e.prioridad) },
        { t: 'Qué pasa', f: e => h('strong', {}, e.tipo) }, { t: 'Dónde', f: e => e.farmacia }, { t: 'Detalle', f: e => e.detalle },
        { t: 'Antigüedad', num: 1, f: e => e.horas == null ? '—' : `${f1(e.horas)} h háb.` }], L.slice(0, 60))
        : h('p', { class: 'muted' }, 'Nada pendiente con esta prioridad.'),
        L.length > 60 ? h('p', { class: 'muted' }, `Se muestran 60 de ${f0(L.length)}.`) : null);
    };
    pintar();
    const cuenta = p => EXC.filter(e => e.prioridad === p).length;
    return h('div', { class: 'tab-cont' },
      h('p', { class: 'muted' }, 'P0 sanitario · P1 servicio y flujo · P2 control. Las metas son las propuestas piloto de la especificación: se calibran con dos semanas de datos. Las tarjetas de recepción se calculan en vivo con lo que se registra en Droguería → Recepción; las demás, con Quantio a las 19:15.'),
      h('div', { class: 'kpis ind-resumen' },
        tarjeta('P1', pc(K.otif), 'OTIF aproximado: a tiempo para su ola, completo y recibido sin diferencias en plazo', K.otif_base ? nd(K.otif_n, K.otif_base) + ' pedidos con plazo vencido' : 'sin base', tono(K.otif, 0.95, 0.90)),
        tarjeta('P1', pc(K.fill_lineas), 'renglones pedidos que tenían stock', `${f0(K.faltantes_renglones)} renglones sin stock en 90 días`, tono(K.fill_lineas, 0.97, 0.94)),
        tarjeta('P1', f0(K.falta_A), 'faltantes críticos: clase A sin stock que faltaron en pedidos', null, K.falta_A > 0 ? 'bad' : 'good'),
        ...recepcion(),
        tarjeta('P1', f0(K.sin_stock_con_venta), 'artículos del robot sin stock que se piden', `${f0(K.sin_stock)} marcados sin stock en total`, K.sin_stock_con_venta > 50 ? 'warn' : ''),
        tarjeta('P1', pc(K.listo_a_tiempo), 'pedidos listos antes de la hora de su ola (línea de base, las olas todavía no rigen)', nd(K.listo_n, K.listo_base), tono(K.listo_a_tiempo, 0.95, 0.85)),
        tarjeta('P0', mill(ven90), 'vencido o por vencer en 90 días', `${mill(clase('vencimiento', 'Vencido con stock')?.valor)} ya vencido con stock`, ven90 > 0 ? 'warn' : 'good'),
        T ? tarjeta('P0', f0(T.fuera.length), 'lecturas de temperatura fuera de rango (7 días)', `${nd(T.cargadas, T.esperadas)} lecturas de lunes a viernes`, T.fuera.length ? 'bad' : T.cargadas < T.esperadas ? 'warn' : 'good')
          : sinDato('P0', 'temperatura fuera de rango', 'Sin acceso al módulo de Temperatura'),
        sinDato('P1', 'carga / capacidad por ola', 'Fase 3: horas-persona por tarea'),
        tarjeta('P1', datosOk ? 'Al día' : 'Revisar', 'actualización de los datos',
          `Indicadores: ${horasInd == null ? '—' : `hace ${f0(horasInd)} h`}${horasConc == null ? '' : ` · Conciliación: hace ${f0(horasConc)} h${d.conc.ok === false ? ' (con error)' : ''}`}`, datosOk ? 'good' : 'warn')),
      h('section', { class: 'block' },
        h('div', { class: 'block-head' }, h('h2', {}, 'Excepciones para resolver'),
          h('select', { 'aria-label': 'Prioridad', onchange: e => { filtro = e.target.value; pintar(); } },
            h('option', { value: 'todas' }, `Todas (${f0(EXC.length)})`), ['P0', 'P1', 'P2'].map(p => h('option', { value: p }, `${p} (${f0(cuenta(p))})`)))),
        h('p', { class: 'muted' }, 'Foto del momento de la exportación (19:15). Los pedidos procesados sin remito tienen stock reservado: conviene remitirlos o anularlos.'),
        zona));
  }

  function olas() {
    const O = D.olas || [], OF = (D.olas_farmacia || []).slice().sort((a, b) => a.a_tiempo - b.a_tiempo), LL = D.llegada_hora || [];
    const [c1, cv1] = caja(260);
    const horas = [...new Set(LL.map(r => r.hora))].sort((a, b) => a - b);
    const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const out = h('div', { class: 'tab-cont' },
      h('p', { class: 'aviso aviso-warn' }, h('strong', {}, 'Propuesta, todavía no rige. '),
        'Es la línea de base: con los pedidos y remitos reales de los últimos 90 días, cuánto se hubiera cumplido si las olas ya existieran. Un pedido va a la primera ola de su farmacia cuyo corte no pasó (10 minutos de tolerancia); si ese día había ola y llegó tarde, cuenta como fuera de corte.'),
      h('div', { class: 'kpis' },
        kpi(pc(K.listo_a_tiempo), 'remitos listos antes de la hora de su ola', nd(K.listo_n, K.listo_base), tono(K.listo_a_tiempo, 0.95, 0.85)),
        kpi(pc(K.fuera_corte), 'pedidos que entran después del corte de su día', nd(K.fuera_corte_n, K.listo_base), tono(K.fuera_corte, 0.05, 0.10)),
        kpi(pc(K.completos), 'pedidos completos', 'sin renglones en cero ni faltantes de preparación', tono(K.completos, 0.95, 0.90)),
        kpi(pc(K.entrega_a_tiempo), 'recibidos en la farmacia dentro del plazo', 'Río Cuarto: el mismo día · interior: hasta el día hábil siguiente al retiro')),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Olas propuestas')),
        tabla([
          { t: 'Ola', f: r => h('strong', {}, r.ola) }, { t: 'Días', f: r => r.dias }, { t: 'Corte', f: r => r.corte }, { t: 'Listo', f: r => r.listo }, { t: 'Sale', f: r => r.salida },
          { t: 'Farmacias', f: r => r.destinos },
          { t: 'Pedidos', num: 1, f: r => f0(r.pedidos) },
          { t: 'Renglones por día', num: 1, f: r => `${f0(r.renglones_dia)} (P90 ${f0(r.renglones_p90)})` },
          { t: 'Fuera de corte', num: 1, f: r => pc(r.fuera_corte, 0), cls: r => r.fuera_corte > 0.10 ? 'txt-bad' : r.fuera_corte > 0.05 ? 'txt-warn' : '' },
          { t: 'Listos a tiempo', num: 1, f: r => pc(r.a_tiempo, 0), cls: r => r.a_tiempo < 0.85 ? 'txt-bad' : r.a_tiempo < 0.95 ? 'txt-warn' : '' },
          { t: 'Atraso (mediana)', num: 1, f: r => r.atraso_med_h == null ? '—' : hs(r.atraso_med_h) },
          { t: 'Completos', num: 1, f: r => pc(r.completos, 0) }], O),
        h('p', { class: 'muted' }, 'Renglones por día: lo que hay que preparar en esa ola los días que sale (promedio y el día cargado del 10% más alto). El atraso es en horas hábiles, solo de los pedidos que no llegaron.')),
      h('div', {},
        h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'A qué hora llegan los pedidos')),
          h('p', { class: 'muted' }, 'Pedidos de los últimos 90 días por hora de entrada. Sirve para fijar cortes que no corten la mayoría de los pedidos.'), c1),
        h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Por farmacia')),
          tabla([{ t: 'Farmacia', f: r => h('strong', {}, r.farmacia) }, { t: 'Pedidos', num: 1, f: r => f0(r.pedidos) },
            { t: 'Fuera de corte', num: 1, f: r => pc(r.fuera_corte, 0), cls: r => r.fuera_corte > 0.10 ? 'txt-bad' : '' },
            { t: 'Listos a tiempo', num: 1, f: r => pc(r.a_tiempo, 0), cls: r => r.a_tiempo < 0.85 ? 'txt-bad' : '' },
            { t: 'Atraso', num: 1, f: r => r.atraso_med_h == null ? '—' : hs(r.atraso_med_h) },
            { t: 'Completos', num: 1, f: r => pc(r.completos, 0) }, { t: 'Recibidos en plazo', num: 1, f: r => pc(r.entrega_a_tiempo, 0) }], OF))));
    requestAnimationFrame(() => {
      const o = opts({}, f0); o.plugins.legend.display = true; o.scales.x.stacked = true; o.scales.y.stacked = true;
      const suma = (dias, x) => LL.filter(r => dias.includes(r.dia) && r.hora === x).reduce((s, r) => s + r.pedidos, 0);
      chart(cv1, { type: 'bar', data: { labels: horas.map(x => `${x} h`), datasets: [
        { label: 'Lunes a viernes', data: horas.map(x => suma(DIAS.slice(0, 5), x)), backgroundColor: css('--s1'), borderRadius: 2 },
        { label: 'Sábado', data: horas.map(x => suma(['sáb'], x)), backgroundColor: css('--s2'), borderRadius: 2 }] }, options: o });
    });
    return out;
  }

  function servicio() {
    const [c1, cv1] = caja(), [c2, cv2] = caja(), [c3, cv3] = caja(250);
    const sem = D.semanal || [], ph = D.por_hora || [];
    const out = h('div', { class: 'tab-cont' },
      h('div', { class: 'kpis' },
        kpi(f1(K.pedidos_dia), 'pedidos por día hábil', `${f0(K.lineas_pedido)} renglones por pedido`),
        kpi(f0(K.lineas_dia), 'renglones despachados por día hábil', `${f0(K.lineas)} en 90 días`),
        kpi(hs(K.h_total_med), 'de pedido a remito (mediana, horas hábiles)', `el 90% en menos de ${hs(K.h_total_p90)}`, tono(K.h_total_med, 4, 8)),
        kpi(hs(K.h_prep_med), 'de preparación: de procesado a remito', `espera hasta procesar: ${hs(K.h_espera_med)}`),
        kpi(pc(K.mismo_dia), 'pedidos despachados el mismo día', `${pc(K.corte_ok)} de los que entran antes de las 12`, tono(K.mismo_dia, 0.9, 0.8)),
        kpi(pc(K.fill_lineas), 'nivel de servicio: renglones pedidos con stock', `${f0(K.faltantes_renglones)} renglones sin stock`, tono(K.fill_lineas, 0.98, 0.95)),
        kpi(pc(K.exactitud_prep), 'exactitud de preparación', 'renglones con stock despachados completos', tono(K.exactitud_prep, 0.995, 0.98)),
        kpi(pc(K.pedido_perfecto), 'pedido perfecto', K.conc_ok != null ? `con stock, completo y recibido sin diferencias (${pc(K.conc_ok)})` : 'con stock y completo', tono(K.pedido_perfecto, 0.97, 0.93))),
      h('div', { class: 'ind-grid' },
        h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Renglones despachados por semana')), h('p', { class: 'muted' }, 'La última semana puede estar en curso.'), c1),
        h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Horas de pedido a remito por semana')), h('p', { class: 'muted' }, 'Mediana en horas hábiles. Más bajo es mejor.'), c2)),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'A qué hora entran los pedidos y salen los remitos')),
        h('p', { class: 'muted' }, 'Promedio por día hábil. Lo que entra a la tarde o a la noche se prepara al día siguiente.'), c3));
    requestAnimationFrame(() => {
      chart(cv1, { type: 'bar', data: { labels: sem.map(r => r.semana), datasets: [{ label: 'Renglones', data: sem.map(r => r.renglones), backgroundColor: css('--s1'), borderRadius: 3 }] }, options: opts() });
      chart(cv2, { type: 'line', data: { labels: sem.map(r => r.semana), datasets: [{ label: 'Mediana', data: sem.map(r => r.horas_mediana), borderColor: css('--s1'), backgroundColor: css('--s1'), tension: 0, pointRadius: 3 }] }, options: opts({}, hs) });
      chart(cv3, { type: 'bar', data: { labels: ph.map(r => `${r.hora} h`), datasets: [
        { label: 'Pedidos que entran', data: ph.map(r => r.pedidos_entran), backgroundColor: css('--s1'), borderRadius: 2 },
        { label: 'Remitos que salen', data: ph.map(r => r.remitos_salen), backgroundColor: css('--s2'), borderRadius: 2 }] },
        options: (() => { const o = opts({}, f1); o.plugins.legend.display = true; return o; })() });
    });
    return out;
  }

  function farmacias() {
    const F = (D.farmacias || []).slice().sort((a, b) => b.renglones - a.renglones);
    const lentas = F.slice().filter(r => r.horas_mediana != null).sort((a, b) => b.horas_mediana - a.horas_mediana);
    const medH = median(F.map(r => r.horas_mediana)), medM = median(F.map(r => r.min_renglon));
    const [c1, cv1] = caja(Math.max(300, lentas.length * 26 + 40));
    const out = h('div', { class: 'tab-cont' },
      h('p', { class: 'muted' }, 'Horas hábiles desde que la farmacia manda el pedido hasta que sale el remito. Los minutos por renglón muestran qué pedidos cuesta más preparar a igual tamaño. En rojo, lo que está 30% peor que la mediana de las farmacias.'),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Las más lentas, de pedido a remito')), h('p', { class: 'muted' }, 'Barra: mediana. Punto: el 90% de los pedidos tarda menos que eso.'), c1),
      h('section', { class: 'block' },
        h('div', { class: 'block-head' }, h('h2', {}, 'Ranking por volumen (90 días)'),
          h('button', { class: 'btn', onclick: () => descargarCSV(`Indicadores farmacias ${K.hoy || ''}`, [['Farmacia', 'Pedidos', 'Remitos sin pedido', 'Renglones', 'Unidades', 'Participación', 'Renglones por pedido', 'Horas mediana', 'Horas 90%', 'Horas preparación', 'Min por renglón', 'Mismo día', 'Servicio', 'Medicamentos', 'Perfumería', 'Accesorios'],
            ...F.map(r => [r.farmacia, r.pedidos, r.remitos_manuales, r.renglones, r.unidades, r.participacion, r.renglones_pedido, r.horas_mediana, r.horas_p90, r.horas_prep, r.min_renglon, r.mismo_dia, r.servicio, r.medicamentos, r.perfumeria, r.accesorios])]) }, 'Descargar CSV')),
        tabla([
          { t: 'Farmacia', f: r => h('strong', {}, r.farmacia) },
          { t: 'Pedidos', num: 1, f: r => f0(r.pedidos) }, { t: 'Renglones', num: 1, f: r => f0(r.renglones) }, { t: 'Part.', num: 1, f: r => pc(r.participacion) },
          { t: 'Reng./pedido', num: 1, f: r => f1(r.renglones_pedido) },
          { t: 'Horas (mediana)', num: 1, f: r => f1(r.horas_mediana), cls: r => r.horas_mediana > medH * 1.3 ? 'txt-bad' : '' },
          { t: 'Horas (90%)', num: 1, f: r => f1(r.horas_p90) },
          { t: 'Min/renglón', num: 1, f: r => f1(r.min_renglon), cls: r => r.min_renglon > medM * 1.3 ? 'txt-warn' : '' },
          { t: 'Mismo día', num: 1, f: r => pc(r.mismo_dia, 0), cls: r => r.mismo_dia < 0.8 ? 'txt-bad' : '' },
          { t: 'Servicio', num: 1, f: r => pc(r.servicio) },
          { t: 'Medic. · Perf. · Acc.', f: r => h('span', { class: 'ind-mix', title: `Medicamentos ${pc(r.medicamentos, 0)} · Perfumería ${pc(r.perfumeria, 0)} · Accesorios y varios ${pc(r.accesorios, 0)}` },
            [['medicamentos', '--s1'], ['perfumeria', '--s2'], ['accesorios', '--s3']].map(([k, c]) => h('i', { style: `width:${(r[k] || 0) * 100}%;background:var(${c})` }))) },
        ], F)),
      h('p', { class: 'muted' }, `Remitos sin pedido (reposiciones que arma la droguería): ${f0(K.remitos_manuales)} en 90 días. Cuentan en los renglones pero no en los tiempos.`));
    requestAnimationFrame(() => chart(cv1, { type: 'bar', data: { labels: lentas.map(r => r.farmacia), datasets: [
      { label: 'Mediana', data: lentas.map(r => r.horas_mediana), backgroundColor: lentas.map(r => r.horas_mediana > medH * 1.3 ? css('--bad') : css('--s1')), borderRadius: 3 },
      { label: 'El 90% en menos de', data: lentas.map(r => r.horas_p90), type: 'line', showLine: false, pointRadius: 4, pointStyle: 'rectRot', borderColor: css('--muted'), backgroundColor: css('--muted') }] },
      options: opts({ indexAxis: 'y' }, hs) }));
    return out;
  }

  function stock() {
    const ORD = ['Normal', 'Sobrestock', 'Crítico', 'Frenado 3-6 meses', 'Frenado 6-12 meses', 'Frenado +1 año'];
    const est = ORD.map(e => clase('estado', e)).filter(Boolean);
    const [c1, cv1] = caja(est.length * 34 + 40);
    const LISTAS = [['En falta', 'En falta (sin stock y faltaron en pedidos)'], ['Crítico', 'Críticos (menos de 7 días)'], ['Faltó en pedidos', 'Los que más faltaron en pedidos'],
      ['Frenado', 'Frenados (sin salida en 90 días o más)'], ['Sobrestock', 'Sobrestock (más de 120 días)'], ['Vencimientos', 'Vencidos o por vencer en 90 días']];
    const zona = h('div');
    const pintarLista = () => {
      if (lista === 'Vencimientos') {
        const V = D.vencimientos || [];
        return zona.replaceChildren(tabla([{ t: 'Artículo', f: r => r.articulo }, { t: 'Lote', f: r => r.lote }, { t: 'Vence', f: r => fISO(r.vence), cls: r => K.hoy && r.vence < K.hoy ? 'txt-bad' : '' },
          { t: 'Unidades', num: 1, f: r => f0(r.unidades) }, { t: 'Valor', num: 1, f: r => mill(r.valor) }], V));
      }
      const L = (D.stock_listas || []).filter(r => r.lista === lista);
      zona.replaceChildren(L.length ? tabla([
        { t: 'Artículo', f: r => r.articulo }, { t: 'Laboratorio', f: r => r.laboratorio }, { t: 'Stock', num: 1, f: r => f0(r.stock) },
        { t: 'Reng. 90 d', num: 1, f: r => f0(r.renglones90) }, { t: 'Cobertura', num: 1, f: r => r.cobertura_dias == null ? '—' : `${f1(r.cobertura_dias)} d` },
        { t: 'Faltó', num: 1, f: r => f0(r.faltas90) }, { t: 'Valor', num: 1, f: r => mill(r.valor) }, { t: 'Última salida', f: r => fISO(r.ultima_salida) },
        { t: 'ABC', f: r => r.clase }, { t: 'Robot', f: r => r.robot }], L.slice(0, 30)) : h('p', { class: 'muted' }, 'Nada en esta lista. 👍'),
        L.length > 30 ? h('p', { class: 'muted' }, `Se muestran 30 de ${f0(L.length)}. Descargá el CSV para verlos todos.`) : null);
    };
    const csvLista = () => {
      if (lista === 'Vencimientos') return descargarCSV(`Lotes por vencer ${K.hoy || ''}`, [['Código', 'Artículo', 'Lote', 'Vence', 'Unidades', 'Valor'], ...(D.vencimientos || []).map(r => [r.id, r.articulo, r.lote, r.vence, r.unidades, r.valor])]);
      descargarCSV(`Stock ${lista} ${K.hoy || ''}`, [['Código', 'Artículo', 'Laboratorio', 'Rubro', 'Stock', 'Renglones 90 días', 'Cobertura días', 'Veces que faltó', 'Valor', 'Última salida', 'ABC', 'Robot'],
        ...(D.stock_listas || []).filter(r => r.lista === lista).map(r => [r.id, r.articulo, r.laboratorio, r.rubro, r.stock, r.renglones90, r.cobertura_dias, r.faltas90, r.valor, r.ultima_salida, r.clase, r.robot])]);
    };
    pintarLista();
    const out = h('div', { class: 'tab-cont' },
      h('div', { class: 'kpis' },
        kpi(mill(K.valor), 'valor del stock a último costo', `${f0(K.skus_stock)} artículos con stock`),
        kpi(f1(K.rotacion), 'rotación anual (veces)', `${f0(K.dias_inv)} días de inventario`),
        kpi(f0(clase('estado', 'En falta')?.articulos), 'en falta: sin stock y faltaron en pedidos', null, 'bad'),
        kpi(f0(clase('estado', 'Crítico')?.articulos), 'críticos: se piden mucho y alcanzan menos de 7 días', null, 'warn'),
        kpi(mill(sumaClases('estado', c => c.startsWith('Frenado'))), 'inmovilizado en stock frenado', 'sin salida en 90 días o más', 'warn'),
        kpi(mill(clase('estado', 'Sobrestock')?.valor), 'en sobrestock', 'más de 120 días de cobertura', 'warn'),
        kpi(mill(sumaClases('vencimiento', c => c !== 'Vence en 91 a 180 días')), 'vencido o por vencer en 90 días', `${mill(clase('vencimiento', 'Vence en 91 a 180 días')?.valor)} más entre 91 y 180 días`, 'bad'),
        kpi(pc(K.ajustes_pct), 'ajustes de stock sobre lo despachado (último año)', `+${f0(K.ajustes_mas)} y −${f0(K.ajustes_menos)} unidades`, tono(K.ajustes_pct, 0.02, 0.05))),
      h('div', { class: 'ind-grid' },
        h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Valor del stock por estado')), c1),
        h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'ABC por frecuencia de picking')),
          h('p', { class: 'muted' }, 'A: los artículos que suman el 80% de los renglones; B: el 15% siguiente; C: el resto.'),
          tabla([{ t: 'Clase', f: r => h('strong', {}, r.clase) }, { t: 'Artículos con stock', num: 1, f: r => f0(r.articulos) }, { t: 'Renglones 90 d', num: 1, f: r => f0(r.renglones90) }, { t: 'Valor', num: 1, f: r => mill(r.valor) }],
            clases.filter(r => r.grupo === 'abc')),
          tabla([{ t: 'Rubro', f: r => h('strong', {}, r.clase) }, { t: 'Artículos', num: 1, f: r => f0(r.articulos) }, { t: 'Renglones 90 d', num: 1, f: r => f0(r.renglones90) }, { t: 'Valor', num: 1, f: r => mill(r.valor) }, { t: 'Rotación', num: 1, f: r => f1(r.rotacion) }],
            clases.filter(r => r.grupo === 'rubro').sort((a, b) => b.valor - a.valor)))),
      h('section', { class: 'block' },
        h('div', { class: 'block-head' }, h('h2', {}, 'Artículos para revisar'),
          h('div', { class: 'toolbar' },
            h('select', { 'aria-label': 'Lista', onchange: e => { lista = e.target.value; pintarLista(); } }, LISTAS.map(([v, t]) => h('option', { value: v }, t))),
            h('button', { class: 'btn', onclick: csvLista }, 'Descargar CSV'))),
        h('p', { class: 'muted' }, 'Los más importantes primero (hasta 100 por lista en el CSV).'), zona),
      h('p', { class: 'muted' }, 'Los ajustes son las altas y bajas manuales de stock en Quantio. Más del 5% sobre lo despachado es alto: conviene revisar qué se registra como ajuste (inventarios, roturas, vencidos, devoluciones).'));
    requestAnimationFrame(() => chart(cv1, { type: 'bar', data: { labels: est.map(r => `${r.clase} (${f0(r.articulos)})`), datasets: [{ label: 'Valor', data: est.map(r => r.valor),
      backgroundColor: est.map(r => r.clase === 'Normal' ? css('--s1') : r.clase === 'Crítico' ? css('--bad') : css('--warn')), borderRadius: 3 }] },
      options: (() => { const o = opts({ indexAxis: 'y' }, mill); o.scales.x.type = 'logarithmic'; o.scales.x.ticks.callback = v => [1e6, 1e7, 1e8, 1e9].includes(v) ? mill(v) : ''; return o; })() }));
    return out;
  }

  function robotTab() {
    const C = D.robot_curva || [];
    const [c1, cv1] = caja(260);
    const zona = h('div');
    const pintar = () => {
      const R = (D.robot_cambios || []).filter(r => r.cambio === robot);
      zona.replaceChildren(tabla([{ t: 'Artículo', f: r => r.articulo }, { t: 'Laboratorio', f: r => r.laboratorio }, { t: 'Renglones/día', num: 1, f: r => f1(r.renglones_dia) },
        { t: 'Semanas con salida (de 13)', num: 1, f: r => f0(r.semanas_con_salida) }, { t: 'Stock', num: 1, f: r => f0(r.stock) }, { t: 'ABC', f: r => r.clase }], R.slice(0, 40)),
        R.length > 40 ? h('p', { class: 'muted' }, `Se muestran 40 de ${f0(R.length)}. Descargá el CSV para la lista completa.`) : null);
    };
    pintar();
    const out = h('div', { class: 'tab-cont' },
      h('p', {}, `El robot admite ${f0(K.cap)} artículos. Rinde más con los que más veces se piden (renglones), no con los que más unidades mueven. La propuesta toma los ${f0(K.cap)} medicamentos con más renglones en los últimos 90 días que salieron al menos 8 de las últimas 13 semanas, sin los de heladera.`),
      h('div', { class: 'kpis' },
        kpi(pc(K.actual_lin), 'de los renglones salen hoy del robot', `${f0(K.lin_dia_actual)} por día · ${f0(K.actual_skus)} artículos marcados`),
        kpi(pc(K.prop_lin), 'saldrían con la propuesta', `${f0(K.lin_dia_prop)} por día`, 'good'),
        kpi(pc(K.prop_lin_med), 'de los renglones de medicamentos, con la propuesta', `hoy: ${pc(K.actual_lin_med)}`),
        kpi(`${f0(K.entran)} / ${f0(K.salen)}`, 'artículos a sumar / a sacar', `${f0(K.quedan)} se mantienen`)),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Renglones que cubren los más pedidos')),
        h('p', { class: 'muted' }, `Todos los rubros. Perfumería y accesorios (${pc(K.perf_lin_fuera, 0)} de los renglones) no van al robot.`), c1),
      h('div', {},
        h('section', { class: 'block' },
          h('div', { class: 'block-head' }, h('h2', {}, 'Cambios sugeridos'),
            h('div', { class: 'toolbar' },
              h('select', { 'aria-label': 'Cambio', onchange: e => { robot = e.target.value; pintar(); } }, h('option', { value: 'Sumar' }, 'Sumar (los más pedidos primero)'), h('option', { value: 'Sacar' }, 'Sacar (los menos pedidos primero)')),
              h('button', { class: 'btn', onclick: () => descargarCSV(`Robot cambios sugeridos ${K.hoy || ''}`, [['Cambio', 'Código', 'Artículo', 'Laboratorio', 'Renglones 90 días', 'Renglones por día', 'Semanas con salida (de 13)', 'Stock', 'ABC'],
                ...(D.robot_cambios || []).map(r => [r.cambio, r.id, r.articulo, r.laboratorio, r.renglones90, r.renglones_dia, r.semanas_con_salida, r.stock, r.clase])]) }, 'Descargar CSV'))),
          zona)),
      h('p', { class: 'muted' }, 'Antes de mover: revisar que la caja entre en los canales, dejar en estantería lo que sale con mucho volumen por renglón, y que la marca "Expendio automatizado" de Quantio coincida con lo que hay físicamente en el robot.'));
    requestAnimationFrame(() => {
      const pts = [{ x: 0, y: 0 }, ...C.map(r => ({ x: r.articulos, y: r.renglones_cubiertos }))];
      const o = opts({}, v => pc(v, 0));
      o.scales.x = { type: 'linear', ticks: { color: css('--muted'), callback: v => f0(v) }, grid: { display: false }, border: { color: css('--grid') }, max: Math.max(...C.map(r => r.articulos)) };
      o.scales.y.max = 1;
      o.plugins.legend.display = true;
      o.interaction = { mode: 'nearest', intersect: false };
      o.plugins.tooltip.callbacks = { title: i => `${f0(i[0].parsed.x)} artículos`, label: c => ` ${c.dataset.label}: ${pc(c.parsed.y)}` };
      chart(cv1, { type: 'line', data: { datasets: [
        { label: 'Los más pedidos', data: pts, borderColor: css('--s1'), backgroundColor: css('--s1'), pointRadius: 2, tension: 0 },
        { label: 'Hoy', data: [{ x: K.actual_skus, y: K.actual_lin }], borderColor: css('--bad'), backgroundColor: css('--bad'), pointRadius: 6, showLine: false },
        { label: 'Propuesta', data: [{ x: K.cap, y: K.prop_lin }], borderColor: css('--ok'), backgroundColor: css('--ok'), pointRadius: 6, showLine: false }] }, options: o });
    });
    return out;
  }

  function compras() {
    const P = D.proveedores || [];
    return h('div', { class: 'tab-cont' },
      h('div', { class: 'kpis' },
        kpi(f0(K.comprob90), 'comprobantes de compra en 90 días', `${f0(K.lineas90)} renglones`),
        kpi(f0(K.unid90), 'unidades compradas en 90 días'),
        kpi(`${f0(K.dock_med)} días`, 'de la factura a la carga en Quantio (mediana)')),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Proveedores del último año')),
        tabla([{ t: 'Proveedor', f: r => h('strong', {}, r.proveedor) }, { t: 'Comprobantes', num: 1, f: r => f0(r.comprobantes) }, { t: 'Renglones', num: 1, f: r => f0(r.renglones) },
          { t: 'Unidades', num: 1, f: r => f0(r.unidades) }, { t: 'Monto', num: 1, f: r => mill(r.monto) }, { t: 'Días a la carga', num: 1, f: r => f1(r.dias_carga) }, { t: 'Órdenes de compra', num: 1, f: r => f0(r.ordenes_compra) }], P)),
      h('p', { class: 'muted' }, 'La fecha de carga en Quantio no es la de llegada de la mercadería: la llegada real se registra en Droguería → Recepción. El cumplimiento de cada orden de compra está en la pestaña "Órdenes de compra".'));
  }

  // ---- auditoría de compras: orden de compra contra factura (oc_fc.py)
  const TIPOS_DIF = { 'Falta': 'warn', 'De más': 'warn', 'No pedido': 'info', 'Precio mayor': 'bad', 'Costo anómalo': 'bad', 'Descuento cambió': 'info' };
  const ESTADO_OC = { 'Completa': 'ok', 'Incompleta': 'warn', 'Con diferencias': 'bad', 'Sin facturas': 'bad', 'En curso': 'muted' };
  const pill = (t, tono) => h('span', { class: `pill pill-${tono}` }, t);
  function ordenes() {
    const OC = D.oc_resumen, DIF = D.oc_dif || [], SIN = D.fc_sin_oc || [];
    if (!OC) return h('div', { class: 'tab-cont' }, empty('Todavía no hay datos de órdenes de compra', 'Se calculan con la próxima actualización de los indicadores (de lunes a sábado a las 19:15).'));
    let fProv = '', fEst = '', fTipo = '';
    const cerradas = OC.filter(r => r.estado !== 'En curso');
    const ped = cerradas.reduce((a, r) => a + r.unid_pedidas, 0), fac = cerradas.reduce((a, r) => a + r.unid_facturadas, 0);
    const completas = cerradas.filter(r => r.estado === 'Completa').length;
    const cuenta = t => DIF.filter(d => d.tipo === t).length;
    const provs = [...new Set(OC.map(r => r.proveedor))].sort();
    const zonaOC = h('div'), zonaDif = h('div');
    const filtrar = () => OC.filter(r => (!fProv || r.proveedor === fProv) && (!fEst || r.estado === fEst));
    const verOC = r => {
      const L = DIF.filter(d => d.oc === r.oc && d.proveedor === r.proveedor);
      modal({ title: `Orden de compra ${r.oc} · ${r.proveedor}`, wide: true, body: h('div', { class: 'stack' },
        h('p', {}, `${fISO(r.fecha)}${r.detalle ? ' · ' + r.detalle : ''}`),
        h('p', { class: 'muted' }, r.facturas ? `Facturas asociadas: ${r.detalle_facturas}` : 'Sin facturas asociadas todavía.'),
        h('div', { class: 'kpis' }, kpi(`${f0(r.unid_facturadas)} / ${f0(r.unid_pedidas)}`, 'unidades facturadas / pedidas', pc(r.cumplimiento)),
          kpi(mill(r.importe_oc), 'importe de la orden (precio de lista)'), kpi(mill(r.importe_fc), 'importe facturado (con bonificación)', r.desc_tipico != null ? `descuento típico ${pc(r.desc_tipico)}` : null)),
        L.length ? tabla([{ t: 'Diferencia', f: d => pill(d.tipo, TIPOS_DIF[d.tipo]) }, { t: 'Producto', f: d => d.producto }, { t: 'Pedido', num: 1, f: d => f0(d.pedido) }, { t: 'Facturado', num: 1, f: d => f0(d.facturado) },
          { t: 'Precio OC', num: 1, f: d => d.precio_oc != null ? money(d.precio_oc) : '—' }, { t: 'Costo facturado', num: 1, f: d => d.costo_fc != null ? money(d.costo_fc) : '—' },
          { t: 'Descuento', num: 1, f: d => d.desc != null ? pc(d.desc) + (d.desc_anterior != null ? ` (antes ${pc(d.desc_anterior)})` : '') : '—' }], L)
          : h('p', { class: 'muted' }, 'Sin diferencias entre lo pedido y lo facturado.')) });
    };
    const pintarOC = () => {
      const F = filtrar();
      zonaOC.replaceChildren(F.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover' },
        h('thead', {}, h('tr', {}, ['OC', 'Proveedor', 'Fecha', 'Estado', 'Pedido', 'Facturado', 'Cumpl.', 'Días a la 1.ª factura', 'Diferencias'].map((t, i) => h('th', { class: [0, 4, 5, 6, 7].includes(i) ? 'num' : '' }, t)))),
        h('tbody', {}, F.slice(0, 300).map(r => h('tr', { onclick: () => verOC(r) },
          h('td', { class: 'num' }, String(r.oc)), h('td', {}, h('strong', {}, r.proveedor), r.detalle ? h('small', { class: 'muted ind-sub' }, r.detalle) : null), h('td', {}, fISO(r.fecha)),
          h('td', {}, pill(r.estado, ESTADO_OC[r.estado] || 'muted')),
          h('td', { class: 'num' }, f0(r.unid_pedidas)), h('td', { class: 'num' }, f0(r.unid_facturadas)),
          h('td', { class: `num ${r.cumplimiento != null && r.cumplimiento < 0.9 && r.estado !== 'En curso' ? 'txt-warn' : ''}` }, pc(r.cumplimiento, 0)), h('td', { class: 'num' }, r.dias_primera_fc != null ? f0(r.dias_primera_fc) : '—'),
          h('td', {}, h('span', { class: 'rc-tags' }, ...[['faltan', 'Falta'], ['de_mas', 'De más'], ['no_pedidos', 'No pedido'], ['precio_mayor', 'Precio mayor'], ['costo_anomalo', 'Costo anómalo'], ['desc_cambio', 'Descuento cambió']]
            .filter(([k]) => r[k]).map(([k, t]) => pill(`${t} ${r[k]}`, TIPOS_DIF[t]))))))))) : h('p', { class: 'muted' }, 'Ninguna orden con esos filtros.'),
        F.length > 300 ? h('p', { class: 'muted' }, `Se muestran 300 de ${F.length}. Descargá el CSV para ver todas.`) : null);
    };
    const pintarDif = () => {
      const F = DIF.filter(d => (!fProv || d.proveedor === fProv) && (!fTipo || d.tipo === fTipo));
      zonaDif.replaceChildren(F.length ? tabla([{ t: 'Diferencia', f: d => pill(d.tipo, TIPOS_DIF[d.tipo]) }, { t: 'OC', num: 1, f: d => String(d.oc) }, { t: 'Proveedor', f: d => d.proveedor }, { t: 'Producto', f: d => d.producto },
        { t: 'Pedido', num: 1, f: d => f0(d.pedido) }, { t: 'Facturado', num: 1, f: d => f0(d.facturado) }, { t: 'Precio OC', num: 1, f: d => d.precio_oc != null ? money(d.precio_oc) : '—' },
        { t: 'Costo facturado', num: 1, f: d => d.costo_fc != null ? money(d.costo_fc) : '—' }, { t: 'Descuento', num: 1, f: d => d.desc != null ? pc(d.desc) + (d.desc_anterior != null ? ` (antes ${pc(d.desc_anterior)})` : '') : '—' }], F.slice(0, 200))
        : h('p', { class: 'muted' }, 'Sin diferencias con esos filtros.'), F.length > 200 ? h('p', { class: 'muted' }, `Se muestran 200 de ${F.length}. Descargá el CSV para ver todas.`) : null);
    };
    const sel = (opciones, onChange, todos) => h('select', { onchange: e => onChange(e.target.value) }, h('option', { value: '' }, todos), opciones.map(o => h('option', { value: o }, o)));
    pintarOC(); pintarDif();
    return h('div', { class: 'tab-cont' },
      h('div', { class: 'kpis' },
        kpi(f0(cerradas.length), 'órdenes de compra analizadas', `de los últimos 120 días (sin contar ${OC.length - cerradas.length} en curso)`),
        kpi(pc(ped ? fac / ped : null), 'de las unidades pedidas se facturaron', `${f0(fac)} de ${f0(ped)}`, tono(ped ? fac / ped : null, 0.95, 0.85)),
        kpi(pc(cerradas.length ? completas / cerradas.length : null, 0), 'órdenes completas', `${f0(completas)} sin faltantes ni sobrantes`),
        kpi(f0(cuenta('Precio mayor') + cuenta('Costo anómalo')), 'renglones con precio mayor o costo anómalo', `${f0(cuenta('Precio mayor'))} con precio mayor a la OC · ${f0(cuenta('Costo anómalo'))} con costo anómalo`, cuenta('Precio mayor') + cuenta('Costo anómalo') ? 'bad' : 'good'),
        kpi(f0(SIN.length), 'facturas sin orden de compra', SIN.length ? `${mill(SIN.reduce((a, r) => a + (r.total || 0), 0))} en total` : null)),
      h('div', { class: 'toolbar filters' }, sel(provs, v => { fProv = v; pintarOC(); pintarDif(); }, 'Todos los proveedores'), sel(Object.keys(ESTADO_OC), v => { fEst = v; pintarOC(); }, 'Todos los estados'),
        h('button', { class: 'btn', onclick: () => descargarCSV(`Ordenes de compra ${K.hoy || ''}`, [['OC', 'Proveedor', 'Fecha', 'Detalle', 'Renglones', 'Unidades pedidas', 'Unidades facturadas', 'Cumplimiento', 'Importe OC', 'Importe facturado', 'Descuento típico', 'Facturas', 'Detalle facturas', 'Días a la primera factura', 'Faltan', 'De más', 'No pedidos', 'Precio mayor', 'Costo anómalo', 'Descuento cambió', 'Estado'],
          ...filtrar().map(r => [r.oc, r.proveedor, r.fecha, r.detalle, r.renglones, r.unid_pedidas, r.unid_facturadas, r.cumplimiento, r.importe_oc, r.importe_fc, r.desc_tipico, r.facturas, r.detalle_facturas, r.dias_primera_fc, r.faltan, r.de_mas, r.no_pedidos, r.precio_mayor, r.costo_anomalo, r.desc_cambio, r.estado])]) }, 'Descargar órdenes')),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Órdenes de compra'), h('span', { class: 'muted' }, 'Tocá una orden para ver producto por producto.')), zonaOC),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Diferencias por renglón'),
        h('div', { class: 'toolbar filters' }, sel(Object.keys(TIPOS_DIF), v => { fTipo = v; pintarDif(); }, 'Todas las diferencias'),
          h('button', { class: 'btn', onclick: () => descargarCSV(`Diferencias OC contra factura ${K.hoy || ''}`, [['Diferencia', 'OC', 'Proveedor', 'Fecha OC', 'Código', 'Producto', 'Pedido', 'Facturado', 'Precio OC', 'Costo facturado', 'Descuento', 'Descuento anterior'],
            ...DIF.filter(d => (!fProv || d.proveedor === fProv) && (!fTipo || d.tipo === fTipo)).map(d => [d.tipo, d.oc, d.proveedor, d.fecha_oc, d.codigo, d.producto, d.pedido, d.facturado, d.precio_oc, d.costo_fc, d.desc, d.desc_anterior])]) }, 'Descargar'))), zonaDif),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Facturas sin orden de compra'),
        h('button', { class: 'btn', onclick: () => descargarCSV(`Facturas sin OC ${K.hoy || ''}`, [['Proveedor', 'Comprobante', 'Fecha', 'Renglones', 'Unidades', 'Total'], ...SIN.map(r => [r.proveedor, r.comprobante, r.fecha, r.renglones, r.unidades, r.total])]) }, 'Descargar')),
        h('p', { class: 'muted' }, 'Compras que no se pudieron asociar a ninguna orden: reposiciones diarias a droguerías, urgencias o pedidos hechos por fuera de Quantio. No son un error en sí, pero conviene que sean pocas y conocidas.'),
        SIN.length ? tabla([{ t: 'Proveedor', f: r => h('strong', {}, r.proveedor) }, { t: 'Comprobante', f: r => r.comprobante }, { t: 'Fecha', f: r => fISO(r.fecha) }, { t: 'Renglones', num: 1, f: r => f0(r.renglones) },
          { t: 'Unidades', num: 1, f: r => f0(r.unidades) }, { t: 'Total', num: 1, f: r => mill(r.total) }], SIN.slice().sort((a, b) => b.total - a.total).slice(0, 40)) : h('p', { class: 'muted' }, 'Ninguna.')),
      h('p', { class: 'muted' }, 'Cómo se arma: Quantio casi nunca guarda qué factura corresponde a cada orden, así que a cada factura se le asigna la orden del mismo proveedor, emitida hasta 30 días antes, con la que comparte más productos (al menos la mitad). La orden trae el precio de lista y la factura el costo con la bonificación, por eso se controla el descuento contra la compra anterior del mismo producto.'));
  }

  const VISTAS = { resumen: ['Resumen', resumen], olas: ['Olas y cortes', olas], servicio: ['Servicio y tiempos', servicio], farmacias: ['Farmacias', farmacias], stock: ['Stock', stock], robot: ['Robot', robotTab], compras: ['Compras', compras], oc: ['Órdenes de compra', ordenes] };
  if (!VISTAS[tab]) tab = 'servicio';
  const barra = h('div');
  function mostrar() {
    charts.splice(0).forEach(c => c.destroy());
    try { sessionStorage.setItem('ind-tab', tab); } catch { /* sin almacenamiento */ }
    barra.replaceChildren(tabs(Object.entries(VISTAS).map(([k, [l]]) => [k, l]), tab, t => { tab = t; mostrar(); }));
    cuerpo.replaceChildren(VISTAS[tab][1]());
  }
  mostrar();

  return h('div', { class: 'view ind-drog' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Droguería'), h('h1', {}, 'Indicadores'),
        h('p', { class: 'muted' }, `Datos de Quantio al ${fISO(K.hoy || d.fecha)} · últimos 90 días (${K.periodo || '—'}, ${f0(K.dias_habiles)} días hábiles).`))),
    viejo ? h('p', { class: 'aviso aviso-warn' }, h('strong', {}, 'Datos de hace más de un día. '), 'Revisar que la compu de IT haya estado prendida con la VPN a las 19:15.') : null,
    barra, cuerpo,
    h('details', { class: 'ind-notas' }, h('summary', {}, 'Cómo se calcula cada indicador'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'Horas hábiles: '), 'lunes a viernes de 8 a 19 y sábados de 8 a 13. Un pedido que entra a las 20 empieza a contar a las 8 del día siguiente.'),
        h('li', {}, h('strong', {}, 'Circuito: '), 'pedido online de la farmacia → pedido procesado en Quantio (reserva stock) → remito. Preparación es del procesado al remito.'),
        h('li', {}, h('strong', {}, 'Nivel de servicio: '), 'renglones del pedido procesado con cantidad mayor a cero. Quantio no guarda la cantidad original del pedido online, así que no se mide el faltante parcial.'),
        h('li', {}, h('strong', {}, 'Pedido perfecto: '), 'nivel de servicio × exactitud de preparación × remitos recibidos en Plex sin diferencias (pantalla Conciliación).'),
        h('li', {}, h('strong', {}, 'Stock: '), 'valuado a último costo. Rotación = costo de lo despachado en el año ÷ valor del stock de hoy. Cobertura = stock ÷ venta diaria de los últimos 90 días. En falta = sin stock y faltó en algún pedido. Crítico = clase A o B con menos de 7 días. Frenado = sin salida en 90 días o más. Sobrestock = más de 120 días.'),
        h('li', {}, h('strong', {}, 'Órdenes de compra: '), 'cada factura se asocia a la orden del mismo proveedor (hasta 30 días antes) con la que comparte más productos; se compara lo pedido con lo facturado y el descuento contra la compra anterior.'),
        h('li', {}, h('strong', {}, 'Lo que falta: '), 'productividad por preparador (Quantio no registra quién arma el pedido).'))));
}

function median(a) {
  const v = a.filter(x => x != null).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
