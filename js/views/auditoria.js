// Auditoría (RRHH): cola de solicitudes pendientes y revisión ítem por ítem,
// con el consumo promedio de la sucursal como referencia y alertas automáticas.
import { h, money, n, pill, empty, toast, fechaHora, solNum, sum, confirmar } from '../ui.js?v=20261113-1745';

export async function render({ api, me, refresh }) {
  const puedeAuditar = ['auditor', 'admin'].includes(me.rol);
  const [pend0, consumo] = await Promise.all([api.solicitudes({ estado: 'pendiente' }), api.consumo()]);
  // orden de la cola (se muestra invertida): urgentes arriba, y dentro de cada grupo la más antigua primero
  const pend = [...pend0].sort((a, b) => (a.urgente - b.urgente) || String(b.created_at).localeCompare(String(a.created_at)));
  let actual = pend[pend.length - 1]?.id ?? null;
  const lista = h('ul', { class: 'queue' });
  const panel = h('div', { class: 'audit-panel' });

  // promedio aprobado de los últimos 3 períodos cerrados por sucursal + producto
  function promedios(sucursal, periodoActual) {
    const filas = consumo.filter(r => r.sucursal === sucursal && r.periodo !== periodoActual);
    const pers = [...new Set(filas.map(r => r.desde))].sort().slice(-3);
    const m = new Map();
    for (const r of filas.filter(r => pers.includes(r.desde))) m.set(r.producto_id, (m.get(r.producto_id) || 0) + r.cantidad_aprobada);
    return { prom: id => pers.length ? (m.get(id) || 0) / pers.length : null, meses: pers.length };
  }

  function pintarLista() {
    lista.replaceChildren(...[...pend].reverse().map(s => h('li', {},
      h('button', { class: `queue-item${s.id === actual ? ' on' : ''}`, onclick: () => { actual = s.id; pintarLista(); pintarPanel(); } },
        h('span', { class: 'queue-top' }, h('strong', {}, s.sucursal, s.urgente ? h('span', { class: 'pill pill-bad tag-urg' }, 'Urgente') : null), h('span', { class: 'mono muted' }, solNum(s.id))),
        h('small', { class: 'muted' }, `${s.n_items} ítems · ${money(s.monto_solicitado)} · ${fechaHora(s.created_at)}`)))));
  }

  async function pintarPanel() {
    if (!actual) { panel.replaceChildren(empty('No hay solicitudes para auditar', 'Cuando una sucursal envíe un pedido aparece en esta cola.')); return; }
    panel.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
    const s = await api.solicitud(actual);
    const { prom, meses } = promedios(s.sucursal, s.periodo);
    const estado = new Map(s.items.map(i => [i.id, { cantidad_aprobada: i.cantidad_solicitada, motivo: '' }]));
    const totalEl = h('strong', { class: 'mono' });
    const calc = () => { totalEl.textContent = money(sum(s.items, i => estado.get(i.id).cantidad_aprobada * (i.precio_ref || 0))); };

    const filas = s.items.map(i => {
      const promedio = prom(i.producto_id);
      const alertas = [];
      if (promedio !== null && promedio > 0 && i.cantidad_solicitada >= promedio * 1.5) alertas.push(`${(i.cantidad_solicitada / promedio).toFixed(1)}× su promedio`);
      if (promedio === 0 && meses) alertas.push('Sin consumo en los últimos meses');
      if (i.tope_mensual && i.cantidad_solicitada > i.tope_mensual) alertas.push(`Supera el tope de ${i.tope_mensual}`);
      const st = estado.get(i.id);
      const motivo = h('input', { type: 'text', id: `mot-${i.id}`, class: 'motivo-input', placeholder: 'Motivo del ajuste', hidden: true, oninput: e => { st.motivo = e.target.value; } });
      const inp = h('input', { type: 'number', id: `apr-${i.id}`, min: 0, step: 1, value: i.cantidad_solicitada, disabled: !puedeAuditar, 'aria-label': `Cantidad aprobada de ${i.producto}`,
        oninput: e => { st.cantidad_aprobada = Math.max(0, +e.target.value || 0); motivo.hidden = st.cantidad_aprobada >= i.cantidad_solicitada; tr.dataset.st = tipo(); calc(); } });
      const tipo = () => st.cantidad_aprobada <= 0 ? 'rechazado' : st.cantidad_aprobada < i.cantidad_solicitada ? 'ajustado' : 'aprobado';
      const set = v => { inp.value = v; inp.dispatchEvent(new Event('input')); };
      const tr = h('tr', { 'data-st': 'aprobado' },
        h('td', {}, h('div', {}, i.producto), h('small', { class: 'muted' }, `${i.categoria} · ${i.unidad}`),
          alertas.map(a => h('span', { class: 'flag' }, a)), motivo),
        h('td', { class: 'num' }, n(i.cantidad_solicitada)),
        h('td', { class: 'num muted' }, promedio === null ? '—' : n(Math.round(promedio * 10) / 10)),
        h('td', { class: 'num' }, puedeAuditar ? h('div', { class: 'apr' }, inp,
          h('button', { type: 'button', class: 'mini', title: 'Aprobar lo pedido', onclick: () => set(i.cantidad_solicitada) }, '✓'),
          h('button', { type: 'button', class: 'mini bad', title: 'Rechazar', onclick: () => set(0) }, '✕')) : n(i.cantidad_solicitada)),
        h('td', { class: 'num' }, money(i.precio_ref)));
      return tr;
    });
    calc();
    const coment = h('textarea', { id: 'aud-com', rows: 2, placeholder: 'Comentario para la sucursal (opcional)' });

    async function confirmarAuditoria() {
      const items = s.items.map(i => {
        const st = estado.get(i.id);
        const t = st.cantidad_aprobada <= 0 ? 'rechazado' : st.cantidad_aprobada < i.cantidad_solicitada ? 'ajustado' : 'aprobado';
        return { id: i.id, estado: t, cantidad_aprobada: st.cantidad_aprobada, motivo: st.motivo || (t === 'rechazado' ? 'Rechazado en auditoría' : t === 'ajustado' ? 'Cantidad ajustada en auditoría' : null) };
      });
      const rech = items.filter(x => x.estado === 'rechazado').length, aj = items.filter(x => x.estado === 'ajustado').length;
      const ok = await confirmar('Confirmar auditoría', `${s.sucursal}: ${items.length - rech - aj} aprobados, ${aj} ajustados, ${rech} rechazados. Total ${totalEl.textContent}.`, 'Confirmar');
      if (!ok) return;
      try {
        const r = await api.auditar(s.id, items, coment.value.trim());
        toast(`${solNum(s.id)} ${r === 'rechazada' ? 'rechazada' : 'aprobada'}. Queda lista para orden de compra.`);
        refresh();
      } catch (e) { toast(e.message, 'bad'); }
    }

    panel.replaceChildren(
      h('header', { class: 'audit-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, `${solNum(s.id)} · ${s.periodo}`), h('h2', {}, s.sucursal),
          h('p', { class: 'muted' }, `Pidió ${s.solicitante_nombre} el ${fechaHora(s.created_at)}`)),
        pill(s.estado)),
      s.urgente ? h('p', { class: 'aviso aviso-bad' }, h('strong', {}, 'Pedido urgente: '), s.motivo_urgencia || 'sin motivo') : null,
      s.observaciones ? h('p', { class: 'note' }, h('strong', {}, 'Observaciones: '), s.observaciones) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl audit-tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Pedido'),
          h('th', { class: 'num', title: `Promedio aprobado de los últimos ${meses} meses` }, `Prom. ${meses}m`), h('th', { class: 'num' }, 'Aprobar'), h('th', { class: 'num' }, 'P. ref.'))),
        h('tbody', {}, filas))),
      puedeAuditar ? h('div', { class: 'audit-foot' }, coment,
        h('div', { class: 'audit-actions' }, h('span', {}, 'Total aprobado ', totalEl),
          h('button', { class: 'btn primary', onclick: confirmarAuditoria }, 'Confirmar auditoría')))
        : h('p', { class: 'muted' }, 'Solo RRHH o un administrador pueden auditar.'));
  }

  pintarLista(); pintarPanel();
  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'RRHH'), h('h1', {}, 'Auditoría de solicitudes'),
      h('p', { class: 'muted' }, `${pend.length} pendiente${pend.length === 1 ? '' : 's'}. Las alertas comparan el pedido con lo aprobado a esa sucursal en los últimos meses.`))),
    pend.length ? h('div', { class: 'audit' }, h('nav', { class: 'queue-wrap', 'aria-label': 'Solicitudes pendientes' }, lista), panel)
      : empty('Todo auditado', 'No quedan solicitudes pendientes.'));
}
