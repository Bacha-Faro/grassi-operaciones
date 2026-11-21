// Droguería · Mapa del depósito: el plano de la Droguería con cómo está operando ahora.
// Cada estación se pinta según el trabajo que tiene por delante (renglones de pedidos por juntar contra su ritmo normal);
// la más cargada se marca como cuello de botella. Los operarios activos caminan entre las estaciones según dónde está el
// trabajo (la posición es ilustrativa: Quantio no registra quién junta qué). Datos: foto de Quantio cada 2 minutos
// (herramientas/mapa_deposito.py) + lo que se registra en la app (recepciones y salidas).
import { h, empty } from '../ui.js?v=20261121-1423';
import { hoyAR, horaAR } from './drog-comun.js?v=20261121-1423';
import { salidasDelDia } from '../olas.js?v=20261121-1423';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...hijos) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
};
const nf = n => Math.round(n || 0).toLocaleString('es-AR');
const hs = x => x < 1 ? `${Math.max(1, Math.round(x * 60))} min` : `${x.toFixed(1).replace('.', ',')} h`;

// estaciones del plano (coordenadas del dibujo; el número es el del plano de sectores)
const EST = {
  frio:         { n: 8, nombre: 'Cámara de frío',   corto: 'Frío',        x: 45,  y: 45,  w: 135, h: 130, color: '#1aa6b7' },
  bultos:       { n: 7, nombre: 'Grandes bultos',   corto: 'Bultos',      x: 45,  y: 175, w: 135, h: 70,  color: '#3fae7a' },
  jaula:        { n: 6, nombre: 'Jaula',            corto: 'Jaula',       x: 45,  y: 245, w: 135, h: 130, color: '#e0892e' },
  medicamentos: { n: 4, nombre: 'Medicamentos',     corto: 'Medicamentos', x: 180, y: 45,  w: 150, h: 185, color: '#7d45b0' },
  perfumeria:   { n: 3, nombre: 'Perfumería',       corto: 'Perfumería',  x: 330, y: 45,  w: 125, h: 185, color: '#d6589a' },
  robot:        { n: 5, nombre: 'Robot GraBot',     corto: 'Robot',       x: 180, y: 245, w: 275, h: 130, color: '#3b7be0' },
};
const DESC = {
  frio: 'Medicamentos refrigerados (cadena de frío).', bultos: 'Pañales, toallitas, alcoholes, leches, descartables y accesorios.',
  jaula: 'Psicotrópicos, estupefacientes y genéricos, ordenados por laboratorio.', medicamentos: 'Medicamentos fuera del robot, en orden alfabético.',
  perfumeria: 'Ordenada por tipo de producto: fragancias, dermocosmética, salud dental…', robot: 'Alta y media rotación: 6 módulos, hasta 1200 artículos.',
};
const ESCR = { x: 455, y: 45, w: 145, h: 325 };          // 2 · escritorios
const RECEP = { x: 455, y: 370, w: 72, h: 345 };         // 1 · recepción (izquierda)
const EXPED = { x: 527, y: 370, w: 73, h: 345 };         // 1 · expedición (derecha)
const PASILLO = 237;                                      // pasillo horizontal entre las estanterías y el robot
const ROL = { pedidos: ['Pedidos', '#7d45b0'], ingreso: ['Ingreso', '#3fae7a'], recepcion: ['Recepción', '#e0892e'], admin: ['Administración', '#3b7be0'],
  encargado: ['Encargado', '#5b2d86'], sistema: ['Sistema', '#8a8f9c'], otro: ['Droguería', '#8a8f9c'] };
const centro = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export async function render({ api }) {
  let datos = null, app = { recep: [], salidas: [] }, sel = null, anim = null, timer = null, firma = '';
  let elegir = () => {};   // cambia la selección (estación o persona) sin redibujar el plano
  const vista = h('div', { class: 'mapa-cuerpo' });
  const reloj = h('span', { class: 'mapa-reloj mono' });

  async function cargar() {
    const hoy = hoyAR();
    const [m, recep, salidas] = await Promise.all([api.mapaDeposito(), api.recepcionesDrog().catch(() => []), api.salidasDrog(hoy).catch(() => [])]);
    const nueva = JSON.stringify([m?.foto?.generado, recep.map(r => r.id + r.estado), salidas.length]);
    datos = m; app = { recep, salidas };
    if (nueva !== firma) { firma = nueva; pintar(); }
  }

  function pintar() {
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    const f = datos?.foto;
    if (!f) { vista.replaceChildren(empty('Todavía no hay datos del depósito', 'Los manda la compu de IT desde Quantio cada 2 minutos, con la VPN prendida.')); return; }
    const est = f.estaciones || {};
    const sab = new Date(f.hoy + 'T12:00:00').getDay() === 6;
    const jornada = sab ? 4.5 : 8.5;
    // horas de trabajo por delante en cada estación: renglones por juntar contra su ritmo normal por hora
    const carga = Object.fromEntries(Object.keys(EST).map(k => {
      const e = est[k] || {}, porHora = Math.max(15, (e.base || 0) / jornada), pend = (e.pend || 0) + (e.cola || 0);
      return [k, { ...e, pendTot: pend, horas: pend / porHora, porHora }];
    }));
    const cuello = Object.entries(carga).sort((a, b) => b[1].horas - a[1].horas)[0];
    const hayCuello = cuello && cuello[1].horas >= 2;
    const nivel = x => x < 0.5 ? 0 : x < 2 ? 1 : x < 4 ? 2 : 3;

    // ---------- números de arriba ----------
    const cola = f.cola || [];
    const entro = cola.filter(p => p.etapa === 'entro'), armado = cola.filter(p => p.etapa === 'armado');
    const viejo = armado.length ? armado[0].ts : null;
    const hechos = f.hechos || [];
    const ahoraH = +horaAR().slice(0, 2);
    const ritmo = f.ritmo || [];
    const ult = ritmo.filter(r => r.hora < ahoraH && r.hora >= 7).slice(-1)[0];
    const prox = salidasDelDia(f.hoy).filter(o => o.hora > horaAR()).sort((a, b) => a.hora.localeCompare(b.hora))[0];
    const minFalta = prox ? (() => { const [a, b] = prox.hora.split(':').map(Number), [c, d] = horaAR().split(':').map(Number); return a * 60 + b - (c * 60 + d); })() : null;
    const edad = Math.round((Date.now() - new Date(f.generado).getTime()) / 60000);
    const ficha = (ico, val, txt, tono = '') => h('div', { class: `mapa-ficha ${tono}` }, h('span', { class: 'mapa-ficha-ico', 'aria-hidden': 'true' }, ico),
      h('div', {}, h('strong', {}, val), h('small', {}, txt)));
    const fichas = h('div', { class: 'mapa-fichas' },
      ficha('📥', nf(entro.length), `pedido${entro.length === 1 ? '' : 's'} esperando que se procesen`, entro.length > 8 ? 'warn' : ''),
      ficha('🛒', `${nf(armado.length)} · ${nf(armado.reduce((n, p) => n + p.renglones, 0))} renglones`, viejo ? `en armado · el más viejo desde ${viejo.slice(8, 10)}/${viejo.slice(5, 7)} ${viejo.slice(11, 16)}` : 'en armado', armado.some(p => p.ts.slice(0, 10) < f.hoy) ? 'bad' : ''),
      ficha('🚚', `${nf(hechos.length)} · ${nf(hechos.reduce((n, p) => n + p.renglones, 0))} renglones`, 'remitos despachados hoy'),
      ult ? ficha('⚡', `${nf(ult.hoy)} renglones`, `de ${ult.hora} a ${ult.hora + 1} h · normal ${nf(ult.base)}`, ult.hoy < ult.base * 0.6 ? 'warn' : ult.hoy > ult.base * 1.1 ? 'ok' : '') : null,
      prox ? ficha('⏰', minFalta < 60 ? `${minFalta} min` : `${Math.floor(minFalta / 60)} h ${minFalta % 60} min`, `para que salga ${prox.nombre} (${prox.hora} h)`, minFalta < 45 ? 'warn' : '') : ficha('🌙', 'Sin más salidas', 'por hoy'));

    // ---------- plano ----------
    const svg = s('svg', { viewBox: '30 30 590 700', class: 'mapa-svg', role: 'img', 'aria-label': 'Plano del depósito con la carga de cada estación' });
    svg.append(s('defs', {},
      s('pattern', { id: 'mp-reja', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, s('path', { d: 'M0 0L8 8M8 0L0 8', class: 'mp-reja' })),
      s('filter', { id: 'mp-sombra', x: '-20%', y: '-20%', width: '140%', height: '140%' }, s('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2.5, 'flood-opacity': 0.25 }))));
    // piso en L y paredes
    svg.append(s('path', { class: 'mp-piso', d: 'M45 45H600V715H455V375H45Z' }));
    // pasillo y flujo de la mercadería
    svg.append(s('rect', { class: 'mp-pasillo', x: 180, y: 230, width: 275, height: 15, rx: 4 }));
    const flujo = (d, cls) => s('path', { class: `mp-flujo ${cls}`, d });
    svg.append(
      flujo(`M490 705V${PASILLO}H190`, 'entra'),                      // entra por la puerta → recepción → estaciones
      flujo(`M200 ${PASILLO}H505V200`, 'arma'),                        // de las estaciones a los escritorios (armado y facturación)
      flujo('M540 200V705', 'sale'));                                  // de los escritorios a expedición → farmacias

    // estaciones
    for (const [k, r] of Object.entries(EST)) {
      const c = carga[k], nv = nivel(c.horas), elegido = sel?.tipo === 'est' && sel.id === k;
      const g = s('g', { 'data-k': k, class: `mp-est nv${nv}${hayCuello && cuello[0] === k ? ' cuello' : ''}${elegido ? ' on' : ''}`, tabindex: 0, role: 'button',
        'aria-label': `${r.nombre}: ${nf(c.pendTot)} renglones por juntar` });
      g.addEventListener('click', () => { elegir({ tipo: 'est', id: k }); });
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir({ tipo: 'est', id: k }); } });
      g.append(s('rect', { class: 'mp-zona', x: r.x + 3, y: r.y + 3, width: r.w - 6, height: r.h - 6, rx: 12 }));
      g.append(decoracion(k, r));
      const chico = r.h < 100;
      g.append(s('g', { class: 'mp-rotulo' },
        s('circle', { cx: r.x + 18, cy: r.y + 18, r: 10, style: `fill:${r.color}` }),
        s('text', { x: r.x + 18, y: r.y + 22, class: 'mp-num-sec', 'text-anchor': 'middle' }, r.n),
        s('text', { x: r.x + 33, y: r.y + 22, class: 'mp-nombre' }, chico ? r.corto : r.nombre)));
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + (chico ? 10 : 6);
      g.append(s('text', { x: cx, y: cy, class: 'mp-grande', 'text-anchor': 'middle' }, nf(c.pendTot)));
      if (!chico) g.append(s('text', { x: cx, y: cy + 17, class: 'mp-chico', 'text-anchor': 'middle' }, c.pendTot ? `por juntar · ≈ ${hs(c.horas)}` : 'al día'));
      if (hayCuello && cuello[0] === k) g.append(s('g', { class: 'mp-cartel' },
        s('rect', { x: cx - 58, y: r.y + r.h - 30, width: 116, height: 20, rx: 10 }),
        s('text', { x: cx, y: r.y + r.h - 16, 'text-anchor': 'middle' }, '⚠ Cuello de botella')));
      svg.append(g);
    }
    // escritorios, recepción y expedición
    const ent = (f.ingresos || []).length, recPend = app.recep.filter(r => !['disponible', 'rechazado', 'ingresado'].includes(r.estado)).length;
    const salHoy = app.salidas.length, bachasHoy = app.salidas.reduce((n, x) => n + (x.bachas || 0) + (x.bultos || 0), 0);
    svg.append(s('g', { class: 'mp-fijo' },
      s('rect', { class: 'mp-zona escr', x: ESCR.x + 3, y: ESCR.y + 3, width: ESCR.w - 6, height: ESCR.h - 6, rx: 12 }),
      escritorios(),
      s('circle', { cx: ESCR.x + 18, cy: ESCR.y + 18, r: 10, class: 'mp-num-gris' }), s('text', { x: ESCR.x + 18, y: ESCR.y + 22, class: 'mp-num-sec', 'text-anchor': 'middle' }, 2),
      s('text', { x: ESCR.x + 33, y: ESCR.y + 22, class: 'mp-nombre' }, 'Escritorios'),
      s('text', { x: ESCR.x + ESCR.w / 2, y: ESCR.y + ESCR.h - 46, class: 'mp-grande', 'text-anchor': 'middle' }, nf(hechos.length)),
      s('text', { x: ESCR.x + ESCR.w / 2, y: ESCR.y + ESCR.h - 29, class: 'mp-chico', 'text-anchor': 'middle' }, 'remitos hoy'),
      s('rect', { class: 'mp-zona recep', x: RECEP.x + 3, y: RECEP.y + 3, width: RECEP.w - 4, height: RECEP.h - 6, rx: 10 }),
      s('rect', { class: 'mp-zona exped', x: EXPED.x + 1, y: EXPED.y + 3, width: EXPED.w - 4, height: EXPED.h - 6, rx: 10 }),
      s('circle', { cx: RECEP.x + 16, cy: RECEP.y + 18, r: 10, class: 'mp-num-gris' }), s('text', { x: RECEP.x + 16, y: RECEP.y + 22, class: 'mp-num-sec', 'text-anchor': 'middle' }, 1),
      s('text', { x: RECEP.x + RECEP.w / 2, y: RECEP.y + 46, class: 'mp-nombre', 'text-anchor': 'middle' }, 'Recepción'),
      s('text', { x: EXPED.x + EXPED.w / 2, y: EXPED.y + 46, class: 'mp-nombre', 'text-anchor': 'middle' }, 'Expedición'),
      cajas(RECEP, Math.min(12, ent + recPend), 'caja'),
      cajas(EXPED, Math.min(12, Math.ceil(bachasHoy / 3)), 'bacha'),
      s('text', { x: RECEP.x + RECEP.w / 2, y: RECEP.y + 72, class: 'mp-grande chico', 'text-anchor': 'middle' }, nf(ent)),
      s('text', { x: RECEP.x + RECEP.w / 2, y: RECEP.y + 86, class: 'mp-chico', 'text-anchor': 'middle' }, 'facturas'),
      s('text', { x: RECEP.x + RECEP.w / 2, y: RECEP.y + 98, class: 'mp-chico', 'text-anchor': 'middle' }, 'cargadas'),
      s('text', { x: EXPED.x + EXPED.w / 2, y: EXPED.y + 72, class: 'mp-grande chico', 'text-anchor': 'middle' }, nf(salHoy)),
      s('text', { x: EXPED.x + EXPED.w / 2, y: EXPED.y + 86, class: 'mp-chico', 'text-anchor': 'middle' }, 'salidas'),
      s('text', { x: EXPED.x + EXPED.w / 2, y: EXPED.y + 98, class: 'mp-chico', 'text-anchor': 'middle' }, 'registradas'),
      s('path', { class: 'mp-puerta', d: 'M470 715h115' }), s('text', { x: 527, y: 728, class: 'mp-chico', 'text-anchor': 'middle' }, 'entrada · salida')));
    // espacio libre del plano: la fila de pedidos y el recorrido de la mercadería
    const tablero = s('g', { class: 'mp-tablero' });
    tablero.append(s('text', { x: 60, y: 410, class: 'mp-nombre' }, 'Pedidos en el camino'));
    const fila = (lista, y0, cls, txt) => {
      tablero.append(s('text', { x: 60, y: y0, class: 'mp-chico' }, txt));
      lista.slice(0, 26).forEach((p, i) => {
        const x = 60 + (i % 13) * 29, y = y0 + 8 + Math.floor(i / 13) * 25;
        tablero.append(s('g', { class: `mp-ped ${cls}`, style: `animation-delay:${i * 0.05}s` },
          s('rect', { x, y, width: 25, height: 19, rx: 5 }),
          s('text', { x: x + 12.5, y: y + 13, 'text-anchor': 'middle' }, (p.farmacia.match(/Suc (\d+)/) || [, '·'])[1])));
      });
      if (!lista.length) tablero.append(s('text', { x: 60, y: y0 + 20, class: 'mp-chico' }, 'ninguno'));
    };
    fila(entro.slice().reverse(), 432, 'entro', `📥 Entraron y esperan que se procesen: ${entro.length}`);
    fila(armado, 500, 'armado', `🛒 En armado: ${armado.length} (el número es la sucursal)`);
    tablero.append(s('text', { x: 60, y: 580, class: 'mp-nombre' }, 'Cómo se mueve la mercadería'));
    [['entra', 'Entra: proveedor → recepción → estaciones'], ['arma', 'Se junta y se arma en los escritorios'], ['sale', 'Sale: expedición → farmacias']].forEach(([c, t], i) => {
      tablero.append(s('path', { class: `mp-flujo ${c}`, d: `M62 ${602 + i * 22}h44` }), s('text', { x: 114, y: 606 + i * 22, class: 'mp-chico' }, t));
    });
    svg.append(tablero);
    // paredes encima
    svg.append(s('path', { class: 'mp-pared', d: 'M45 45H600V715H455V375H45Z' }));

    // ---------- operarios (posición ilustrativa) ----------
    const gente = h('div');
    const capa = s('g', { class: 'mp-gente' });
    svg.append(capa);
    const generado = new Date(f.generado).getTime();
    const minDesde = hm => { if (!hm) return 9e9; const [a, b] = hm.split(':').map(Number), d = new Date(generado); return (d.getHours() * 60 + d.getMinutes()) - (a * 60 + b); };
    const equipo = (f.equipo || []).filter(p => p.rol !== 'sistema');
    const activos = equipo.filter(p => minDesde(p.ultima) <= 60);
    const pesos = k => Object.keys(EST).map(x => [x, k === 'ingreso' ? (est[x]?.entro_hoy || 0) + 1 : carga[x].pendTot + (carga[x].hoy ? 2 : 0)]);
    const sortear = lista => { const tot = lista.reduce((n, [, w]) => n + w, 0); let r = Math.random() * tot; for (const [k, w] of lista) { r -= w; if (r <= 0) return k; } return lista[0][0]; };
    const casa = p => p.rol === 'ingreso' || p.rol === 'recepcion' ? { x: RECEP.x + 36, y: RECEP.y + 150 + Math.random() * 120 } : { x: ESCR.x + 30 + Math.random() * 85, y: ESCR.y + 60 + Math.random() * 180 };
    const ruta = (a, b) => [a, { x: a.x < 455 ? a.x : 470, y: a.y }, { x: 470, y: PASILLO }, { x: b.x, y: PASILLO }, b].filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
    const muevo = activos.map((p, i) => {
      const [, col] = ROL[p.rol] || ROL.otro, ini = (p.nombre || '?').replace(/[^\p{L} ]/gu, '').slice(0, 2).toUpperCase();
      const nodo = s('g', { class: `mp-persona rol-${p.rol}`, tabindex: 0, role: 'button', 'aria-label': `${p.nombre}, ${(ROL[p.rol] || ROL.otro)[0]}` },
        s('circle', { r: 11, style: `fill:${col}`, filter: 'url(#mp-sombra)' }), s('text', { y: 4, 'text-anchor': 'middle' }, ini));
      nodo.addEventListener('click', e => { e.stopPropagation(); elegir({ tipo: 'per', id: p.nombre }); });
      capa.append(nodo);
      const base = casa(p);
      return { p, nodo, pos: { ...base }, casa: base, tramo: [], espera: 800 + i * 700, fijo: !['pedidos', 'ingreso', 'recepcion'].includes(p.rol) };
    });
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const poner = m => m.nodo.setAttribute('transform', `translate(${m.pos.x.toFixed(1)} ${m.pos.y.toFixed(1)})`);
    const puntoEn = k => { const r = EST[k]; return { x: r.x + 25 + Math.random() * (r.w - 50), y: r.y + 40 + Math.random() * (r.h - 55) }; };
    muevo.forEach(m => {
      if (quieto && !m.fijo) m.pos = m.p.rol === 'recepcion' ? m.casa : puntoEn(sortear(pesos(m.p.rol)));
      poner(m);
    });
    if (!quieto && muevo.some(m => !m.fijo)) {
      let antes = performance.now();
      const paso = ahora => {
        if (!svg.isConnected) { anim = null; return; }
        const dt = Math.min(80, ahora - antes); antes = ahora;
        for (const m of muevo) {
          if (m.fijo) continue;
          if (m.espera > 0) { m.espera -= dt; continue; }
          if (!m.tramo.length) {    // próximo destino: una estación (según dónde hay trabajo) o volver a su lugar
            if (m.enCasa === false) { m.tramo = ruta(m.pos, m.casa).slice(1); m.enCasa = true; m.al = 'casa'; }
            else if (m.p.rol === 'recepcion') { const otro = { x: (m.pos.x < EXPED.x ? EXPED.x + 36 : RECEP.x + 36), y: RECEP.y + 150 + Math.random() * 150 }; m.tramo = [otro]; m.al = 'casa'; }
            else { m.tramo = ruta(m.pos, puntoEn(sortear(pesos(m.p.rol)))).slice(1); m.enCasa = false; m.al = 'est'; }
          }
          const obj = m.tramo[0], dx = obj.x - m.pos.x, dy = obj.y - m.pos.y, d = Math.hypot(dx, dy), v = 0.055 * dt;
          if (d <= v) { m.pos = { ...obj }; m.tramo.shift(); if (!m.tramo.length) m.espera = m.al === 'est' ? 1800 + Math.random() * 2600 : 1400 + Math.random() * 2000; }
          else { m.pos.x += dx / d * v; m.pos.y += dy / d * v; }
          poner(m);
        }
        anim = requestAnimationFrame(paso);
      };
      anim = requestAnimationFrame(paso);
    }

    // ---------- panel de detalle ----------
    const panel = h('aside', { class: 'mapa-panel' }, detalle());
    elegir = nuevo => {
      sel = nuevo;
      panel.replaceChildren(detalle());
      svg.querySelectorAll('.mp-est').forEach(g => g.classList.toggle('on', sel?.tipo === 'est' && g.dataset.k === sel.id));
    };
    function detalle() {
      if (sel?.tipo === 'per') {
        const p = equipo.find(x => x.nombre === sel.id);
        if (!p) return resumen();
        const [rolTxt, col] = ROL[p.rol] || ROL.otro;
        return h('div', { class: 'stack' },
          h('div', { class: 'mapa-per-cab' }, h('span', { class: 'mapa-avatar', style: `background:${col}` }, (p.nombre || '?').slice(0, 2).toUpperCase()),
            h('div', {}, h('h2', {}, p.nombre), h('small', { class: 'muted' }, rolTxt, p.ultima ? ` · último movimiento ${p.ultima} h` : ' · sin movimientos hoy'))),
          h('div', { class: 'mapa-mini-kpis' },
            h('div', {}, h('strong', {}, nf(p.renglones)), h('small', {}, 'renglones en remitos')),
            p.ingresados ? h('div', {}, h('strong', {}, nf(p.ingresados)), h('small', {}, 'renglones ingresados')) : null,
            p.ajustes ? h('div', {}, h('strong', {}, nf(p.ajustes)), h('small', {}, 'ajustes')) : null),
          barritas(p.por_hora, 6, col),
          h('p', { class: 'muted mapa-nota' }, p.rol === 'pedidos' ? 'Los renglones son los de los remitos que hizo con su usuario. Quien factura no siempre es quien juntó: para medir el armado de cada uno hace falta marcar en el celular cuándo toma y termina cada pedido.' : 'Movimientos de stock registrados hoy con su usuario de Quantio.'),
          h('button', { class: 'btn', onclick: () => { elegir(null); } }, 'Ver todo el depósito'));
      }
      if (sel?.tipo === 'est') {
        const k = sel.id, r = EST[k], c = carga[k];
        return h('div', { class: 'stack' },
          h('div', { class: 'mapa-est-cab', style: `--c:${r.color}` }, h('span', {}, r.n), h('div', {}, h('h2', {}, r.nombre), h('small', { class: 'muted' }, DESC[k]))),
          h('div', { class: 'mapa-mini-kpis' },
            h('div', {}, h('strong', {}, nf(c.pend)), h('small', {}, 'renglones en armado')),
            h('div', {}, h('strong', {}, nf(c.cola)), h('small', {}, 'en pedidos que todavía no se procesaron')),
            h('div', { class: c.pend_sin_stock ? 'mal' : '' }, h('strong', {}, nf(c.pend_sin_stock)), h('small', {}, 'pedidos sin stock')),
            h('div', {}, h('strong', {}, c.pendTot ? hs(c.horas) : '—'), h('small', {}, `de trabajo al ritmo normal (${nf(c.porHora)} renglones/h)`))),
          h('div', { class: 'mapa-comp' }, h('span', {}, 'Despachado hoy'), h('strong', {}, nf(c.hoy)), h('span', { class: 'muted' }, `normal: ${nf(c.base)} por día`),
            h('div', { class: 'mapa-barra' }, h('i', { style: `width:${Math.min(100, (c.hoy || 0) / Math.max(1, c.base) * 100)}%;background:${r.color}` }))),
          h('div', { class: 'mapa-mini-kpis' },
            h('div', {}, h('strong', {}, nf(c.stock_art)), h('small', {}, 'artículos con stock')),
            h('div', {}, h('strong', {}, nf(c.stock_uni)), h('small', {}, 'unidades')),
            h('div', { class: c.en_falta ? 'mal' : '' }, h('strong', {}, nf(c.en_falta)), h('small', {}, 'en falta (con mínimo)')),
            h('div', {}, h('strong', {}, nf(c.entro_hoy)), h('small', {}, 'renglones que entraron hoy'))),
          c.top?.length ? h('div', {}, h('h3', { class: 'mapa-h3' }, 'Lo más pedido hoy'), h('ol', { class: 'mapa-top' }, c.top.map(t =>
            h('li', {}, h('span', {}, t.producto), h('small', { class: t.stock <= 0 ? 'txt-bad' : 'muted' }, `${t.renglones} ped. · stock ${nf(t.stock)}`))))) : null,
          h('button', { class: 'btn', onclick: () => { elegir(null); } }, 'Ver todo el depósito'));
      }
      return resumen();
    }
    function resumen() {
      const orden = Object.entries(carga).sort((a, b) => b[1].horas - a[1].horas);
      return h('div', { class: 'stack' },
        h('h2', {}, 'Todo el depósito'),
        h('p', { class: 'muted mapa-nota' }, 'Cada estación se pinta según el trabajo que tiene por delante: los renglones de los pedidos por juntar, contra lo que despacha en una hora normal. Tocá una estación o a una persona para ver el detalle.'),
        h('ul', { class: 'mapa-ranking' }, orden.map(([k, c]) => h('li', {},
          h('button', { type: 'button', onclick: () => { elegir({ tipo: 'est', id: k }); } },
            h('span', { class: 'mapa-pt', style: `background:${EST[k].color}` }), h('span', {}, EST[k].nombre),
            h('span', { class: `mapa-nv nv${nivel(c.horas)}` }, c.pendTot ? `${nf(c.pendTot)} · ${hs(c.horas)}` : 'al día'))))),
        h('div', { class: 'mapa-leyenda' }, ['Menos de 30 min', 'Hasta 2 h', '2 a 4 h', 'Más de 4 h'].map((t, i) => h('span', {}, h('i', { class: `nv${i}` }), t))));
    }

    // ---------- cola de pedidos ----------
    const sectorBar = ps => { const tot = Object.values(ps || {}).reduce((a, b) => a + b, 0) || 1;
      return h('span', { class: 'mapa-mix', title: Object.entries(ps || {}).map(([k, n]) => `${EST[k]?.corto || k}: ${n}`).join(' · ') },
        Object.keys(EST).filter(k => ps?.[k]).map(k => h('i', { style: `width:${ps[k] / tot * 100}%;background:${EST[k].color}` }))); };
    const tarjetaPed = p => h('li', { class: `mapa-ped${p.ts.slice(0, 10) < f.hoy ? ' viejo' : ''}` },
      h('div', {}, h('strong', {}, p.farmacia), h('small', { class: 'muted' }, p.ts.slice(0, 10) < f.hoy ? `${p.ts.slice(8, 10)}/${p.ts.slice(5, 7)} ${p.ts.slice(11, 16)}` : `${p.ts.slice(11, 16)} h`)),
      h('div', { class: 'mapa-ped-num' }, h('strong', {}, nf(p.renglones)), h('small', {}, 'reng.')),
      sectorBar(p.por_sector),
      p.sin_stock ? h('small', { class: 'txt-bad' }, `${p.sin_stock} sin stock`) : null);
    const colaSec = h('section', { class: 'block mapa-cola' },
      h('div', { class: 'block-head' }, h('h2', {}, 'Pedidos en el camino'), h('div', { class: 'mapa-leyenda' }, Object.values(EST).map(r => h('span', {}, h('i', { style: `background:${r.color}` }), r.corto)))),
      h('div', { class: 'mapa-carriles' },
        h('div', {}, h('h3', { class: 'mapa-h3' }, `📥 Entraron · ${entro.length}`), entro.length ? h('ul', { class: 'mapa-peds' }, entro.slice(-40).reverse().map(tarjetaPed)) : h('p', { class: 'muted' }, 'Nada esperando.')),
        h('div', {}, h('h3', { class: 'mapa-h3' }, `🛒 En armado · ${armado.length}`), armado.length ? h('ul', { class: 'mapa-peds' }, armado.map(tarjetaPed)) : h('p', { class: 'muted' }, 'Ningún pedido en armado.')),
        h('div', {}, h('h3', { class: 'mapa-h3' }, `🚚 Despachados hoy · ${hechos.length}`), hechos.length ? h('ul', { class: 'mapa-peds hechos' }, hechos.slice().reverse().slice(0, 40).map(p =>
          h('li', { class: 'mapa-ped hecho' }, h('div', {}, h('strong', {}, p.farmacia), h('small', { class: 'muted' }, `${p.hora} h${p.quien ? ' · ' + p.quien : ''}`)),
            h('div', { class: 'mapa-ped-num' }, h('strong', {}, nf(p.renglones)), h('small', {}, 'reng.')), sectorBar(p.por_sector)))) : h('p', { class: 'muted' }, 'Todavía no salió nada.'))));

    // ---------- equipo ----------
    const tarjetaPer = p => { const [rolTxt, col] = ROL[p.rol] || ROL.otro, activo = minDesde(p.ultima) <= 60;
      return h('li', {}, h('button', { type: 'button', class: `mapa-per${activo ? ' activo' : ''}`, onclick: () => { elegir({ tipo: 'per', id: p.nombre }); scrollTo({ top: 0, behavior: 'smooth' }); } },
        h('span', { class: 'mapa-avatar', style: `background:${col}` }, (p.nombre || '?').slice(0, 2).toUpperCase()),
        h('span', { class: 'mapa-per-txt' }, h('strong', {}, p.nombre), h('small', { class: 'muted' }, rolTxt, ' · ', activo ? `activo ${p.ultima} h` : p.ultima ? `último ${p.ultima} h` : 'sin movimientos')),
        h('span', { class: 'mapa-per-num' }, nf(p.renglones + p.ingresados + p.ajustes)), barritas(p.por_hora, 6, col, true))); };
    const sistema = (f.equipo || []).find(p => p.rol === 'sistema');
    gente.replaceChildren(h('section', { class: 'block' },
      h('div', { class: 'block-head' }, h('h2', {}, 'El equipo hoy'), h('small', { class: 'muted' }, 'Movimientos de stock con su usuario de Quantio. En el mapa caminan los que se movieron en la última hora.')),
      h('ul', { class: 'mapa-equipo' }, equipo.map(tarjetaPer)),
      sistema ? h('p', { class: 'muted mapa-nota' }, `Además, ${nf(sistema.renglones + sistema.ajustes)} movimientos automáticos sin usuario.`) : null));

    // ---------- ritmo e ingresos ----------
    const maxR = Math.max(1, ...ritmo.map(r => Math.max(r.hoy, r.base)));
    const ritmoSec = h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Ritmo del día'), h('small', { class: 'muted' }, 'Renglones despachados por hora: hoy contra un día normal')),
      h('div', { class: 'mapa-ritmo' }, ritmo.filter(r => r.hora >= 7 && r.hora <= 19).map(r => h('div', { class: `mapa-hora${r.hora === ahoraH ? ' ahora' : ''}` },
        h('div', { class: 'mapa-col' }, h('i', { class: 'r-base', style: `height:${r.base / maxR * 100}%` }), h('i', { class: 'r-hoy', style: `height:${r.hoy / maxR * 100}%` })),
        h('small', {}, r.hora)))),
      h('div', { class: 'mapa-leyenda' }, h('span', {}, h('i', { class: 'r-hoy' }), 'Hoy'), h('span', {}, h('i', { class: 'r-base' }), 'Día normal')));
    const ingresos = f.ingresos || [];
    const ingSec = h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Mercadería que entró hoy'),
      h('small', { class: 'muted' }, `${recPend} llegada${recPend === 1 ? '' : 's'} en Recepción todavía sin ingresar`)),
      ingresos.length ? h('ul', { class: 'mapa-peds' }, ingresos.slice().reverse().map(i => h('li', { class: 'mapa-ped' },
        h('div', {}, h('strong', {}, i.proveedor), h('small', { class: 'muted' }, `${i.hora || ''} h${i.quien ? ' · ' + i.quien : ''}`)),
        h('div', { class: 'mapa-ped-num' }, h('strong', {}, nf(i.renglones)), h('small', {}, 'reng.')), sectorBar(i.por_sector))))
        : h('p', { class: 'muted' }, 'Hoy todavía no se cargó ninguna factura de compra en Quantio.'));

    vista.replaceChildren(
      h('div', { class: 'mapa-estado' }, h('span', { class: `mapa-vivo${edad > 10 ? ' viejo' : ''}` }), `Datos de Quantio de las ${f.generado.slice(11, 16)} h`,
        h('span', { class: 'muted' }, edad > 10 ? ` · hace ${edad < 120 ? edad + ' min' : Math.round(edad / 60) + ' h'}: revisá que la compu de IT y la VPN estén prendidas` : ' · se actualiza cada 2 minutos'), reloj),
      fichas,
      h('div', { class: 'mapa-grid' }, h('div', { class: 'mapa-plano' }, svg, h('p', { class: 'muted mapa-nota' }, 'Las personas en el plano muestran quién está activo y hacia dónde está el trabajo; su posición es ilustrativa.')), panel),
      colaSec, h('div', { class: 'ind-grid' }, ritmoSec, ingSec), gente);
  }

  const tic = () => { reloj.textContent = horaAR(); };
  tic();
  await cargar();
  timer = setInterval(() => {
    if (!vista.isConnected) { clearInterval(timer); return; }
    tic();
    if (Date.now() - (cargar.ultima || 0) >= 30000) { cargar.ultima = Date.now(); cargar().catch(() => {}); }   // busca datos nuevos cada 30 segundos
  }, 5000);

  return h('div', { class: 'view drog-mapa' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Droguería · en vivo'), h('h1', {}, 'Mapa del depósito'),
        h('p', { class: 'muted' }, 'Cómo está operando la Droguería ahora: qué hay por juntar en cada estación, dónde se traba y quién está en movimiento.')),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => { firma = ''; cargar(); } }, 'Actualizar'))),
    vista);
}

// mini gráfico de barras por hora (6 a 20 h)
function barritas(serie = [], desde = 6, color = '#7d45b0', chico = false) {
  const max = Math.max(1, ...serie);
  return h('span', { class: `mapa-spark${chico ? ' chico' : ''}`, 'aria-hidden': 'true' }, serie.map((v, i) =>
    h('i', { title: `${desde + i} h: ${v}`, style: `height:${Math.max(v ? 8 : 2, v / max * 100)}%;background:${v ? color : 'var(--line)'}` })));
}

// dibujos dentro de cada estación
function decoracion(k, r) {
  const g = s('g', { class: 'mp-deco' });
  if (k === 'medicamentos' || k === 'perfumeria') {
    const n = k === 'medicamentos' ? 5 : 4, ancho = (r.w - 40) / n;
    for (let i = 0; i < n; i++) g.append(s('rect', { x: r.x + 20 + i * ancho + ancho * 0.3, y: r.y + 38, width: ancho * 0.4, height: r.h - 52, rx: 3 }));
  } else if (k === 'jaula') {
    g.append(s('rect', { x: r.x + 14, y: r.y + 34, width: r.w - 28, height: r.h - 46, rx: 6, fill: 'url(#mp-reja)', class: 'mp-jaula' }));
  } else if (k === 'bultos') {
    for (let i = 0; i < 4; i++) g.append(s('rect', { x: r.x + 62 + i * 17, y: r.y + 30 + (i % 2) * 6, width: 14, height: 14, rx: 2 }));
  } else if (k === 'frio') {
    g.append(s('rect', { x: r.x + 14, y: r.y + 34, width: 46, height: r.h - 46, rx: 6 }));
    g.append(s('path', { class: 'mp-copo', d: `M${r.x + 37} ${r.y + 58}v34M${r.x + 22} ${r.y + 66}l30 18M${r.x + 22} ${r.y + 84}l30 -18` }));
  } else if (k === 'robot') {
    const ancho = (r.w - 40) / 6;
    for (let i = 0; i < 6; i++) {
      g.append(s('rect', { x: r.x + 20 + i * ancho + 3, y: r.y + r.h - 46, width: ancho - 6, height: 34, rx: 4, class: 'mp-modulo' }));
      g.append(s('circle', { cx: r.x + 20 + i * ancho + ancho / 2, cy: r.y + r.h - 36, r: 2.6, class: 'mp-led', style: `animation-delay:${i * 0.35}s` }));
    }
  }
  return g;
}
function escritorios() {
  const g = s('g', { class: 'mp-deco' });
  for (let i = 0; i < 4; i++) {
    const y = ESCR.y + 50 + i * 52;
    g.append(s('rect', { x: ESCR.x + 22, y, width: 42, height: 22, rx: 4 }), s('rect', { x: ESCR.x + 82, y, width: 42, height: 22, rx: 4 }));
  }
  return g;
}
function cajas(zona, n, tipo) {
  const g = s('g', { class: `mp-${tipo}s` });
  for (let i = 0; i < n; i++) {
    const col = i % 3, fila = Math.floor(i / 3);
    g.append(s('rect', { x: zona.x + 12 + col * 17, y: zona.y + zona.h - 34 - fila * 16, width: 14, height: tipo === 'bacha' ? 11 : 13, rx: tipo === 'bacha' ? 3 : 1.5,
      class: `mp-${tipo}`, style: `animation-delay:${i * 0.08}s` }));
  }
  return g;
}
