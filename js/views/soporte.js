// IT Grassi · Soporte IT: la sucursal o área carga tickets y sigue los suyos.
import { h, empty, fechaHora, tkNum, tabs } from '../ui.js?v=20261107-1435';
import { nuevoTicket, abrirTicket, estadoPill, ABIERTOS } from './ticket.js?v=20261107-1435';

export async function render({ api, me, cat, refresh, params }) {
  const [lista, cats] = await Promise.all([api.tickets(), api.itCategorias()]);
  let grupo = 'abiertos';
  const cont = h('div', { class: 'stack' });
  const abrir = id => abrirTicket({ api, me, id, cats, onChange: refresh });
  const confirmar = lista.filter(t => t.estado === 'resuelto');
  const esperan = lista.filter(t => t.estado === 'en_espera');

  function pintar() {
    const rows = lista.filter(t => grupo === 'abiertos' ? ABIERTOS.includes(t.estado) : !ABIERTOS.includes(t.estado));
    cont.replaceChildren(rows.length ? h('ul', { class: 'cards' }, rows.map(t => h('li', { class: `card${['resuelto', 'en_espera'].includes(t.estado) ? ' card-atencion' : ''}` },
      h('button', { class: 'card-row', onclick: () => abrir(t.id) },
        h('span', { class: 'mono strong' }, tkNum(t.id)),
        h('span', { class: 'card-main' }, h('strong', {}, t.asunto), h('small', { class: 'muted' }, `${t.categoria} · ${t.solicitante_nombre} · ${fechaHora(t.created_at)}`)),
        estadoPill(t.estado, false)))))
      : empty(grupo === 'abiertos' ? 'No tenés tickets abiertos' : 'Todavía no hay tickets cerrados',
        grupo === 'abiertos' ? 'Si algo no anda (la PC, la impresora, el posnet, internet), cargá un ticket y IT te responde por acá.' : null));
  }
  const cuenta = g => lista.filter(t => g === 'abiertos' ? ABIERTOS.includes(t.estado) : !ABIERTOS.includes(t.estado)).length;
  const tabBar = h('div');
  const pintarTabs = () => tabBar.replaceChildren(tabs([['abiertos', 'Abiertos', cuenta('abiertos')], ['cerrados', 'Cerrados', cuenta('cerrados')]], grupo, g => { grupo = g; pintarTabs(); pintar(); }));
  pintarTabs(); pintar();
  if (params?.t) setTimeout(() => abrir(+params.t), 0);

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, `IT Grassi · ${me.sucursal || 'Soporte'}`), h('h1', {}, 'Soporte IT'),
        h('p', { class: 'muted' }, 'Problemas con equipos, sistema, posnet, internet o usuarios. Todo lo que necesites de IT, cargalo acá.')),
      h('button', { class: 'btn primary', id: 'tk-nuevo', onclick: () => nuevoTicket({ api, me, cats, sucursales: cat.sucursales, onDone: id => { refresh(); setTimeout(() => abrir(id), 300); } }) }, '+ Nuevo ticket')),
    confirmar.length || esperan.length ? h('div', { class: 'notice tk-aviso' },
      esperan.length ? h('div', {}, h('strong', {}, `IT te hizo una pregunta en ${esperan.length === 1 ? tkNum(esperan[0].id) : `${esperan.length} tickets`}. `), 'Respondé para que pueda seguir.') : null,
      confirmar.length ? h('div', {}, h('strong', {}, `${confirmar.length === 1 ? `${tkNum(confirmar[0].id)} está resuelto` : `${confirmar.length} tickets están resueltos`}. `), 'Confirmá si quedó solucionado.') : null) : null,
    h('div', { class: 'toolbar' }, tabBar),
    cont);
}
