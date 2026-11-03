// Utilidades de interfaz: DOM, formatos, estados, avisos y diálogos.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
export const money = v => ars.format(Number(v) || 0);
export const n = v => num.format(Number(v) || 0);
export const pct = v => (v === null || !isFinite(v)) ? '—' : `${v > 0 ? '+' : ''}${num.format(Math.round(v * 10) / 10)}%`;
// "2026-11-12" (fecha sin hora) se interpreta como día local; si no, en Argentina se vería un día antes
const aFecha = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
export const fecha = d => d ? aFecha(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const fechaHora = d => d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const ocNum = id => `OC-${String(id).padStart(4, '0')}`;
// N° de documento: OP (orden de preparación, proveedor interno) u OC (orden de compra)
export const docNum = o => `${o?.interno ? 'OP' : 'OC'}-${String(o?.id ?? o).padStart(4, '0')}`;
export const solNum = id => `S-${String(id).padStart(4, '0')}`;

const ESTADOS = {
  pendiente:        ['Pendiente de auditoría', 'warn'],
  aprobada:         ['Aprobada', 'ok'],
  aprobada_parcial: ['Aprobada con ajustes', 'ok'],
  rechazada:        ['Rechazada', 'bad'],
  en_compra:        ['En compra', 'info'],
  recibida:         ['Recibida', 'done'],
  // ítems
  aprobado: ['Aprobado', 'ok'], ajustado: ['Ajustado', 'warn'], rechazado: ['Rechazado', 'bad'],
  // OC
  borrador: ['Borrador', 'warn'], enviada: ['Enviada', 'info'],
  recibida_parcial: ['Recibida con diferencias', 'warn'], anulada: ['Anulada', 'bad'],
};
export function pill(estado) {
  const [txt, tone] = ESTADOS[estado] || [estado, 'muted'];
  return h('span', { class: `pill pill-${tone}` }, txt);
}

export function toast(msg, tone = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast toast-${tone}` }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// Diálogo propio (el visor de artifacts no muestra confirm/alert)
export function modal({ title, body, actions = [], wide = false }) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'modal-bg', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'modal-head' }, h('h3', {}, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('footer', { class: 'modal-foot' },
        actions.map(a => h('button', {
          class: `btn ${a.kind || ''}`,
          onclick: async ev => { const r = await a.onClick?.(ev); if (r !== false) close(); },
        }, a.label))) : null));
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  wrap.querySelector('input,select,textarea,button.btn')?.focus();
  return { close, el: wrap };
}

export function confirmar(title, texto, label = 'Confirmar', kind = 'primary') {
  return new Promise(res => modal({
    title, body: h('p', {}, texto),
    actions: [{ label: 'Cancelar', onClick: () => res(false) }, { label, kind, onClick: () => res(true) }],
  }));
}

export function empty(titulo, texto) {
  return h('div', { class: 'empty' }, h('strong', {}, titulo), texto ? h('p', {}, texto) : null);
}

export function section(title, extra, ...content) {
  return h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, title), extra || null), ...content);
}

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control,
    hint ? h('small', { class: 'hint' }, hint) : null);
}

export function tabs(items, active, onChange) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map(([id, label, count]) =>
    h('button', { role: 'tab', class: `tab${id === active ? ' on' : ''}`, 'aria-selected': String(id === active), onclick: () => onChange(id) },
      label, count !== undefined ? h('span', { class: 'tab-count' }, count) : null)));
}

export const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] ||= []).push(x); return m; }, {});
export const sum = (arr, fn = x => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);

// replaceChildren/append convierten null en el texto "null": los filtramos en toda la app.
for (const m of ['replaceChildren', 'append']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...k) { return orig.apply(this, k.filter(x => x !== null && x !== undefined && x !== false)); };
}

// Achica una foto (de la cámara o de la compu) a máx. `max` px y la pasa a JPEG, para que pese poco
export async function achicarImagen(file, max = 640, calidad = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('No se pudo leer la imagen. Probá con una foto JPG o PNG.'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(res, 'image/jpeg', calidad));
}

// Foto grande de un insumo
export function verFoto(p) {
  modal({ title: p.nombre, body: h('div', { class: 'foto-grande' }, h('img', { src: p.foto_url, alt: p.nombre }),
    h('p', { class: 'muted' }, [p.unidad, p.precio_ref ? `ref. ${money(p.precio_ref)}` : null].filter(Boolean).join(' · '))) });
}

// Link de compra de un insumo (Mercado Libre u otra tienda): abre en otra pestaña
export function linkCompra(url, corto = false) {
  if (!url) return null;
  let sitio = 'Comprar online';
  try { const host = new URL(url).hostname; sitio = /mercadoli(b|v)re/.test(host) ? 'Mercado Libre' : host.replace(/^www\./, ''); } catch { /* url rara */ }
  return h('a', { class: 'link-compra', href: url, target: '_blank', rel: 'noopener noreferrer', onclick: e => e.stopPropagation(), title: url }, corto ? `${sitio} ↗` : `Comprar en ${sitio} ↗`);
}

// Carrito de súper (dibujo propio, toma el color del texto). Decorativo.
const CARRITO_SVG = `<svg viewBox="0 0 64 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect class="c-caja1" x="20" y="5" width="12" height="13" rx="2" fill="#71A850"/>
<rect class="c-caja2" x="33.5" y="1" width="9" height="17" rx="2" fill="#0055B8" fill-opacity=".85"/>
<circle class="c-fruta" cx="47.5" cy="12.5" r="5" fill="#F2B632"/>
<path d="M4 6h7l6.2 30H51" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M13 16h43l-5 16H16.2z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M25 17l1.4 14M36 17v14M47 17l-2 14" stroke="currentColor" stroke-width="2" stroke-opacity=".45"/>
<g class="c-ruedas"><circle cx="21" cy="45" r="4.5" fill="currentColor"/><circle cx="46" cy="45" r="4.5" fill="currentColor"/></g>
</svg>`;
export const carrito = (cls = '') => h('span', { class: `carrito ${cls}`.trim(), 'aria-hidden': 'true', html: CARRITO_SVG });
