// Nueva solicitud: catálogo por categoría, cantidades, pedido sugerido según consumo.
import { h, money, n, toast, field, empty, groupBy, sum, fechaHora } from '../ui.js';

export async function render({ api, me, cat, go }) {
  const periodo = await api.periodoActual();
  if (!periodo) return empty('No hay un período abierto', 'Compras todavía no abrió el período de pedidos del mes.');

  const esStaff = me.rol !== 'solicitante';
  const sucursales = cat.sucursales.filter(s => s.activo !== false);
  let sucursalId = me.sucursal_id || sucursales[0].id;
  const qty = new Map();          // producto_id -> cantidad
  let filtro = '';

  const productos = cat.productos.filter(p => p.activo !== false);
  const porCat = groupBy(productos, p => p.categoria_id);
  const consumo = await api.consumo();
  const previas = (await api.solicitudes({ periodo_id: periodo.id })).filter(s => s.sucursal_id === sucursalId);

  // Pedido sugerido: promedio aprobado de los últimos 3 períodos de esta sucursal
  function sugerido() {
    const nombreSuc = cat.sucursales.find(s => s.id === sucursalId).nombre;
    const filas = consumo.filter(r => r.sucursal === nombreSuc && r.periodo !== periodo.nombre);
    const pers = [...new Set(filas.map(r => r.desde))].sort().slice(-3);
    const out = new Map();
    for (const r of filas.filter(r => pers.includes(r.desde))) out.set(r.producto_id, (out.get(r.producto_id) || 0) + r.cantidad_aprobada);
    for (const [k, v] of out) out.set(k, Math.round(v / pers.length));
    return { items: [...out].filter(([, v]) => v > 0), meses: pers.length };
  }

  const nombre = h('input', { id: 'sol-nombre', type: 'text', required: true, autocomplete: 'name', placeholder: 'Nombre y apellido' });
  try { nombre.value = esStaff ? '' : (localStorage.getItem('insumos-nombre') || ''); } catch { /* sin storage */ }
  const obs = h('textarea', { id: 'sol-obs', rows: 3, placeholder: 'Ej.: el dispenser de toallas del baño está roto' });
  const buscar = h('input', { id: 'sol-buscar', type: 'search', placeholder: 'Buscar insumo…', oninput: e => { filtro = e.target.value.toLowerCase(); pintarLista(); } });
  const lista = h('div', { class: 'catalogo' });
  const resumen = h('div', { class: 'resumen-body' });

  function stepper(p) {
    const inp = h('input', { type: 'number', min: 0, step: 1, inputmode: 'numeric', id: `q-${p.id}`, 'aria-label': `Cantidad de ${p.nombre}`, value: qty.get(p.id) || '',
      oninput: e => { const v = Math.max(0, Math.floor(+e.target.value || 0)); v ? qty.set(p.id, v) : qty.delete(p.id); row.classList.toggle('on', !!v); pintarResumen(); } });
    const bump = d => { inp.value = Math.max(0, (+inp.value || 0) + d); inp.dispatchEvent(new Event('input')); };
    const row = h('div', { class: `prod${qty.get(p.id) ? ' on' : ''}` },
      h('div', { class: 'prod-name' }, h('span', {}, p.nombre), h('small', {}, p.unidad, p.precio_ref ? ` · ref. ${money(p.precio_ref)}` : '')),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Restar', onclick: () => bump(-1) }, '−'), inp,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sumar', onclick: () => bump(1) }, '+')));
    return row;
  }

  function pintarLista() {
    lista.replaceChildren(...cat.categorias.map(c => {
      const ps = (porCat[c.id] || []).filter(p => !filtro || p.nombre.toLowerCase().includes(filtro));
      if (!ps.length) return null;
      const elegidos = ps.filter(p => qty.get(p.id)).length;
      return h('details', { class: 'cat', open: true },
        h('summary', {}, h('span', {}, c.nombre), h('span', { class: 'muted' }, elegidos ? `${elegidos} elegidos` : `${ps.length} insumos`)),
        h('div', { class: 'cat-list' }, ps.map(stepper)));
    }).filter(Boolean));
    if (!lista.children.length) lista.append(empty('Sin resultados', `No hay insumos que coincidan con “${filtro}”.`));
  }

  function pintarResumen() {
    const items = [...qty].map(([id, c]) => ({ p: productos.find(x => x.id === id), c }));
    const total = sum(items, i => i.c * (i.p.precio_ref || 0));
    resumen.replaceChildren(
      items.length ? h('ul', { class: 'resumen-list' }, items.map(i => h('li', {}, h('span', {}, i.p.nombre), h('span', { class: 'mono' }, `× ${n(i.c)}`))))
        : h('p', { class: 'muted' }, 'Todavía no elegiste insumos. Podés partir del pedido sugerido.'),
      h('div', { class: 'resumen-total' }, h('span', {}, `${items.length} insumos`), h('strong', { class: 'mono' }, money(total))),
      h('small', { class: 'hint' }, 'Monto estimado con precios de referencia, sin IVA.'));
  }

  const sucSelect = esStaff
    ? h('select', { id: 'sol-suc', onchange: e => { sucursalId = +e.target.value; } }, sucursales.map(s => h('option', { value: s.id, selected: s.id === sucursalId }, `${s.nombre} (${s.empresa})`)))
    : h('div', { class: 'readonly' }, cat.sucursales.find(s => s.id === sucursalId)?.nombre);

  async function enviar(e) {
    e.preventDefault();
    if (!nombre.value.trim()) { nombre.focus(); return toast('Indicá tu nombre y apellido', 'bad'); }
    if (!qty.size) return toast('Elegí al menos un insumo', 'bad');
    btn.disabled = true;
    try {
      const id = await api.crearSolicitud({ periodo_id: periodo.id, sucursal_id: sucursalId, solicitante_nombre: nombre.value.trim(),
        observaciones: obs.value.trim() || null, items: [...qty].map(([producto_id, cantidad]) => ({ producto_id, cantidad })) });
      try { localStorage.setItem('insumos-nombre', nombre.value.trim()); } catch { /* sin storage */ }
      toast(`Solicitud S-${String(id).padStart(4, '0')} enviada a auditoría`);
      go(esStaff ? 'auditoria' : 'mis-solicitudes');
    } catch (err) { toast(err.message, 'bad'); btn.disabled = false; }
  }
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Enviar solicitud');

  pintarLista(); pintarResumen();
  const cierre = periodo.cierre ? `Se reciben pedidos hasta el ${fechaHora(periodo.cierre)}` : '';

  return h('form', { class: 'view', onsubmit: enviar },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, `Período ${periodo.nombre}`), h('h1', {}, 'Nueva solicitud de insumos'),
        h('p', { class: 'muted' }, `Indicá lo que necesita tu sucursal para el mes. ${cierre}`)),
      h('button', { type: 'button', class: 'btn', onclick: () => {
        const s = sugerido();
        if (!s.items.length) return toast('No hay consumo previo para sugerir', 'warn');
        qty.clear(); s.items.forEach(([id, v]) => qty.set(id, v)); pintarLista(); pintarResumen();
        toast(`Cargado el promedio de los últimos ${s.meses} meses. Ajustá lo que haga falta.`);
      } }, 'Cargar pedido sugerido')),
    previas.length ? h('div', { class: 'notice' }, `Esta sucursal ya envió ${previas.length} solicitud${previas.length > 1 ? 'es' : ''} este período. Si mandás otra, se audita por separado.`) : null,
    h('div', { class: 'split' },
      h('div', { class: 'split-main' },
        h('div', { class: 'grid2' }, field('Sucursal / área', sucSelect), field('Nombre y apellido', nombre)),
        buscar, lista),
      h('aside', { class: 'resumen' }, h('h2', {}, 'Tu pedido'), resumen, field('Observaciones', obs), btn)));
}
