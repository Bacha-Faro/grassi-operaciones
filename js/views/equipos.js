// Soporte IT · Equipos: inventario por sucursal (PC, impresoras, posnet, routers…) con el historial de tickets de cada uno. Solo IT.
import { h, toast, modal, field, empty, fecha, tkNum, descargarCSV } from '../ui.js?v=20261113-1943';
import { TIPOS_EQUIPO, abrirTicket, estadoPill, ABIERTOS } from './ticket.js?v=20261113-1943';

export const ESTADOS_EQUIPO = { en_uso: ['En uso', 'ok'], en_reparacion: ['En reparación', 'warn'], en_deposito: ['En depósito', 'info'], de_baja: ['De baja', 'muted'] };
const estadoEq = e => h('span', { class: `pill pill-${ESTADOS_EQUIPO[e]?.[1] || 'muted'}` }, ESTADOS_EQUIPO[e]?.[0] || e);

export async function render({ api, me, cat, refresh }) {
  let [equipos, tickets, cats] = await Promise.all([api.itEquipos(), api.tickets(), api.itCategorias()]);
  let fSuc = '', fTipo = '', fEstado = 'activos', q = '';
  const cont = h('div');
  const sucNom = id => cat.sucursales.find(s => s.id === id)?.nombre || 'Sin asignar (IT)';
  const tkDe = id => tickets.filter(t => t.equipo_id === id);
  const recargar = async () => { [equipos, tickets] = await Promise.all([api.itEquipos(), api.tickets()]); pintar(); };

  function ficha(e = {}) {
    const nuevo = !e.id;
    const suc = h('select', { id: 'eq-suc' }, h('option', { value: '' }, 'Sin asignar (en IT)'), cat.sucursales.map(s => h('option', { value: s.id, selected: s.id === e.sucursal_id }, s.nombre)));
    const tipo = h('select', { id: 'eq-tipo' }, Object.entries(TIPOS_EQUIPO).map(([k, l]) => h('option', { value: k, selected: k === (e.tipo || 'pc') }, l)));
    const nombre = h('input', { id: 'eq-nombre', maxlength: 80, value: e.nombre || '', placeholder: 'Ej.: PC Caja 1' });
    const marca = h('input', { id: 'eq-marca', maxlength: 60, value: e.marca || '' });
    const modelo = h('input', { id: 'eq-modelo', maxlength: 80, value: e.modelo || '' });
    const serie = h('input', { id: 'eq-serie', maxlength: 80, value: e.serie || '' });
    const usuario = h('input', { id: 'eq-usuario', maxlength: 80, value: e.usuario || '', placeholder: 'Ej.: Caja 1, Depósito, Farmacéutica' });
    const remoto = h('input', { id: 'eq-remoto', maxlength: 60, value: e.remoto || '', placeholder: 'ID de AnyDesk (sin contraseña)' });
    const estado = h('select', { id: 'eq-estado' }, Object.entries(ESTADOS_EQUIPO).map(([k, [l]]) => h('option', { value: k, selected: k === (e.estado || 'en_uso') }, l)));
    const nota = h('textarea', { id: 'eq-nota', rows: 2, maxlength: 1000, value: e.nota || '', placeholder: 'Garantía, service, compra, lo que sirva' });
    const hist = tkDe(e.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const m = modal({ title: nuevo ? 'Agregar equipo' : e.nombre, wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, field('Nombre', nombre, 'Como lo llaman en la sucursal'), field('Tipo', tipo)),
        h('div', { class: 'grid2' }, field('Sucursal o área', suc), field('Estado', estado)),
        h('div', { class: 'grid2' }, field('Marca', marca), field('Modelo', modelo)),
        h('div', { class: 'grid2' }, field('N.º de serie', serie), field('Quién lo usa / dónde está', usuario)),
        field('Acceso remoto', remoto, 'Solo el ID. Las contraseñas no se guardan acá.'),
        field('Notas', nota),
        nuevo ? null : h('div', { class: 'eq-hist' },
          h('strong', {}, `Tickets de este equipo (${hist.length})`),
          hist.length ? h('ul', { class: 'eq-hist-lista' }, hist.map(t => h('li', {},
            h('button', { class: 'link', onclick: () => { m.close(); abrirTicket({ api, me, id: t.id, cats, onChange: recargar }); } }, tkNum(t.id)),
            h('span', {}, ` ${t.asunto}`), h('small', { class: 'muted' }, ` · ${t.categoria} · ${fecha(t.created_at)} `), estadoPill(t.estado, true))))
            : h('p', { class: 'muted' }, 'Todavía no tiene tickets.'))),
      actions: [{ label: 'Cancelar' }, { label: nuevo ? 'Agregar' : 'Guardar', kind: 'primary', onClick: async () => {
        if (nombre.value.trim().length < 2) { toast('Poné un nombre', 'bad'); return false; }
        try {
          await api.guardarEquipo({ id: e.id, sucursal_id: suc.value || null, tipo: tipo.value, nombre: nombre.value, marca: marca.value, modelo: modelo.value,
            serie: serie.value, usuario: usuario.value, remoto: remoto.value, estado: estado.value, nota: nota.value });
          toast(nuevo ? 'Equipo agregado' : 'Cambios guardados'); recargar();
        } catch (err) { toast(err.message, 'bad'); return false; }
      } }] });
  }

  const filtrados = () => equipos.filter(e => (!fSuc || String(e.sucursal_id ?? 0) === fSuc) && (!fTipo || e.tipo === fTipo)
    && (fEstado === 'todos' || (fEstado === 'activos' ? e.estado !== 'de_baja' : e.estado === fEstado))
    && (!q || [e.nombre, e.marca, e.modelo, e.serie, e.usuario, e.remoto].some(x => String(x || '').toLowerCase().includes(q))));

  function pintar() {
    const rows = filtrados().sort((a, b) => sucNom(a.sucursal_id).localeCompare(sucNom(b.sucursal_id), 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
    if (!equipos.length) return cont.replaceChildren(empty('Todavía no hay equipos cargados', 'Agregá el primero con "+ Agregar equipo", o pasale a IT la planilla para importarla.'));
    if (!rows.length) return cont.replaceChildren(empty('No hay equipos con esos filtros'));
    cont.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover eq-tbl' },
      h('thead', {}, h('tr', {}, ['Equipo', 'Tipo', 'Sucursal', 'Marca y modelo', 'Usuario', 'Estado', 'Tickets'].map(x => h('th', {}, x)))),
      h('tbody', {}, rows.map(e => {
        const ts = tkDe(e.id), ab = ts.filter(t => ABIERTOS.includes(t.estado)).length;
        return h('tr', { onclick: () => ficha(e), tabindex: 0, onkeydown: ev => { if (ev.key === 'Enter') ficha(e); } },
          h('td', {}, h('strong', {}, e.nombre), e.serie ? h('small', { class: 'muted mono', style: 'display:block' }, e.serie) : null),
          h('td', {}, TIPOS_EQUIPO[e.tipo] || e.tipo),
          h('td', {}, sucNom(e.sucursal_id)),
          h('td', {}, [e.marca, e.modelo].filter(Boolean).join(' ') || '—'),
          h('td', {}, e.usuario || '—'),
          h('td', {}, estadoEq(e.estado)),
          h('td', { class: 'num' }, ts.length ? `${ts.length}${ab ? ` (${ab} abierto${ab > 1 ? 's' : ''})` : ''}` : '—'));
      })))));
  }
  pintar();

  const descargar = () => {
    const rows = filtrados();
    if (!rows.length) return toast('No hay equipos para descargar', 'bad');
    descargarCSV('Equipos IT', [['Sucursal', 'Equipo', 'Tipo', 'Marca', 'Modelo', 'N.º de serie', 'Usuario', 'Acceso remoto', 'Estado', 'Tickets', 'Notas'],
      ...rows.map(e => [sucNom(e.sucursal_id), e.nombre, TIPOS_EQUIPO[e.tipo], e.marca, e.modelo, e.serie, e.usuario, e.remoto, ESTADOS_EQUIPO[e.estado]?.[0], tkDe(e.id).length, e.nota])]);
  };
  const conEquipos = [...new Set(equipos.map(e => e.sucursal_id ?? 0))];
  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Soporte IT · inventario'), h('h1', {}, 'Equipos'),
        h('p', { class: 'muted' }, 'Los equipos de cada sucursal. Al cargar un ticket, la sucursal elige cuál falla y acá queda el historial.')),
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn', onclick: descargar }, 'Descargar CSV'),
        h('button', { class: 'btn primary', onclick: () => ficha() }, '+ Agregar equipo'))),
    h('div', { class: 'toolbar filters' },
      h('input', { type: 'search', placeholder: 'Buscar nombre, serie, modelo…', 'aria-label': 'Buscar equipo', oninput: e => { q = e.target.value.trim().toLowerCase(); pintar(); } }),
      h('select', { 'aria-label': 'Sucursal', onchange: e => { fSuc = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todas las sucursales'),
        conEquipos.includes(0) ? h('option', { value: '0' }, 'Sin asignar (IT)') : null,
        cat.sucursales.filter(s => conEquipos.includes(s.id)).map(s => h('option', { value: s.id }, s.nombre))),
      h('select', { 'aria-label': 'Tipo', onchange: e => { fTipo = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todos los tipos'), Object.entries(TIPOS_EQUIPO).map(([k, l]) => h('option', { value: k }, l))),
      h('select', { 'aria-label': 'Estado', onchange: e => { fEstado = e.target.value; pintar(); } },
        h('option', { value: 'activos' }, 'Activos (sin los de baja)'), h('option', { value: 'todos' }, 'Todos'),
        Object.entries(ESTADOS_EQUIPO).map(([k, [l]]) => h('option', { value: k }, l)))),
    cont);
}
