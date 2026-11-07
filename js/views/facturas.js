// Facturas recibidas en comprobantes@ (o cargadas a mano). Registro + auditoría manual contra la OC.
import { h, money, n, empty, toast, modal, field, tabs, fecha, fechaHora, ocNum, sum } from '../ui.js?v=20261107-1537';

const ESTADOS = {
  recibida:   ['Sin auditar', 'warn'],
  ok:         ['OK', 'ok'],
  observada:  ['Observada', 'warn'],
  rechazada:  ['Rechazada', 'bad'],
  descartada: ['Descartada', 'muted'],
};
const pillF = e => { const [t, c] = ESTADOS[e] || [e, 'muted']; return h('span', { class: `pill pill-${c}` }, t); };
const FILTROS = [['pendientes', 'Sin auditar', ['recibida']], ['observadas', 'Observadas', ['observada', 'rechazada']], ['ok', 'OK', ['ok']], ['todas', 'Todas', null]];

export async function render({ api, me, cat, refresh }) {
  const puede = ['compras', 'auditor', 'admin'].includes(me.rol);
  const [facturas, ordenes] = await Promise.all([api.facturas(), api.ordenes()]);
  const provs = cat.proveedores.filter(p => !p.interno);
  const empresas = cat.empresas;
  let filtro = 'pendientes', provFiltro = '';
  const cont = h('div'), bar = h('div');

  function pintar() {
    bar.replaceChildren(tabs(FILTROS.map(([id, l, est]) => [id, l, est ? facturas.filter(f => est.includes(f.estado)).length : facturas.length]), filtro, f => { filtro = f; pintar(); }));
    const est = FILTROS.find(f => f[0] === filtro)[2];
    const rows = facturas.filter(f => !est || est.includes(f.estado)).filter(f => !provFiltro || String(f.proveedor_id) === provFiltro);
    cont.replaceChildren(rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Recibida'), h('th', {}, 'Proveedor'), h('th', { class: 'hide-sm' }, 'Archivo'),
        h('th', {}, 'Comprobante'), h('th', { class: 'num' }, 'Total'), h('th', { class: 'hide-sm' }, 'OC'), h('th', {}, 'Estado'))),
      h('tbody', {}, rows.map(f => h('tr', { tabindex: 0, onclick: () => abrir(f), onkeydown: e => e.key === 'Enter' && abrir(f) },
        h('td', {}, fechaHora(f.recibida_at), h('small', { class: 'muted', style: 'display:block' }, f.origen === 'manual' ? 'Carga manual' : 'Por mail')),
        h('td', {}, f.proveedor || h('span', { class: 'flag' }, 'Sin identificar'), f.proveedor ? null : h('small', { class: 'muted', style: 'display:block' }, f.remitente || '')),
        h('td', { class: 'hide-sm' }, h('span', { class: 'archivo' }, f.archivo_nombre)),
        h('td', { class: 'mono' }, f.numero ? `${f.tipo || ''} ${f.numero}`.trim() : '—'),
        h('td', { class: 'num' }, f.total ? money(f.total) : '—'),
        h('td', { class: 'hide-sm mono' }, f.oc_id ? ocNum(f.oc_id) : '—'),
        h('td', {}, pillF(f.estado))))))) : empty(filtro === 'pendientes' ? 'No hay facturas sin auditar' : 'No hay facturas en esta vista',
        'Las facturas que lleguen a comprobantes@grupograssi.com aparecen acá solas.'));
  }

  async function abrir(f) {
    const vals = { proveedor_id: f.proveedor_id, empresa: f.empresa, oc_id: f.oc_id, tipo: f.tipo || 'A', numero: f.numero || '', fecha: f.fecha || '',
      neto: f.neto ?? '', total: f.total ?? '', estado: f.estado === 'recibida' ? 'ok' : f.estado, observaciones: f.observaciones || '' };
    const visor = h('div', { class: 'visor' }, h('p', { class: 'muted' }, 'Cargando archivo…'));
    const control = h('div', { class: 'control-oc' });
    let url = null;
    api.facturaUrl(f).then(u => {
      url = u;
      if (!u) { visor.replaceChildren(empty('Archivo no disponible', 'En el modo demo no hay archivos reales.')); return; }
      const tipo = f.archivo_tipo || '';
      visor.replaceChildren(tipo.includes('pdf') ? h('iframe', { src: u, title: f.archivo_nombre })
        : tipo.includes('tiff') ? empty('Vista previa no disponible', 'Los archivos TIF no se ven en el navegador. Abrilo en otra pestaña para descargarlo.')
        : h('img', { src: u, alt: f.archivo_nombre }));
    }).catch(e => visor.replaceChildren(empty('No se pudo abrir el archivo', e.message)));

    const ocSel = h('select', { id: 'fc-oc', onchange: e => { vals.oc_id = e.target.value ? +e.target.value : null; pintarControl(); } });
    const pintarOcs = () => {
      const ocs = ordenes.filter(o => !o.interno && o.estado !== 'anulada' && (!vals.proveedor_id || o.proveedor_id === +vals.proveedor_id));
      ocSel.replaceChildren(h('option', { value: '' }, 'Sin vincular'), ocs.map(o =>
        h('option', { value: o.id, selected: o.id === vals.oc_id }, `${ocNum(o.id)} · ${o.empresa} · ${o.periodo || ''} · ${money(o.total)}`)));
    };
    function pintarControl() {
      const oc = ordenes.find(o => o.id === vals.oc_id);
      const avisos = [];
      if (oc && vals.empresa && oc.empresa !== vals.empresa) {
        const e = empresas.find(x => x.codigo === oc.empresa);
        avisos.push(['bad', `Razón social incorrecta: la OC es para ${e?.razon_social || oc.empresa}${e?.cuit ? ` (CUIT ${e.cuit})` : ''}.`]);
      }
      if (oc && vals.neto !== '' && Number(vals.neto) > 0) {
        const dif = Number(vals.neto) - oc.total;
        const pct = oc.total ? dif / oc.total * 100 : 0;
        avisos.push([Math.abs(pct) <= 1 ? 'ok' : 'warn', `Neto facturado ${money(vals.neto)} contra OC ${money(oc.total)} (sin IVA): ${dif === 0 ? 'coincide' : `${dif > 0 ? '+' : ''}${money(dif)} (${pct.toFixed(1)}%)`}.`]);
      }
      if (oc && !(vals.neto > 0)) avisos.push(['muted', `Total de la OC sin IVA: ${money(oc.total)}. Cargá el neto de la factura para comparar.`]);
      if (oc) {
        if (oc.total_recibido === null) avisos.push(['warn', 'Ninguna sucursal confirmó todavía la recepción de esta orden.']);
        else {
          const completa = ['recibida', 'recibida_parcial'].includes(oc.estado);
          const igual = Math.abs(oc.total_recibido - oc.total) < 1;
          avisos.push([completa && igual ? 'ok' : 'warn', `Recibido según las sucursales: ${money(oc.total_recibido)} de ${money(oc.total)}${completa ? '' : ' (faltan sucursales por confirmar)'}${completa && !igual ? '. Hubo diferencias: revisá que no se facture lo que no llegó.' : '.'}`]);
          if (vals.neto !== '' && Number(vals.neto) > oc.total_recibido + 1) avisos.push(['bad', `El neto facturado (${money(vals.neto)}) supera lo recibido (${money(oc.total_recibido)}).`]);
        }
      }
      control.replaceChildren(...avisos.map(([t, txt]) => h('p', { class: `aviso aviso-${t}` }, txt)));
    }

    const inp = (k, attrs = {}) => h('input', { id: `fc-${k}`, value: vals[k], ...attrs, oninput: e => { vals[k] = e.target.value; pintarControl(); } });
    const sel = (k, opts, empty) => h('select', { id: `fc-${k}`, onchange: e => { vals[k] = e.target.value || null; if (k === 'proveedor_id') pintarOcs(); pintarControl(); } },
      empty ? h('option', { value: '' }, empty) : null, opts.map(([v, l]) => h('option', { value: v, selected: String(vals[k] ?? '') === String(v) }, l)));
    pintarOcs(); pintarControl();

    const form = h('div', { class: 'stack' },
      h('div', { class: 'meta-mail' }, h('strong', {}, f.asunto || f.archivo_nombre),
        h('small', { class: 'muted' }, `${f.origen === 'manual' ? 'Cargada a mano' : `De ${f.remitente || '—'}`} · ${fechaHora(f.recibida_at)}`)),
      h('div', { class: 'grid2' },
        field('Proveedor', sel('proveedor_id', provs.map(p => [p.id, p.nombre]), 'Sin identificar')),
        field('Facturada a', sel('empresa', empresas.map(e => [e.codigo, e.razon_social]), 'Elegir razón social')),
        field('Tipo', sel('tipo', [['A', 'Factura A'], ['B', 'Factura B'], ['C', 'Factura C'], ['NC', 'Nota de crédito'], ['ND', 'Nota de débito']])),
        field('Número', inp('numero', { placeholder: '0005-00004030' })),
        field('Fecha', inp('fecha', { type: 'date' })),
        field('Orden de compra', ocSel),
        field('Neto gravado', inp('neto', { type: 'number', step: '0.01', placeholder: 'Sin IVA' })),
        field('Total', inp('total', { type: 'number', step: '0.01', placeholder: 'Con IVA' }))),
      control,
      field('Resultado de la auditoría', sel('estado', [['ok', 'OK'], ['observada', 'Observada (falta algo o hay diferencias)'], ['rechazada', 'Rechazada (refacturar)'], ['descartada', 'Descartada (no es una factura)'], ['recibida', 'Sin auditar']])),
      field('Observaciones', h('textarea', { id: 'fc-obs', rows: 3, placeholder: 'Ej.: facturó 13 toallas, se recibieron 10', oninput: e => { vals.observaciones = e.target.value; } }, vals.observaciones)));

    modal({ title: f.numero ? `Factura ${f.tipo || ''} ${f.numero}` : f.archivo_nombre, wide: true,
      body: h('div', { class: 'factura-layout' }, visor, form),
      actions: [
        { label: 'Abrir archivo', onClick: () => { if (url) window.open(url, '_blank', 'noopener'); else toast('El archivo no está disponible', 'warn'); return false; } },
        puede ? { label: 'Guardar', kind: 'primary', onClick: async () => {
          try {
            await api.guardarFactura(f.id, { ...vals, proveedor_id: vals.proveedor_id ? +vals.proveedor_id : null,
              neto: vals.neto === '' ? null : Number(vals.neto), total: vals.total === '' ? null : Number(vals.total), fecha: vals.fecha || null,
              numero: vals.numero.trim() || null, observaciones: vals.observaciones.trim() || null });
            toast('Factura guardada'); refresh();
          } catch (e) { toast(e.message, 'bad'); return false; }
        } } : null,
      ].filter(Boolean) });
  }

  function cargar() {
    const file = h('input', { type: 'file', id: 'fc-file', accept: 'application/pdf,image/*' });
    const prov = h('select', { id: 'fc-prov' }, h('option', { value: '' }, 'Sin identificar'), provs.map(p => h('option', { value: p.id }, p.nombre)));
    modal({ title: 'Cargar factura', body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Para facturas que llegaron por otro medio (WhatsApp, papel escaneado). Acepta PDF o foto.'),
      field('Archivo', file), field('Proveedor', prov)),
      actions: [{ label: 'Cancelar' }, { label: 'Subir', kind: 'primary', onClick: async () => {
        const fl = file.files?.[0];
        if (!fl) { toast('Elegí el archivo', 'warn'); return false; }
        if (fl.size > 15 * 1024 * 1024) { toast('El archivo supera los 15 MB', 'bad'); return false; }
        try { await api.subirFactura(fl, prov.value ? +prov.value : null); toast('Factura cargada'); refresh(); }
        catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }

  const provSel = h('select', { id: 'fc-fprov', style: 'width:auto;min-width:200px', 'aria-label': 'Filtrar por proveedor', onchange: e => { provFiltro = e.target.value; pintar(); } },
    h('option', { value: '' }, 'Todos los proveedores'), provs.map(p => h('option', { value: p.id }, p.nombre)));
  pintar();

  const pend = facturas.filter(f => f.estado === 'recibida');
  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'comprobantes@grupograssi.com'), h('h1', {}, 'Facturas de proveedores'),
        h('p', { class: 'muted' }, pend.length ? `${pend.length} sin auditar${sum(pend, f => f.total || 0) ? ` · ${money(sum(pend, f => f.total || 0))}` : ''}` : 'Abrí cada factura, vinculala a su orden de compra y registrá el resultado.')),
      puede ? h('button', { class: 'btn', onclick: cargar }, 'Cargar factura') : null),
    h('div', { class: 'toolbar' }, bar, provSel), cont);
}
