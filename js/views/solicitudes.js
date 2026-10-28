// Seguimiento de solicitudes: la sucursal ve las suyas; el equipo ve todas.
import { h, money, n, pill, empty, fechaHora, solNum, tabs } from '../ui.js';

const GRUPOS = [
  ['activas', 'En curso', ['pendiente', 'aprobada', 'aprobada_parcial', 'en_compra']],
  ['cerradas', 'Cerradas', ['recibida', 'rechazada']],
];

export async function render({ api, me, cat }) {
  const todas = await api.solicitudes();
  const esStaff = me.rol !== 'solicitante';
  let grupo = 'activas', sucFiltro = '';
  const cont = h('div', { class: 'stack' });

  async function detalle(s, box) {
    if (box.dataset.loaded) { box.hidden = !box.hidden; return; }
    box.hidden = false; box.textContent = 'Cargando…';
    const d = await api.solicitud(s.id);
    box.dataset.loaded = '1';
    box.replaceChildren(
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Pedido'), h('th', { class: 'num' }, 'Aprobado'), h('th', { class: 'num' }, 'Recibido'), h('th', {}, 'Estado'))),
        h('tbody', {}, d.items.map(i => h('tr', {},
          h('td', {}, i.producto, i.motivo ? h('small', { class: 'motivo' }, i.motivo) : null),
          h('td', { class: 'num' }, n(i.cantidad_solicitada)),
          h('td', { class: 'num' }, i.cantidad_aprobada === null ? '—' : n(i.cantidad_aprobada)),
          h('td', { class: 'num' }, i.cantidad_recibida === null ? '—' : n(i.cantidad_recibida)),
          h('td', {}, i.estado === 'pendiente' ? h('span', { class: 'muted' }, 'Pendiente') : pill(i.estado))))))),
      d.observaciones ? h('p', { class: 'note' }, h('strong', {}, 'Observaciones: '), d.observaciones) : null,
      d.comentario_auditoria ? h('p', { class: 'note' }, h('strong', {}, 'Auditoría: '), d.comentario_auditoria) : null);
  }

  function pintar() {
    const estados = GRUPOS.find(g => g[0] === grupo)[2];
    const rows = todas.filter(s => estados.includes(s.estado)).filter(s => !sucFiltro || s.sucursal_id === +sucFiltro);
    cont.replaceChildren(rows.length ? h('ul', { class: 'cards' }, rows.map(s => {
      const box = h('div', { class: 'card-detail', hidden: true });
      return h('li', { class: 'card' },
        h('button', { class: 'card-row', 'aria-expanded': 'false', onclick: e => { detalle(s, box); e.currentTarget.setAttribute('aria-expanded', String(!box.hidden)); } },
          h('span', { class: 'mono strong' }, solNum(s.id)),
          h('span', { class: 'card-main' }, h('strong', {}, esStaff ? s.sucursal : s.periodo), h('small', { class: 'muted' }, `${s.solicitante_nombre} · ${fechaHora(s.created_at)}${esStaff ? ` · ${s.periodo}` : ''}`)),
          h('span', { class: 'mono muted hide-sm' }, `${s.n_items} ítems`),
          h('span', { class: 'mono hide-sm' }, money(s.estado === 'pendiente' ? s.monto_solicitado : s.monto_aprobado)),
          pill(s.estado)),
        box);
    })) : empty(grupo === 'activas' ? 'No hay solicitudes en curso' : 'No hay solicitudes cerradas', esStaff ? null : 'Cuando envíes una solicitud vas a poder seguir su estado acá.'));
  }

  const cuenta = id => todas.filter(s => GRUPOS.find(g => g[0] === id)[2].includes(s.estado)).length;
  const tabBar = h('div');
  const pintarTabs = () => tabBar.replaceChildren(tabs(GRUPOS.map(([id, l]) => [id, l, cuenta(id)]), grupo, id => { grupo = id; pintarTabs(); pintar(); }));
  pintarTabs(); pintar();

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, esStaff ? 'Todas las sucursales' : me.sucursal),
      h('h1', {}, esStaff ? 'Solicitudes' : 'Mis solicitudes'))),
    h('div', { class: 'toolbar' }, tabBar,
      esStaff ? h('select', { id: 'f-suc', 'aria-label': 'Filtrar por sucursal', onchange: e => { sucFiltro = e.target.value; pintar(); } },
        h('option', { value: '' }, 'Todas las sucursales'), cat.sucursales.map(s => h('option', { value: s.id }, s.nombre))) : null),
    cont);
}
