// Droguería · Tablero: cómo vienen hoy las lecturas, temperaturas de las últimas dos semanas y dónde están las bachas.
import { h, empty, cargarScript } from '../ui.js?v=20261111-1253';
import { hoyAR, sumarDias, fechaLarga, fechaCorta, turnosDe, estadoTurno, fmt, rangoTxt, pillBacha } from './drog-comun.js?v=20261111-1253';

const TONO = { hecho: 'ok', ahora: 'warn', atrasado: 'bad', proximo: 'muted' };
const TXT = { hecho: 'Cargado', ahora: 'Toca ahora', atrasado: 'Pendiente', proximo: 'Más tarde' };

export async function render({ api, go }) {
  const hoy = hoyAR(), desde = sumarDias(hoy, -13);
  const [puntos, lect, bachas] = await Promise.all([api.tempPuntos(), api.tempLecturas(sumarDias(hoy, -29), hoy), api.bachas()]);
  if (!puntos.length) return empty('Sin acceso', 'Este módulo es de la Droguería.');
  const lectHoy = lect.filter(l => l.fecha === hoy);
  const fuera30 = lect.filter(l => l.fuera_rango);

  // ---- lecturas de hoy ----
  const turnos = turnosDe(hoy);
  const hoyBox = h('section', { class: 'block drog-hoy' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Lecturas de hoy'), h('button', { class: 'btn primary', onclick: () => go('temperatura') }, 'Cargar lecturas')),
    turnos.length ? h('div', { class: 'drog-turnos' }, turnos.map(t => {
      const n = lectHoy.filter(l => l.turno === t).length, est = estadoTurno(hoy, t, n, puntos.length);
      return h('div', { class: `drog-turno est-${est}` }, h('strong', { class: 'mono' }, t), h('span', { class: `pill pill-${TONO[est]}` }, TXT[est]));
    })) : h('p', { class: 'muted' }, 'Hoy es domingo: no hay lecturas.'),
    h('div', { class: 'drog-ultimas' }, puntos.map(p => {
      const ult = [...lect].reverse().find(l => l.punto_id === p.id);
      return h('div', { class: `drog-ultima${ult?.fuera_rango ? ' mal' : ''}` },
        h('small', { class: 'muted' }, p.nombre),
        h('strong', {}, ult ? `${fmt(ult.temperatura)} °C` : '—', ult && ult.humedad !== null ? h('span', {}, ` · ${fmt(ult.humedad)} %`) : null),
        h('small', { class: 'muted' }, ult ? `${ult.fecha === hoy ? 'hoy' : fechaCorta(ult.fecha)} ${ult.turno} · rango ${rangoTxt(p)}` : rangoTxt(p)));
    })));

  // ---- gráfico de los últimos 14 días ----
  const canvas = h('canvas', { height: 240, 'aria-label': 'Temperatura de los últimos 14 días por equipo', role: 'img' });
  const grafico = h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Temperatura, últimos 14 días'),
    h('small', { class: 'muted' }, fuera30.length ? `${fuera30.length} lectura${fuera30.length > 1 ? 's' : ''} fuera de rango en 30 días` : 'Sin lecturas fuera de rango en 30 días')), h('div', { class: 'chart-box' }, canvas));
  cargarScript('vendor/chart.umd.js').then(() => {
    const ultimas = lect.filter(l => l.fecha >= desde).sort((a, b) => (a.fecha + a.turno).localeCompare(b.fecha + b.turno));
    const etiquetas = [...new Set(ultimas.map(l => `${fechaCorta(l.fecha)} ${l.turno}`))];
    const colores = ['#0055b8', '#3b8ff0', '#915ebd'];
    const css = getComputedStyle(document.documentElement);
    new window.Chart(canvas, { type: 'line', data: { labels: etiquetas, datasets: puntos.map((p, i) => ({ label: p.nombre, borderColor: colores[i % 3], backgroundColor: colores[i % 3], pointRadius: 0, borderWidth: 2, tension: 0.25,
      data: etiquetas.map(e => ultimas.find(l => `${fechaCorta(l.fecha)} ${l.turno}` === e && l.punto_id === p.id)?.temperatura ?? null), spanGaps: true })) },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: css.getPropertyValue('--fg') } } },
        scales: { x: { ticks: { maxTicksLimit: 8, color: css.getPropertyValue('--muted') }, grid: { display: false } }, y: { title: { display: true, text: '°C' }, ticks: { color: css.getPropertyValue('--muted') }, grid: { color: css.getPropertyValue('--grid') } } } } });
  }).catch(() => canvas.replaceWith(h('p', { class: 'muted' }, 'No se pudo cargar el gráfico.')));

  // ---- bachas ----
  const n = e => bachas.filter(b => b.estado === e).length;
  const demoradas = bachas.filter(b => b.estado === 'vencida');
  const bachasBox = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Bachas'), h('button', { class: 'btn', onclick: () => go('bachas') }, 'Ver bachas')),
    h('div', { class: 'tk-kpis' },
      h('div', { class: 'kpi' }, h('strong', {}, String(n('disponible'))), h('span', {}, 'en la Droguería')),
      h('div', { class: 'kpi' }, h('strong', {}, String(n('afuera'))), h('span', {}, 'en sucursales')),
      h('div', { class: `kpi ${demoradas.length ? 'bad' : ''}` }, h('strong', {}, String(demoradas.length)), h('span', {}, 'demoradas'))),
    demoradas.length ? h('ul', { class: 'drog-demoradas' }, demoradas.slice(0, 8).map(b => h('li', {}, h('span', { class: 'mono strong' }, b.codigo), ` ${b.sucursal} · tenía que volver el ${fechaCorta(b.retorno_esperado)} `, pillBacha(b.estado)))) : null);

  return h('div', { class: 'view drogueria' },
    h('header', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow' }, fechaLarga(hoy)), h('h1', {}, 'Tablero de la Droguería'))),
    h('div', { class: 'drog-grid' }, hoyBox, bachasBox), grafico);
}
