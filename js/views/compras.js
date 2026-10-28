// Compras: consolida lo aprobado en órdenes por proveedor y razón social,
// permite ajustar precios, enviar la OC por mail y registrar la recepción.
import { h, money, n, pill, empty, toast, fecha, ocNum, sum, groupBy, modal, confirmar, tabs, field } from '../ui.js';
import { ocHTML, ocPDF, pdfBase64 } from '../oc-doc.js';

export async function render({ api, me, refresh }) {
  const puede = ['compras', 'admin'].includes(me.rol);
  const [pend, ordenes] = await Promise.all([api.pendientesOC(), api.ordenes()]);
  let filtro = 'abiertas';

  // ---- listo para ordenar ----
  const grupos = Object.entries(groupBy(pend, i => `${i.proveedor || 'Sin proveedor asignado'}|${i.empresa}`));
  const sinProv = pend.filter(i => !i.proveedor_id);
  const listo = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Aprobado, listo para ordenar'),
      puede && pend.length ? h('button', { class: 'btn primary', onclick: async () => {
        try { const k = await api.generarOrdenes(); toast(`${k} orden${k === 1 ? '' : 'es'} de compra generada${k === 1 ? '' : 's'} en borrador`); refresh(); }
        catch (e) { toast(e.message, 'bad'); }
      } }, 'Generar órdenes de compra') : null),
    pend.length ? h('div', { class: 'cards-grid' }, grupos.map(([k, its]) => {
      const [prov, emp] = k.split('|');
      const prods = groupBy(its, i => i.producto);
      return h('div', { class: 'tile' },
        h('div', { class: 'tile-head' }, h('strong', {}, prov), h('span', { class: 'chip' }, emp)),
        h('p', { class: 'muted' }, `${Object.keys(prods).length} insumos de ${new Set(its.map(i => i.sucursal)).size} sucursales`),
        h('p', { class: 'tile-num mono' }, money(sum(its, i => i.cantidad_aprobada * (i.precio_ref || 0)))));
    })) : empty('No hay pedidos aprobados pendientes de orden', 'Cuando RRHH apruebe una solicitud, sus insumos aparecen acá agrupados por proveedor.'),
    sinProv.length ? h('p', { class: 'notice' }, `${sinProv.length} ítems no tienen proveedor habitual y no se van a ordenar. Asignalo en Catálogo.`) : null);

  // ---- órdenes ----
  const FILTROS = { abiertas: ['borrador', 'enviada', 'recibida_parcial'], cerradas: ['recibida', 'anulada'] };
  const tabla = h('div');
  const tabBar = h('div');
  function pintar() {
    tabBar.replaceChildren(tabs([['abiertas', 'Abiertas', ordenes.filter(o => FILTROS.abiertas.includes(o.estado)).length], ['cerradas', 'Cerradas']], filtro, f => { filtro = f; pintar(); }));
    const rows = ordenes.filter(o => FILTROS[filtro].includes(o.estado));
    tabla.replaceChildren(rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover' },
      h('thead', {}, h('tr', {}, h('th', {}, 'N°'), h('th', {}, 'Proveedor'), h('th', {}, 'Empresa'), h('th', { class: 'hide-sm' }, 'Período'), h('th', { class: 'num' }, 'Total'), h('th', {}, 'Estado'))),
      h('tbody', {}, rows.map(o => h('tr', { tabindex: 0, onclick: () => abrir(o.id), onkeydown: e => e.key === 'Enter' && abrir(o.id) },
        h('td', { class: 'mono' }, ocNum(o.id)), h('td', {}, o.proveedor), h('td', {}, o.empresa), h('td', { class: 'hide-sm' }, o.periodo || '—'),
        h('td', { class: 'num' }, money(o.total)), h('td', {}, pill(o.estado))))))) : empty('No hay órdenes en esta vista'));
  }
  pintar();

  // ---- detalle de OC ----
  async function abrir(id) {
    const oc = await api.orden(id);
    const borrador = oc.estado === 'borrador' && puede;
    const edits = new Map(oc.items.map(i => [i.id, { id: i.id, cantidad: i.cantidad, precio_unit: i.precio_unit }]));
    const preview = h('div');
    const vista = () => {
      const items = oc.items.map(i => ({ ...i, ...edits.get(i.id) }));
      return { ...oc, items, total: sum(items, i => i.cantidad * i.precio_unit), fecha_entrega: entrega.value || null, forma_pago: pago.value, observaciones: obsI.value || null };
    };
    const repintar = () => preview.replaceChildren(ocHTML(vista()));
    const entrega = h('input', { type: 'date', id: 'oc-entrega', value: oc.fecha_entrega || '', disabled: !borrador, onchange: repintar });
    const pago = h('input', { type: 'text', id: 'oc-pago', value: oc.forma_pago || '', disabled: !borrador, oninput: repintar });
    const obsI = h('input', { type: 'text', id: 'oc-obs', value: oc.observaciones || '', disabled: !borrador, placeholder: 'Ej.: entregar en Droguería, horario 8 a 14', oninput: repintar });

    const precios = borrador ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Cantidad'), h('th', { class: 'num' }, 'Precio unit.'))),
      h('tbody', {}, oc.items.map(i => h('tr', {}, h('td', {}, i.producto),
        h('td', { class: 'num' }, h('input', { type: 'number', min: 0, step: 1, id: `oc-c-${i.id}`, value: i.cantidad, class: 'num-input', oninput: e => { edits.get(i.id).cantidad = +e.target.value || 0; repintar(); } })),
        h('td', { class: 'num' }, h('input', { type: 'number', min: 0, step: 0.01, id: `oc-p-${i.id}`, value: i.precio_unit, class: 'num-input', oninput: e => { edits.get(i.id).precio_unit = +e.target.value || 0; repintar(); } }))))))) : null;

    const distrib = groupBy(oc.distribucion, d => d.sucursal);
    const reparto = h('details', { class: 'reparto' }, h('summary', {}, `Reparto por sucursal (${Object.keys(distrib).length})`),
      h('div', { class: 'reparto-grid' }, Object.entries(distrib).map(([s, ds]) => h('div', {}, h('strong', {}, s), ds[0].direccion ? h('small', { class: 'muted', style: 'display:block' }, ds[0].direccion) : null,
        h('ul', {}, ds.map(d => h('li', {}, h('span', {}, d.producto), h('span', { class: 'mono' }, n(d.cantidad)))))))));

    repintar();
    const guardar = async () => { await api.guardarOC(id, { fecha_entrega: entrega.value || null, forma_pago: pago.value, observaciones: obsI.value || null }, [...edits.values()]); };
    const acciones = [];
    acciones.push({ label: 'Descargar PDF', onClick: () => { try { ocPDF(vista()).save(`${ocNum(id)}.pdf`); } catch { toast('No se pudo descargar en esta vista previa', 'warn'); } return false; } });
    if (borrador) {
      acciones.push({ label: 'Anular', kind: 'ghost-bad', onClick: async () => {
        if (!await confirmar('Anular orden', `${ocNum(id)} se anula y sus ítems vuelven a "listo para ordenar".`, 'Anular', 'danger')) return false;
        await api.anularOC(id); toast(`${ocNum(id)} anulada`); refresh();
      } });
      acciones.push({ label: 'Guardar borrador', onClick: async () => { try { await guardar(); toast('Borrador guardado'); refresh(); } catch (e) { toast(e.message, 'bad'); return false; } } });
      acciones.push({ label: 'Enviar al proveedor', kind: 'primary', onClick: async () => {
        const mail = oc.proveedorObj?.email;
        if (!mail) { toast(`Cargá el mail de ${oc.proveedor} en Catálogo para poder enviar`, 'bad'); return false; }
        if (vista().items.some(i => !i.precio_unit)) { toast('Hay ítems sin precio. Completalos antes de enviar.', 'bad'); return false; }
        if (!await confirmar('Enviar orden de compra', `Se envía ${ocNum(id)} en PDF a ${mail} y los precios quedan registrados en el historial.`, 'Enviar')) return false;
        try {
          await guardar();
          const r = await api.enviarOC(id, pdfBase64(vista()));
          toast(r?.simulado ? `Modo demo: ${ocNum(id)} marcada como enviada (no se mandó mail)` : `${ocNum(id)} enviada a ${mail}`);
          refresh();
        } catch (e) { toast(e.message, 'bad'); return false; }
      } });
    }
    if (['enviada', 'recibida_parcial'].includes(oc.estado) && ['compras', 'admin', 'auditor'].includes(me.rol))
      acciones.push({ label: 'Registrar recepción', kind: 'primary', onClick: () => { recepcion(oc); } });

    modal({ title: `${ocNum(id)} · ${oc.proveedor}`, wide: true, actions: acciones,
      body: h('div', { class: 'stack' },
        h('div', { class: 'oc-status' }, pill(oc.estado), oc.enviada_at ? h('span', { class: 'muted' }, `Enviada a ${oc.enviada_a} el ${fecha(oc.enviada_at)}`) : null),
        borrador ? h('div', { class: 'grid3' }, field('Fecha de entrega', entrega), field('Forma de pago', pago), field('Observaciones', obsI)) : null,
        precios, reparto, h('p', { class: 'eyebrow' }, 'Vista del documento'), preview) });
  }

  function recepcion(oc) {
    const vals = new Map(oc.items.map(i => [i.id, i.cantidad_recibida ?? i.cantidad]));
    modal({ title: `Recepción ${ocNum(oc.id)}`, actions: [
      { label: 'Cancelar' },
      { label: 'Confirmar recepción', kind: 'primary', onClick: async () => {
        try {
          const e = await api.recibirOC(oc.id, [...vals].map(([id, c]) => ({ id, cantidad_recibida: c })));
          toast(e === 'recibida' ? `${ocNum(oc.id)} recibida completa` : `${ocNum(oc.id)} recibida con faltantes`); refresh();
        } catch (err) { toast(err.message, 'bad'); return false; }
      } }],
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Indicá lo que llegó. Lo recibido se reparte a cada sucursal en proporción a lo aprobado.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Pedido'), h('th', { class: 'num' }, 'Recibido'))),
          h('tbody', {}, oc.items.map(i => h('tr', {}, h('td', {}, i.producto), h('td', { class: 'num' }, n(i.cantidad)),
            h('td', { class: 'num' }, h('input', { type: 'number', min: 0, id: `rec-${i.id}`, class: 'num-input', value: vals.get(i.id), oninput: e => vals.set(i.id, +e.target.value || 0) })))))))) });
  }

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Compras'), h('h1', {}, 'Órdenes de compra'),
      h('p', { class: 'muted' }, 'Se arma una orden por proveedor y por razón social (SSG / FG), con lo aprobado de todas las sucursales.'))),
    listo,
    h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Órdenes'), tabBar), tabla));
}
