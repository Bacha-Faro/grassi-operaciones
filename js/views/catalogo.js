// Catálogo: insumos, proveedores y sucursales. Cambiar un precio lo registra en el historial.
import { h, money, empty, toast, modal, field, tabs, verFoto, linkCompra } from '../ui.js?v=20261102-1650';

export async function render({ api, me, cat, refresh }) {
  const puede = ['compras', 'admin'].includes(me.rol);
  let tab = 'productos', q = '';
  const cont = h('div');
  const bar = h('div');
  const prov = id => cat.proveedores.find(p => p.id === +id)?.nombre;
  const catN = id => cat.categorias.find(c => c.id === +id)?.nombre;

  function form(fields, data, onSave, title) {
    const vals = { ...data };
    const ctl = f => {
      const id = `fm-${f.k}`;
      if (f.opts) return h('select', { id, onchange: e => { vals[f.k] = e.target.value === '' ? null : (f.str ? e.target.value : +e.target.value); } },
        f.empty ? h('option', { value: '' }, f.empty) : null, f.opts.map(o => h('option', { value: o.id, selected: String(vals[f.k]) === String(o.id) }, o.nombre)));
      if (f.list) return h('input', { id, type: 'text', value: (vals[f.k] || []).join(', '), oninput: e => { vals[f.k] = e.target.value.split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean); } });
      if (f.type === 'check') return h('input', { id, type: 'checkbox', checked: vals[f.k] !== false, onchange: e => { vals[f.k] = e.target.checked; } });
      return h('input', { id, type: f.type || 'text', value: vals[f.k] ?? '', step: f.type === 'number' ? 'any' : null, required: f.req,
        oninput: e => { vals[f.k] = f.type === 'number' ? (e.target.value === '' ? null : +e.target.value) : e.target.value; } });
    };
    modal({ title, body: h('div', { class: 'grid2' }, fields.map(f => field(f.label, ctl(f), f.hint))), actions: [
      { label: 'Cancelar' },
      { label: 'Guardar', kind: 'primary', onClick: async () => {
        const falta = fields.find(f => f.req && !vals[f.k]);
        if (falta) { toast(`Completá ${falta.label.toLowerCase()}`, 'bad'); return false; }
        try { await onSave(vals); toast('Guardado'); refresh(); } catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }

  // ---- foto del insumo: sacar con el celular o elegir un archivo ----
  function foto(p) {
    let cambio = false;
    const prev = h('div', { class: 'foto-prev' }, p.foto_url ? h('img', { src: p.foto_url, alt: p.nombre }) : h('span', { class: 'muted' }, 'Sin foto'));
    const subir = async f => {
      if (!f) return;
      prev.replaceChildren(h('span', { class: 'muted' }, 'Subiendo…'));
      try { const url = await api.guardarFotoProducto(p.id, f); p.foto_url = url; prev.replaceChildren(h('img', { src: url, alt: p.nombre })); toast('Foto guardada'); cambio = true; }
      catch (err) { toast(err.message, 'bad'); prev.replaceChildren(p.foto_url ? h('img', { src: p.foto_url, alt: p.nombre }) : h('span', { class: 'muted' }, 'Sin foto')); }
    };
    const inp = h('input', { type: 'file', id: 'foto-file', accept: 'image/*', hidden: true, onchange: e => subir(e.target.files?.[0]) });
    const cam = h('input', { type: 'file', id: 'foto-cam', accept: 'image/*', capture: 'environment', hidden: true, onchange: e => subir(e.target.files?.[0]) });
    modal({ title: `Foto · ${p.nombre}`, body: h('div', { class: 'stack' }, prev,
      h('p', { class: 'muted' }, 'Una foto clara del producto, de frente y con fondo liso. La app la achica sola.'),
      h('div', { class: 'foto-acciones' }, inp, cam,
        h('button', { class: 'btn primary', onclick: () => cam.click() }, 'Sacar foto'),
        h('button', { class: 'btn', onclick: () => inp.click() }, 'Elegir archivo'),
        p.foto_url ? h('button', { class: 'btn ghost-bad', onclick: async () => {
          try { await api.quitarFotoProducto(p.id); p.foto_url = null; prev.replaceChildren(h('span', { class: 'muted' }, 'Sin foto')); toast('Foto quitada'); cambio = true; } catch (err) { toast(err.message, 'bad'); }
        } }, 'Quitar foto') : null)),
      actions: [{ label: 'Listo', kind: 'primary', onClick: () => { if (cambio) refresh(); } }] });
  }
  const miniatura = p => h('button', { class: `thumb${p.foto_url ? '' : ' vacia'}`, title: p.foto_url ? 'Cambiar foto' : 'Agregar foto', 'aria-label': `Foto de ${p.nombre}`,
    onclick: e => { e.stopPropagation(); puede ? foto(p) : p.foto_url && verFoto(p); } },
    p.foto_url ? h('img', { src: p.foto_url, alt: '', loading: 'lazy' }) : h('span', { 'aria-hidden': 'true' }, '+'));

  const F_PROD = [
    { k: 'nombre', label: 'Nombre', req: true }, { k: 'categoria_id', label: 'Categoría', opts: cat.categorias, req: true },
    { k: 'unidad', label: 'Unidad', hint: 'Ej.: caja, bidón, resma' }, { k: 'proveedor_id', label: 'Proveedor habitual', opts: cat.proveedores, empty: 'Sin asignar' },
    { k: 'precio_ref', label: 'Precio de referencia (sin IVA)', type: 'number', hint: 'Si cambia, queda en el historial de precios' },
    { k: 'tope_mensual', label: 'Tope por sucursal y mes', type: 'number', hint: 'Opcional. Genera alerta en auditoría' },
    { k: 'link_compra', label: 'Link de compra', type: 'url', hint: 'Opcional. Ej.: la publicación de Mercado Libre del vendedor habitual. Solo lo ve el equipo de compras' },
    { k: 'activo', label: 'Visible para pedir', type: 'check' }];
  const F_PROV = [
    { k: 'nombre', label: 'Razón social / nombre', req: true }, { k: 'cuit', label: 'CUIT' }, { k: 'email', label: 'Mail para órdenes de compra', type: 'email' },
    { k: 'emails_factura', label: 'Mails desde los que factura', list: true, hint: 'Separados por coma. Sirve para reconocer sus facturas en comprobantes@' },
    { k: 'telefono', label: 'Teléfono' }, { k: 'direccion', label: 'Dirección' }, { k: 'contacto', label: 'Contacto' },
    { k: 'condicion_pago', label: 'Condición de pago', hint: 'Ej.: Contado, 30 días' }, { k: 'activo', label: 'Activo', type: 'check' }];
  const EMP = cat.empresas.map(e => ({ id: e.codigo, nombre: e.razon_social }));
  const F_SUC = [
    { k: 'nombre', label: 'Nombre', req: true }, { k: 'empresa', label: 'Factura a', opts: EMP, str: true, req: true },
    { k: 'direccion', label: 'Dirección de entrega', hint: 'Donde el proveedor deja la mercadería' },
    { k: 'email', label: 'Mail de la sucursal / sector', type: 'email', hint: 'Con este mail ingresa a pedir y recibe los avisos' },
    { k: 'activo', label: 'Activa', type: 'check' }];

  function pintar() {
    bar.replaceChildren(tabs([['productos', 'Insumos', cat.productos.length], ['proveedores', 'Proveedores', cat.proveedores.length], ['sucursales', 'Sucursales', cat.sucursales.length]], tab, t => { tab = t; q = ''; pintar(); }));
    const like = s => !q || String(s).toLowerCase().includes(q);
    let head, rows, nuevo;
    if (tab === 'productos') {
      head = ['Insumo', 'Categoría', 'Proveedor', 'Precio ref.', ''];
      rows = cat.productos.filter(p => like(p.nombre)).map(p => [h('span', { class: `prod-cell${p.activo === false ? ' muted' : ''}` }, miniatura(p), h('span', {}, p.nombre, h('small', { class: 'muted' }, ` · ${p.unidad || ''}`), p.link_compra ? h('small', { style: 'display:block' }, linkCompra(p.link_compra, true)) : null)), catN(p.categoria_id), prov(p.proveedor_id) || h('span', { class: 'flag' }, 'Sin proveedor'), h('span', { class: 'mono' }, p.precio_ref ? money(p.precio_ref) : '—'), p]);
      nuevo = () => form(F_PROD, { activo: true, categoria_id: cat.categorias[0].id }, v => api.guardarProducto(v), 'Nuevo insumo');
    } else if (tab === 'proveedores') {
      head = ['Proveedor', 'Mail', 'Condición', 'Insumos', ''];
      rows = cat.proveedores.filter(p => like(p.nombre)).map(p => [p.nombre, p.email || h('span', { class: 'flag' }, 'Falta mail'), p.condicion_pago || '—', cat.productos.filter(x => x.proveedor_id === p.id).length, p]);
      nuevo = () => form(F_PROV, { activo: true, condicion_pago: 'Contado' }, v => api.guardarProveedor(v), 'Nuevo proveedor');
    } else {
      const rs = Object.fromEntries(cat.empresas.map(e => [e.codigo, e.razon_social]));
      head = ['Sucursal / área', 'Factura a', 'Entregar en', 'Mail', ''];
      rows = cat.sucursales.filter(s => like(s.nombre)).map(s => [s.nombre, rs[s.empresa] || s.empresa, s.direccion || h('span', { class: 'flag' }, 'Falta dirección'), s.email || h('span', { class: 'flag' }, 'Falta mail'), s]);
      nuevo = null;
    }
    const editar = obj => tab === 'productos' ? form(F_PROD, obj, v => api.guardarProducto(v), obj.nombre)
      : tab === 'proveedores' ? form(F_PROV, obj, v => api.guardarProveedor(v), obj.nombre)
      : form(F_SUC, obj, v => api.guardarSucursal(v), obj.nombre);
    cont.replaceChildren(
      h('div', { class: 'toolbar' }, h('input', { type: 'search', id: 'cat-q', placeholder: 'Buscar…', value: q, oninput: e => { q = e.target.value.toLowerCase(); pintarTabla(); } }),
        puede && nuevo ? h('button', { class: 'btn primary', onclick: nuevo }, tab === 'productos' ? 'Agregar insumo' : 'Agregar proveedor') : null),
      tablaBox);
    function pintarTabla() {
      const rs = rows.filter(r => !q || r.some(c => typeof c === 'string' && c.toLowerCase().includes(q)) || (r[4].nombre || '').toLowerCase().includes(q));
      tablaBox.replaceChildren(rs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover' },
        h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: i === 3 && tab === 'productos' ? 'num' : '' }, t)))),
        h('tbody', {}, rs.map(r => h('tr', puede || me.rol === 'admin' ? { tabindex: 0, onclick: () => editar(r[4]), onkeydown: e => e.key === 'Enter' && editar(r[4]) } : {},
          r.slice(0, 4).map((c, i) => h('td', { class: i === 3 && tab === 'productos' ? 'num' : '' }, c)),
          h('td', { class: 'num muted' }, puede ? 'Editar' : '')))))) : empty('Sin resultados'));
    }
    pintarTabla();
  }
  const tablaBox = h('div');
  pintar();

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {}, h('p', { class: 'eyebrow' }, 'Configuración'), h('h1', {}, 'Catálogo'),
      h('p', { class: 'muted' }, `${cat.productos.filter(p => p.foto_url).length} de ${cat.productos.length} insumos con foto. Tocá el cuadradito al lado de cada insumo para sacarle una foto o subirla.`))),
    bar, cont);
}
