// Compras: consolida lo aprobado en órdenes por proveedor y razón social,
// permite ajustar precios, enviar la OC por mail y registrar la recepción.
import { h, money, n, pill, empty, toast, fecha, docNum, sum, groupBy, modal, confirmar, tabs, field, linkCompra } from '../ui.js?v=20261107-1435';
import { ocHTML, ocPDF, pdfBase64, logoListo, pdfListo } from '../oc-doc.js?v=20261107-1435';
import { abrirRecepcion, estadoRecepcion, difsTexto } from './recepcion.js?v=20261107-1435';

export async function render({ api, me, cat, refresh }) {
  const puede = ['compras', 'admin'].includes(me.rol);
  if (puede) pdfListo().catch(() => {});   // se va bajando mientras se mira la lista
  const [pend, ordenes] = await Promise.all([api.pendientesOC(), api.ordenes()]);
  let filtro = 'abiertas';

  // ---- listo para ordenar ----
  // externos: por proveedor + razón social · interno (Droguería): una sola orden de preparación
  const grupos = Object.entries(groupBy(pend, i => `${i.proveedor || 'Sin proveedor asignado'}|${i.interno ? 'Preparación interna' : i.empresa}`));
  const sinProv = pend.filter(i => !i.proveedor_id);
  const listo = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Aprobado, listo para ordenar'),
      puede && pend.length ? h('button', { class: 'btn primary', onclick: async () => {
        try { const k = await api.generarOrdenes(); toast(`${k} orden${k === 1 ? '' : 'es'} generada${k === 1 ? '' : 's'} en borrador`); refresh(); }
        catch (e) { toast(e.message, 'bad'); }
      } }, 'Generar órdenes') : null),
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
        h('td', { class: 'mono' }, docNum(o)), h('td', {}, o.proveedor), h('td', {}, o.interno ? h('span', { class: 'muted' }, 'Interna') : o.empresa), h('td', { class: 'hide-sm' }, o.periodo || '—'),
        h('td', { class: 'num' }, money(o.total)), h('td', {}, pill(o.estado))))))) : empty('No hay órdenes en esta vista'));
  }
  pintar();

  // ---- detalle de OC ----
  async function abrir(id) {
    const oc = await api.orden(id);
    const num = docNum(oc), op = oc.interno;
    const borrador = oc.estado === 'borrador' && puede;
    const edits = new Map(oc.items.map(i => [i.id, { id: i.id, cantidad: i.cantidad, precio_unit: i.precio_unit }]));
    const preview = h('div');
    const vista = () => {
      const items = oc.items.map(i => ({ ...i, ...edits.get(i.id) }));
      return { ...oc, items, total: sum(items, i => i.cantidad * i.precio_unit), fecha_entrega: entrega.value || null, forma_pago: pago.value, observaciones: obsI.value || null };
    };
    const repintar = () => preview.replaceChildren(ocHTML(vista()));
    const sinPrecio = () => vista().items.filter(i => !(+i.precio_unit > 0)).length;
    const entrega = h('input', { type: 'date', id: 'oc-entrega', value: oc.fecha_entrega || '', disabled: !borrador, onchange: repintar });
    const pago = h('input', { type: 'text', id: 'oc-pago', value: oc.forma_pago || '', disabled: !borrador, oninput: repintar });
    const obsI = h('input', { type: 'text', id: 'oc-obs', value: oc.observaciones || '', disabled: !borrador, placeholder: 'Ej.: entregar en Droguería, horario 8 a 14', oninput: repintar });

    const precios = borrador ? h('div', { class: 'stack' }, h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Insumo'), h('th', { class: 'num' }, 'Cantidad'), h('th', { class: 'num' }, 'Precio de lista'))),
      h('tbody', {}, oc.items.map(i => h('tr', {}, h('td', {}, i.producto),
        h('td', { class: 'num' }, h('input', { type: 'number', min: 0, step: 1, id: `oc-c-${i.id}`, value: i.cantidad, class: 'num-input', oninput: e => { edits.get(i.id).cantidad = +e.target.value || 0; repintar(); } })),
        // el precio sale solo de la lista o presupuesto del proveedor (Catálogo); en la orden no se edita
        h('td', { class: 'num' }, +i.precio_unit > 0 ? money(i.precio_unit) : h('span', { class: 'muted' }, 'A confirmar'))))))),
      h('p', { class: 'hint' }, 'Los precios salen de la última lista o presupuesto cargado del proveedor. Sin lista, el ítem va "a confirmar".')) : null;

    // insumos con link de compra (Mercado Libre, etc.): a mano para quien hace la compra
    const conLink = oc.items.filter(i => i.link_compra);
    // dirección a la que se manda la compra online: la decide RRHH (una sucursal, la Droguería u otra)
    const dirs = [...new Set((cat?.sucursales || []).filter(s => s.direccion).map(s => `${s.nombre} · ${s.direccion}`))];
    const envio = h('input', { type: 'text', id: 'oc-envio', list: 'oc-envio-dirs', value: oc.direccion_envio || '', disabled: !borrador,
      placeholder: 'Elegí o escribí la dirección', autocomplete: 'off' });
    const links = conLink.length ? h('section', { class: 'links-compra' },
      h('p', { class: 'eyebrow' }, 'Comprar online'),
      h('ul', {}, conLink.map(i => h('li', {}, h('span', {}, h('strong', {}, n(i.cantidad)), ` × ${i.producto}`), linkCompra(i.link_compra)))),
      field('Enviar a', envio, 'Dirección de entrega que pide RRHH para esta compra. Cargala también en la plataforma al comprar.'),
      h('datalist', { id: 'oc-envio-dirs' }, dirs.map(d => h('option', { value: d })))) : null;
    const distrib = groupBy(oc.distribucion, d => d.sucursal);
    const reparto = h('details', { class: 'reparto' }, h('summary', {}, `Reparto por sucursal (${Object.keys(distrib).length})`),
      h('div', { class: 'reparto-grid' }, Object.entries(distrib).map(([s, ds]) => h('div', {}, h('strong', {}, s), ds[0].direccion ? h('small', { class: 'muted', style: 'display:block' }, ds[0].direccion) : null,
        h('ul', {}, ds.map(d => h('li', {}, h('span', {}, d.producto), h('span', { class: 'mono' }, n(d.cantidad)))))))));

    repintar();
    const guardar = async () => { await api.guardarOC(id, { fecha_entrega: entrega.value || null, forma_pago: pago.value, observaciones: obsI.value || null, ...(conLink.length ? { direccion_envio: envio.value.trim() || null } : {}) }, [...edits.values()]); };
    const acciones = [];
    acciones.push({ label: 'Descargar PDF', onClick: async () => { await logoListo; try { await pdfListo(); ocPDF(vista()).save(`${num}.pdf`); } catch { toast('No se pudo descargar en esta vista previa', 'warn'); } return false; } });
    if (borrador) {
      acciones.push({ label: 'Anular', kind: 'ghost-bad', onClick: async () => {
        if (!await confirmar('Anular orden', `${num} se anula y sus ítems vuelven a "listo para ordenar".`, 'Anular', 'danger')) return false;
        await api.anularOC(id); toast(`${num} anulada`); refresh();
      } });
      acciones.push({ label: 'Registrar compra sin mail', onClick: async () => {
        if (conLink.length && !envio.value.trim()) { envio.focus(); toast('Indicá a qué dirección se envía la compra', 'bad'); return false; }
        const ml = oc.items.some(i => /mercadoli(b|v)re/i.test(i.link_compra || ''));
        const medio = h('input', { id: 'oc-medio', type: 'text', value: ml ? 'Mercado Libre' : '', placeholder: 'Ej.: Mercado Libre, WhatsApp, teléfono' });
        let ok = false;
        await new Promise(res => modal({ title: `Registrar ${num} como comprada`, body: h('div', { class: 'stack' },
          h('p', { class: 'muted' }, 'Para compras hechas por otro medio. No se manda mail; la orden queda como enviada y las sucursales van a poder confirmar la recepción.'),
          field('¿Dónde se compró?', medio),
          conLink.length ? h('p', { class: 'muted' }, 'Enviada a: ', h('strong', {}, envio.value.trim())) : null),
          actions: [{ label: 'Cancelar', onClick: () => res() }, { label: 'Registrar', kind: 'primary', onClick: () => { ok = true; res(); } }] }));
        if (!ok) return false;
        try { await guardar(); await api.registrarCompraSinMail(id, `Comprada por ${medio.value.trim() || 'otro medio'}${conLink.length && envio.value.trim() ? ` · envío a ${envio.value.trim()}` : ''}`); toast(`${num} registrada como comprada`); refresh(); }
        catch (e) { toast(e.message, 'bad'); return false; }
      } });
      acciones.push({ label: 'Guardar borrador', onClick: async () => { try { await guardar(); toast('Borrador guardado'); refresh(); } catch (e) { toast(e.message, 'bad'); return false; } } });
      acciones.push({ label: op ? 'Enviar a Droguería' : 'Enviar al proveedor', kind: 'primary', onClick: async () => {
        const mail = oc.proveedorObj?.email;
        if (!mail) { toast(`Cargá el mail de ${oc.proveedor} en Catálogo para poder enviar`, 'bad'); return false; }
        if (!await confirmar(op ? 'Enviar orden de preparación' : 'Enviar orden de compra',
          (op ? `Se envía ${num} en PDF a ${mail} con lo que hay que preparar para cada sucursal.` : `Se envía ${num} en PDF a ${mail} y los precios quedan registrados en el historial.`) + (sinPrecio() ? ` ${sinPrecio()} ítem${sinPrecio() > 1 ? 's' : ''} sin precio van como "a confirmar".` : ''), 'Enviar')) return false;
        try {
          await guardar();
          await logoListo; await pdfListo();
          const r = await api.enviarOC(id, pdfBase64(vista()));
          toast(r?.simulado ? `Modo demo: ${num} marcada como enviada (no se mandó mail)` : `${num} enviada a ${mail}`);
          refresh();
        } catch (e) { toast(e.message, 'bad'); return false; }
      } });
    }
    // recepción: cada sucursal confirma lo suyo; acá se ve el avance y se puede registrar en su nombre
    let recepBox = null;
    if (['enviada', 'recibida_parcial', 'recibida'].includes(oc.estado)) {
      const recs = await api.recepciones(id);
      const hechas = recs.filter(r => !r.pendiente).length;
      recepBox = h('section', { class: 'stack recepcion-oc' },
        h('div', { class: 'block-head' }, h('h3', {}, `Recepción por sucursal · ${hechas} de ${recs.length} confirmaron`),
          h('small', { class: 'muted' }, 'Cada sucursal controla el remito o la factura contra lo que llegó.')),
        h('ul', { class: 'rec-list' }, recs.map(r => h('li', { class: `rec-item${r.pendiente ? ' pendiente' : ''}` },
          h('div', {}, h('strong', {}, r.sucursal), ' ', estadoRecepcion(r),
            r.recepcion ? h('small', { class: 'muted', style: 'display:block' }, `${fecha(r.recepcion.recibido_at)}${r.recepcion.por ? ` · ${r.recepcion.por}` : ''}`) : null,
            difsTexto(r).length ? h('small', { class: 'motivo' }, difsTexto(r).join(' · ')) : null,
            r.recepcion?.observaciones ? h('small', { class: 'muted', style: 'display:block' }, `“${r.recepcion.observaciones}”`) : null),
          ['compras', 'admin', 'auditor'].includes(me.rol)
            ? h('button', { class: 'link', onclick: () => abrirRecepcion({ api, r, onDone: refresh }) }, r.pendiente ? 'Registrar por la sucursal' : 'Corregir') : null))));
    }

    modal({ title: `${num} · ${oc.proveedor}`, wide: true, actions: acciones,
      body: h('div', { class: 'stack' },
        h('div', { class: 'oc-status' }, pill(oc.estado), oc.enviada_at ? h('span', { class: 'muted' }, String(oc.enviada_a || '').includes('@') ? `Enviada a ${oc.enviada_a} el ${fecha(oc.enviada_at)}` : `${oc.enviada_a || 'Registrada'} el ${fecha(oc.enviada_at)}`) : null),
        op ? h('p', { class: 'notice' }, 'Orden de preparación interna: va a la Droguería para armar el pedido de cada sucursal. No lleva razón social ni se factura.') : null,
        borrador ? h('div', { class: 'grid3' }, field('Fecha de entrega', entrega), op ? null : field('Forma de pago', pago), field('Observaciones', obsI)) : null,
        recepBox, links, precios, reparto, h('p', { class: 'eyebrow' }, 'Vista del documento'), preview) });
  }

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Compras'), h('h1', {}, 'Órdenes de compra'),
      h('p', { class: 'muted' }, 'Se arma una orden por proveedor y por razón social (SSG / FG), con lo aprobado de todas las sucursales. Lo que provee la Droguería va en una orden de preparación interna por mes.'))),
    listo,
    h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Órdenes'), tabBar), tabla));
}
