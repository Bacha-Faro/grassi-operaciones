// Recepción por sucursal: cada punto controla la factura/remito contra lo que llegó
// y confirma en la app (todo OK o marcando diferencias). El equipo puede registrarlo en nombre de una sucursal.
import { h, n, toast, modal, fecha, fechaHora, docNum, field } from '../ui.js?v=20261113-1822';

// r = { solicitud_id, oc_id, proveedor, interno, sucursal, enviada_at, recepcion, items: [{id, producto, unidad, aprobada, recibida}] }
export function abrirRecepcion({ api, r, onDone }) {
  const num = docNum({ id: r.oc_id, interno: r.interno });
  const origen = r.interno ? 'la Droguería' : r.proveedor;
  const vals = new Map(r.items.map(i => [i.id, i.recibida ?? i.aprobada]));
  const obs = h('textarea', { id: 'rec-obs', rows: 2, placeholder: 'Ej.: faltó 1 bidón; vino una caja rota' }, r.recepcion?.observaciones || '');
  const aviso = h('p', { class: 'aviso aviso-muted' });
  const filas = new Map();
  const pintarAviso = () => {
    const dif = r.items.filter(i => Number(vals.get(i.id)) !== Number(i.aprobada));
    for (const i of r.items) filas.get(i.id)?.classList.toggle('fila-dif', Number(vals.get(i.id)) !== Number(i.aprobada));
    aviso.className = `aviso aviso-${dif.length ? 'warn' : 'ok'}`;
    aviso.textContent = dif.length ? `${dif.length} insumo${dif.length > 1 ? 's' : ''} con diferencia. Contá qué pasó en Observaciones.` : 'Todo coincide con lo pedido.';
  };
  const inputs = r.items.map(i => h('input', { type: 'number', min: 0, step: 'any', id: `rec-${i.id}`, class: 'num-input', value: vals.get(i.id),
    'aria-label': `Recibido de ${i.producto}`, oninput: e => { vals.set(i.id, e.target.value === '' ? 0 : +e.target.value); pintarAviso(); } }));

  const tabla = h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Pedido'), h('th', { class: 'num' }, 'Llegó'))),
    h('tbody', {}, r.items.map((i, k) => { const tr = h('tr', {}, h('td', {}, i.producto, h('span', { class: 'muted' }, ` · ${i.unidad}`)),
      h('td', { class: 'num' }, n(i.aprobada)), h('td', { class: 'num' }, inputs[k])); filas.set(i.id, tr); return tr; }))));

  const guardar = async (todoOk) => {
    const items = r.items.map(i => ({ id: i.id, recibida: todoOk ? Number(i.aprobada) : Number(vals.get(i.id)) }));
    const hayDif = items.some((x, k) => x.recibida !== Number(r.items[k].aprobada));
    if (hayDif && !obs.value.trim()) { toast('Contá qué pasó con las diferencias en Observaciones', 'bad'); obs.focus(); return false; }
    try {
      await api.confirmarRecepcion(r.solicitud_id, r.oc_id, items, todoOk ? null : obs.value.trim() || null);
      toast(hayDif ? 'Recepción registrada con diferencias' : 'Recepción confirmada'); onDone?.();
    } catch (e) { toast(e.message, 'bad'); return false; }
  };

  modal({ title: `Recepción ${num} · ${origen}`, wide: true,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `${r.sucursal ? `${r.sucursal} · ` : ''}Enviada el ${fecha(r.enviada_at)}. Controlá la factura o remito contra lo que llegó físicamente.`),
      r.recepcion ? h('p', { class: 'aviso aviso-muted' }, `Ya se registró el ${fechaHora(r.recepcion.recibido_at)}${r.recepcion.por ? ` (${r.recepcion.por})` : ''}. Si lo guardás de nuevo, se corrige.`) : null,
      tabla, aviso, field('Observaciones', obs, 'Obligatorio si hay diferencias')),
    actions: [
      { label: 'Cancelar' },
      { label: 'Guardar con diferencias', onClick: () => guardar(false) },
      { label: 'Llegó todo bien', kind: 'primary', onClick: () => guardar(true) },
    ] });
  pintarAviso();
}

// Tarjeta de estado de una recepción (para listas)
export function estadoRecepcion(r) {
  if (!r.recepcion) return h('span', { class: 'pill pill-warn' }, 'Falta confirmar');
  return r.recepcion.conforme ? h('span', { class: 'pill pill-ok' }, 'Recibido OK') : h('span', { class: 'pill pill-warn' }, 'Con diferencias');
}

export function difsTexto(r) {
  return r.items.filter(i => i.recibida !== null && Number(i.recibida) !== Number(i.aprobada))
    .map(i => `${i.producto}: llegaron ${n(i.recibida)} de ${n(i.aprobada)}`);
}
