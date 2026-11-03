// Nueva solicitud, en modo "súper": cada categoría es una góndola (pasillo), los insumos son
// productos en el estante y el pedido es el carrito. Incluye pedido sugerido según consumo.
import { h, money, n, toast, field, empty, groupBy, sum, verFoto, carrito } from '../ui.js?v=20261103-1713';

// Pasillos: ícono y color por categoría (por nombre; si aparece una nueva, toma un color de la lista)
const PASILLOS = [
  [/limp|baño|higien/i, '🧽', '#0f8a5f'],
  [/refrig|cocina|caf|comida/i, '☕', '#c2611c'],
  [/librer|oficina|papeler/i, '✏️', '#1f63b8'],
  [/caja|ticket|fiscal/i, '🧾', '#7346b8'],
  [/cadet|fr[ií]o|envío|envio/i, '❄️', '#137f9c'],
];
const COLORES_EXTRA = ['#a23d6d', '#5f7d1c', '#b0412e', '#36598f'];
function pasillo(c, i) {
  const m = PASILLOS.find(([re]) => re.test(c.nombre));
  return m ? { emoji: m[1], color: m[2] } : { emoji: '🛒', color: COLORES_EXTRA[i % COLORES_EXTRA.length] };
}

// "Envase" de cada producto mientras no tenga foto: un dibujito según el nombre
const ENVASES = [
  [/higi[eé]nico|toalla de mano|servilleta/i, '🧻'], [/jab[oó]n/i, '🧼'], [/guante/i, '🧤'], [/raid|insectic/i, '🪰'],
  [/desodorante|aromatiz/i, '🌸'], [/esponja|gamuza|pa[ñn]o|rejilla|trapo/i, '🧽'], [/inodoro|pastilla/i, '🚽'],
  [/lavandina|cif|blem|detergente|l[ií]quido|limpia/i, '🧴'],
  [/caf[eé] /i, '☕'], [/caf[eé]/i, '☕'], [/yerba/i, '🧉'], [/t[eé] en|mate cocido/i, '🍵'], [/az[uú]car|edulcorante/i, '🍬'],
  [/leche/i, '🥛'], [/aceite/i, '🫒'], [/vinagre/i, '🍶'], [/sal\b/i, '🧂'],
  [/mo[ñn]o/i, '🎀'], [/post-?it/i, '🗒️'], [/clip|gancho/i, '📎'], [/cinta/i, '🎞️'], [/bandita|el[aá]stic/i, '➰'],
  [/cuaderno/i, '📒'], [/folio/i, '📁'], [/lapicera|bic/i, '🖊️'], [/l[aá]piz/i, '✏️'], [/fibr[oó]n|resaltador|marcador/i, '🖍️'],
  [/goma|corrector/i, '🩹'], [/pegamento|voligoma/i, '🧴'], [/trincheta|tijera/i, '✂️'], [/resma|hoja/i, '📄'],
  [/rollo|ticket/i, '🧾'], [/t[oó]ner/i, '🖨️'],
  [/gel refrig|hielo/i, '🧊'], [/t[eé]rmica|conservadora/i, '👜'], [/vale|aviso/i, '🎫'],
];
const envase = (p, def) => (ENVASES.find(([re]) => re.test(p.nombre)) || [null, def])[1];

const animar = !matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function render({ api, me, cat, go }) {
  const periodo = await api.periodoActual();
  if (!periodo) return empty('No se pudo cargar el mes en curso', 'Recargá la página. Si sigue, avisá a IT.');

  const esStaff = me.rol !== 'solicitante';
  const sucursales = cat.sucursales.filter(s => s.activo !== false);
  let sucursalId = me.sucursal_id || sucursales[0].id;
  const qty = new Map();          // producto_id -> cantidad
  let filtro = '';

  const productos = cat.productos.filter(p => p.activo !== false);
  const porCat = groupBy(productos, p => p.categoria_id);
  const categorias = cat.categorias.filter(c => (porCat[c.id] || []).length).map((c, i) => ({ ...c, ...pasillo(c, i), num: i + 1 }));
  const catDe = Object.fromEntries(categorias.map(c => [c.id, c]));
  const [consumo, delMes] = await Promise.all([api.consumo(), api.solicitudes({ periodo_id: periodo.id })]);
  const previas = delMes.filter(s => s.sucursal_id === sucursalId);

  // Pedido sugerido: promedio aprobado de los últimos 3 períodos de esta sucursal
  function sugerido() {
    const nombreSuc = cat.sucursales.find(s => s.id === sucursalId).nombre;
    const filas = consumo.filter(r => r.sucursal === nombreSuc && r.periodo !== periodo.nombre);
    const pers = [...new Set(filas.map(r => r.desde))].sort().slice(-3);
    const out = new Map();
    for (const r of filas.filter(r => pers.includes(r.desde))) out.set(r.producto_id, (out.get(r.producto_id) || 0) + r.cantidad_aprobada);
    for (const [k, v] of out) out.set(k, Math.round(v / pers.length));
    return { items: [...out].filter(([id, v]) => v > 0 && productos.some(p => p.id === id)), meses: pers.length };
  }

  const nombre = h('input', { id: 'sol-nombre', type: 'text', required: true, autocomplete: 'name', placeholder: 'Nombre y apellido' });
  try { nombre.value = esStaff ? '' : (localStorage.getItem('insumos-nombre') || ''); } catch { /* sin storage */ }
  const obs = h('textarea', { id: 'sol-obs', rows: 3, placeholder: 'Ej.: el dispenser de toallas del baño está roto' });
  // pedido urgente: imprevistos que no pueden esperar a la compra del mes
  const motivoUrg = h('input', { id: 'sol-urg-motivo', type: 'text', placeholder: '¿Por qué es urgente? Ej.: se terminó el papel del baño', hidden: true });
  const urgente = h('input', { id: 'sol-urgente', type: 'checkbox', onchange: e => { motivoUrg.hidden = !e.target.checked; urgBox.classList.toggle('on', e.target.checked); if (e.target.checked) motivoUrg.focus(); } });
  const urgBox = h('div', { class: 'urgente-box' }, h('label', { class: 'check' }, urgente, h('span', {}, h('strong', {}, 'Es urgente'), h('small', { class: 'muted' }, ' · imprevistos que no pueden esperar'))), motivoUrg);
  const buscar = h('input', { id: 'sol-buscar', type: 'search', placeholder: '¿Qué estás buscando? Ej.: lavandina', 'aria-label': 'Buscar insumo',
    oninput: e => { filtro = e.target.value.toLowerCase().trim(); pintarGondolas(); } });

  const pasillos = h('nav', { class: 'pasillos', 'aria-label': 'Pasillos' });
  const gondolas = h('div', { class: 'gondolas' });
  const resumen = h('div', { class: 'resumen-body' });
  const cartAside = carrito('cart-aside');
  const cartCount = h('span', { class: 'cart-count', 'aria-live': 'polite' });
  const barra = h('div', { class: 'carrito-bar', hidden: true });
  const tarjetas = new Map();     // producto_id -> { el, pintar }

  // ---- cantidades (un solo lugar para cambiarlas) ----
  function setQty(id, v, { repintarTarjeta = true } = {}) {
    v = Math.max(0, Math.floor(+v || 0));
    const antes = qty.get(id) || 0;
    v ? qty.set(id, v) : qty.delete(id);
    if (repintarTarjeta) tarjetas.get(id)?.pintar();
    tarjetas.get(id)?.el.classList.toggle('on', !!v);
    pintarResumen(); pintarPasillos();
    if (v > antes) rebotar();
  }

  function rebotar() {
    if (!animar) return;
    for (const el of [cartAside, barra.querySelector('.carrito')]) el?.animate(
      [{ transform: 'none' }, { transform: 'translateY(-5px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(4deg)' }, { transform: 'none' }],
      { duration: 420, easing: 'ease-out' });
  }
  // el producto "vuela" al carrito
  function volar(desde, emoji) {
    if (!animar) return;
    const destino = [barra.querySelector('.carrito'), cartAside].find(el => el && el.offsetParent !== null && !el.closest('[hidden]'));
    if (!destino) return;
    const a = desde.getBoundingClientRect(), b = destino.getBoundingClientRect();
    const f = h('span', { class: 'volando', 'aria-hidden': 'true' }, emoji);
    document.body.append(f);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    f.animate([
      { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 80}px) translate(-50%, -50%) scale(0.9)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(0.35)`, opacity: 0.2 },
    ], { duration: 650, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' }).onfinish = () => f.remove();
  }

  // ---- producto en la góndola ----
  function tarjeta(p, c) {
    const dibujo = envase(p, c.emoji);
    const accion = h('div', { class: 'prod-accion' });
    const pack = p.foto_url
      ? h('button', { type: 'button', class: 'pack foto', 'aria-label': `Ver foto de ${p.nombre}`, onclick: () => verFoto(p) }, h('img', { src: p.foto_url, alt: '', loading: 'lazy' }))
      : h('div', { class: 'pack', 'aria-hidden': 'true' }, h('span', {}, dibujo));
    const el = h('article', { class: `producto${qty.get(p.id) ? ' on' : ''}` },
      pack,
      h('div', { class: 'producto-nombre' }, h('strong', {}, p.nombre), h('small', {}, p.unidad)),
      accion,
      h('div', { class: 'etiqueta-precio', title: 'Precio de referencia, sin IVA' }, p.precio_ref ? money(p.precio_ref) : 'sin precio'));

    function pintar() {
      const q = qty.get(p.id) || 0;
      if (!q) {
        accion.replaceChildren(h('button', { type: 'button', class: 'btn-agregar', 'aria-label': `Agregar ${p.nombre} al carrito`,
          onclick: e => { volar(e.currentTarget.closest('.producto').querySelector('.pack'), dibujo); setQty(p.id, 1); accion.querySelector('input')?.focus(); } },
          carrito('mini'), 'Agregar'));
        return;
      }
      const inp = h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', id: `q-${p.id}`, 'aria-label': `Cantidad de ${p.nombre}`, value: q,
        oninput: e => setQty(p.id, e.target.value, { repintarTarjeta: false }),
        onblur: () => { if (!qty.get(p.id)) pintar(); } });
      accion.replaceChildren(h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Sacar uno de ${p.nombre}`, onclick: () => setQty(p.id, (qty.get(p.id) || 0) - 1) }, '−'), inp,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Sumar uno de ${p.nombre}`, onclick: () => setQty(p.id, (qty.get(p.id) || 0) + 1) }, '+')));
    }
    pintar();
    tarjetas.set(p.id, { el, pintar });
    return el;
  }

  function pintarPasillos() {
    pasillos.replaceChildren(...categorias.map(c => {
      const elegidos = (porCat[c.id] || []).filter(p => qty.get(p.id)).length;
      return h('button', { type: 'button', class: 'pasillo-btn', style: `--g:${c.color}`,
        onclick: () => document.getElementById(`gondola-${c.id}`)?.scrollIntoView({ behavior: animar ? 'smooth' : 'auto', block: 'start' }) },
        h('span', { class: 'pasillo-emoji', 'aria-hidden': 'true' }, c.emoji),
        h('span', { class: 'pasillo-txt' }, h('small', {}, `Pasillo ${c.num}`), h('span', {}, c.nombre)),
        elegidos ? h('span', { class: 'pasillo-n', 'aria-label': `${elegidos} en el carrito` }, elegidos) : null);
    }));
  }

  function pintarGondolas() {
    tarjetas.clear();
    gondolas.replaceChildren(...categorias.map(c => {
      const ps = (porCat[c.id] || []).filter(p => !filtro || p.nombre.toLowerCase().includes(filtro));
      if (!ps.length) return null;
      return h('section', { class: 'gondola', id: `gondola-${c.id}`, style: `--g:${c.color}`, 'aria-label': `Pasillo ${c.num}: ${c.nombre}` },
        h('div', { class: 'gondola-cartel' },
          h('span', { class: 'gondola-num' }, `Pasillo ${c.num}`),
          h('h2', {}, h('span', { 'aria-hidden': 'true' }, c.emoji), ' ', c.nombre),
          h('small', {}, `${ps.length} productos`)),
        h('div', { class: 'estantes' }, ps.map(p => tarjeta(p, c))));
    }).filter(Boolean));
    if (!gondolas.children.length) gondolas.append(empty('No lo encontramos en ningún pasillo', `No hay insumos que coincidan con “${filtro}”.`));
  }

  function pintarResumen() {
    const items = [...qty].map(([id, c]) => ({ p: productos.find(x => x.id === id), c })).filter(i => i.p);
    const unidades = sum(items, i => i.c);
    const total = sum(items, i => i.c * (i.p.precio_ref || 0));
    cartCount.textContent = items.length ? n(items.length) : '';
    resumen.replaceChildren(
      items.length
        ? h('ul', { class: 'ticket-list' }, items.map(i => h('li', {},
            h('span', { class: 'ticket-emoji', 'aria-hidden': 'true' }, envase(i.p, catDe[i.p.categoria_id]?.emoji || '🛒')),
            h('span', { class: 'ticket-nombre' }, i.p.nombre),
            h('span', { class: 'mono' }, `× ${n(i.c)}`),
            h('button', { type: 'button', class: 'ticket-quitar', 'aria-label': `Quitar ${i.p.nombre} del carrito`, onclick: () => setQty(i.p.id, 0) }, '×'))))
        : h('p', { class: 'muted carrito-vacio' }, 'Tu carrito está vacío. Recorré los pasillos o cargá el pedido sugerido.'),
      h('div', { class: 'ticket-total' },
        h('span', {}, `${n(items.length)} producto${items.length === 1 ? '' : 's'} · ${n(unidades)} u.`),
        h('strong', { class: 'mono' }, money(total))),
      h('small', { class: 'hint' }, 'Total estimado con precios de referencia, sin IVA.'));
    barra.hidden = !items.length;
    barra.replaceChildren(carrito('mini'), h('span', { class: 'mono' }, `${n(items.length)} · ${money(total)}`),
      h('button', { type: 'button', class: 'btn primary', onclick: () => aside.scrollIntoView({ behavior: animar ? 'smooth' : 'auto' }) }, 'Ver carrito'));
  }

  const sucSelect = esStaff
    ? h('select', { id: 'sol-suc', onchange: e => { sucursalId = +e.target.value; } }, sucursales.map(s => h('option', { value: s.id, selected: s.id === sucursalId }, `${s.nombre} (${s.empresa})`)))
    : h('div', { class: 'readonly' }, cat.sucursales.find(s => s.id === sucursalId)?.nombre);

  async function enviar(e) {
    e.preventDefault();
    if (!nombre.value.trim()) { nombre.focus(); return toast('Indicá tu nombre y apellido', 'bad'); }
    if (!qty.size) return toast('Tu carrito está vacío', 'bad');
    if (urgente.checked && !motivoUrg.value.trim()) { motivoUrg.focus(); return toast('Contá por qué es urgente', 'bad'); }
    btn.disabled = true;
    try {
      const id = await api.crearSolicitud({ periodo_id: periodo.id, sucursal_id: sucursalId, solicitante_nombre: nombre.value.trim(),
        observaciones: obs.value.trim() || null, urgente: urgente.checked, motivo_urgencia: urgente.checked ? motivoUrg.value.trim() : null, items: [...qty].map(([producto_id, cantidad]) => ({ producto_id, cantidad })) });
      try { localStorage.setItem('insumos-nombre', nombre.value.trim()); } catch { /* sin storage */ }
      toast(`Solicitud S-${String(id).padStart(4, '0')} enviada a auditoría${urgente.checked ? ' como urgente' : ''}`);
      go(esStaff ? 'auditoria' : 'mis-solicitudes');
    } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  }
  const btn = h('button', { class: 'btn primary block btn-caja', type: 'submit' }, 'Pasar por caja · enviar solicitud');

  const aside = h('aside', { class: 'resumen carrito-panel', 'aria-label': 'Tu carrito' },
    h('div', { class: 'carrito-head' }, h('span', { class: 'cart-wrap' }, cartAside, cartCount), h('h2', {}, 'Tu carrito')),
    resumen, field('Observaciones', obs), urgBox, btn);

  pintarPasillos(); pintarGondolas(); pintarResumen();

  return h('form', { class: 'view super', onsubmit: enviar },
    h('header', { class: 'super-head' },
      h('div', { class: 'toldo', 'aria-hidden': 'true' }),
      h('div', { class: 'super-cartel' },
        h('div', {}, h('p', { class: 'eyebrow' }, `Período ${periodo.nombre}`),
          h('h1', {}, 'Súper Insumos Grassi'),
          h('p', { class: 'muted' }, 'Recorré los pasillos y llená el carrito con lo que necesita tu sucursal. Podés pedir en cualquier momento del mes; si es un imprevisto, marcalo como urgente.')),
        h('button', { type: 'button', class: 'btn', onclick: () => {
          const s = sugerido();
          if (!s.items.length) return toast('No hay consumo previo para sugerir', 'warn');
          qty.clear(); s.items.forEach(([id, v]) => qty.set(id, v)); pintarGondolas(); pintarResumen(); pintarPasillos(); rebotar();
          toast(`Cargado el promedio de los últimos ${s.meses} meses. Ajustá lo que haga falta.`);
        } }, '📝 Cargar pedido sugerido'))),
    previas.length ? h('div', { class: 'notice' }, `Esta sucursal ya envió ${previas.length} solicitud${previas.length > 1 ? 'es' : ''} este mes. Si mandás otra, se audita por separado.`) : null,
    h('div', { class: 'split' },
      h('div', { class: 'split-main' },
        h('div', { class: 'grid2' }, field('Sucursal / área', sucSelect), field('Nombre y apellido', nombre)),
        h('div', { class: 'buscador' }, h('span', { 'aria-hidden': 'true' }, '🔎'), buscar),
        pasillos, gondolas),
      aside),
    barra);
}
