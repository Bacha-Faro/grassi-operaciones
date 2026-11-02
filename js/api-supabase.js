// Adaptador Supabase: misma interfaz que api-demo.js.
// Requiere el script UMD de supabase-js cargado en index.html (window.supabase).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { achicarImagen } from './ui.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
let perfil = null;

const SOL_SELECT = `*, periodos(nombre), sucursales(nombre, empresa),
  solicitud_items(id, producto_id, cantidad_solicitada, cantidad_aprobada, estado, motivo, oc_id, cantidad_recibida,
    productos(nombre, unidad, precio_ref, tope_mensual, categorias(nombre)), ordenes_compra:oc_id(oc_items(producto_id, precio_unit)))`;

function solRow(s) {
  const its = s.solicitud_items || [];
  const pu = x => (x.ordenes_compra?.oc_items?.find(o => o.producto_id === x.producto_id)?.precio_unit) ?? x.productos?.precio_ref ?? 0;
  const { solicitud_items, periodos, sucursales, ...base } = s;
  return { ...base, periodo: periodos?.nombre, sucursal: sucursales?.nombre, empresa: sucursales?.empresa, n_items: its.length,
    monto_solicitado: its.reduce((a, x) => a + x.cantidad_solicitada * (x.productos?.precio_ref || 0), 0),
    monto_aprobado: its.reduce((a, x) => a + (x.cantidad_aprobada || 0) * pu(x), 0),
    _items: its.map(x => ({ id: x.id, solicitud_id: s.id, producto_id: x.producto_id, cantidad_solicitada: +x.cantidad_solicitada,
      cantidad_aprobada: x.cantidad_aprobada === null ? null : +x.cantidad_aprobada, estado: x.estado, motivo: x.motivo, oc_id: x.oc_id,
      cantidad_recibida: x.cantidad_recibida, producto: x.productos?.nombre, unidad: x.productos?.unidad,
      categoria: x.productos?.categorias?.nombre, precio_ref: pu(x), tope_mensual: x.productos?.tope_mensual })) };
}

function ocRow(o) {
  const its = o.oc_items || [];
  return { ...o, proveedor: o.proveedores?.nombre, proveedor_email: o.proveedores?.email, interno: !!o.proveedores?.interno, periodo: o.periodos?.nombre,
    total: its.reduce((a, x) => a + x.cantidad * x.precio_unit, 0), n_items: its.length,
    total_recibido: its.some(x => x.cantidad_recibida !== null && x.cantidad_recibida !== undefined) ? its.reduce((a, x) => a + (Number(x.cantidad_recibida) || 0) * x.precio_unit, 0) : null };
}

export const api = {
  modo: 'supabase',
  async init() {},
  async me() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    perfil = ok(await sb.from('perfiles').select('*, sucursales(nombre)').eq('id', session.user.id).single());
    return { ...perfil, sucursal: perfil.sucursales?.nombre || null };
  },
  async login(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
  async recuperar(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })); },
  async logout() { await sb.auth.signOut(); perfil = null; },
  async cambiarClave(password) { ok(await sb.auth.updateUser({ password })); },
  // el link de "Olvidé mi contraseña" vuelve a la app con una sesión de recuperación
  alRecuperar(cb) { sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') cb(); }); },

  async catalogo() {
    const [empresas, sucursales, categorias, proveedores, productos] = await Promise.all([
      sb.from('empresas').select('*'), sb.from('sucursales').select('*').order('id'),
      sb.from('categorias').select('*').order('orden'), sb.from('proveedores').select('*').order('nombre'),
      sb.from('productos').select('*').order('nombre')].map(p => p.then(ok)));
    return { empresas, sucursales, categorias, proveedores, productos };
  },
  // el período del mes en curso se crea solo (pedidos abiertos todo el mes)
  async periodoActual() { return ok(await sb.rpc('periodo_actual')) || null; },
  async periodos() { return ok(await sb.from('periodos').select('*').order('desde')); },

  async crearSolicitud({ periodo_id, sucursal_id, solicitante_nombre, observaciones, urgente = false, motivo_urgencia = null, items }) {
    const s = ok(await sb.from('solicitudes').insert({ periodo_id, sucursal_id, solicitante_nombre, observaciones, urgente, motivo_urgencia,
      solicitante_id: perfil?.id }).select('id').single());
    ok(await sb.from('solicitud_items').insert(items.map(i => ({ solicitud_id: s.id, producto_id: i.producto_id, cantidad_solicitada: i.cantidad }))));
    return s.id;
  },
  async solicitudes(f = {}) {
    let q = sb.from('solicitudes').select(SOL_SELECT).order('created_at', { ascending: false });
    if (f.estado) q = Array.isArray(f.estado) ? q.in('estado', f.estado) : q.eq('estado', f.estado);
    if (f.sucursal_id) q = q.eq('sucursal_id', f.sucursal_id);
    if (f.periodo_id) q = q.eq('periodo_id', f.periodo_id);
    return ok(await q).map(s => { const r = solRow(s); delete r._items; return r; });
  },
  async solicitud(id) {
    const s = ok(await sb.from('solicitudes').select(SOL_SELECT).eq('id', id).maybeSingle());
    if (!s) return null;
    const r = solRow(s); r.items = r._items; delete r._items; return r;
  },
  async auditar(id, items, comentario) {
    const estado = ok(await sb.rpc('auditar_solicitud', { p_id: id, p_items: items, p_comentario: comentario || null }));
    // aviso por mail a la sucursal: si falla, la auditoría ya quedó guardada igual
    sb.functions.invoke('enviar-mail', { body: { tipo: 'auditoria', solicitud_id: id } }).catch(() => {});
    return estado;
  },

  async pendientesOC() {
    const rows = ok(await sb.from('solicitud_items')
      .select('*, solicitudes!inner(sucursal_id, estado, sucursales(nombre, empresa)), productos(nombre, unidad, precio_ref, proveedor_id, proveedores(nombre, interno))')
      .in('solicitudes.estado', ['aprobada', 'aprobada_parcial', 'en_compra'])   // el histórico importado queda afuera
      .is('oc_id', null).in('estado', ['aprobado', 'ajustado']).gt('cantidad_aprobada', 0));
    return rows.map(si => ({ ...si, cantidad_aprobada: +si.cantidad_aprobada, sucursal: si.solicitudes.sucursales.nombre, empresa: si.solicitudes.sucursales.empresa,
      producto: si.productos.nombre, unidad: si.productos.unidad, precio_ref: si.productos.precio_ref,
      proveedor_id: si.productos.proveedor_id, proveedor: si.productos.proveedores?.nombre || null, interno: !!si.productos.proveedores?.interno }));
  },
  async generarOrdenes() { return ok(await sb.rpc('generar_ordenes', {})); },
  async ordenes() {
    return ok(await sb.from('ordenes_compra').select('*, proveedores(nombre, email, interno), periodos(nombre), oc_items(cantidad, precio_unit, cantidad_recibida)')
      .order('id', { ascending: false })).map(ocRow);
  },
  async orden(id) {
    const o = ok(await sb.from('ordenes_compra').select('*, proveedores(*), periodos(nombre), empresas(*), oc_items(*, productos(nombre, unidad, link_compra))').eq('id', id).single());
    const dist = ok(await sb.from('solicitud_items').select('cantidad_aprobada, solicitud_id, productos(nombre), solicitudes(sucursales(nombre, direccion))').eq('oc_id', id));
    return { ...ocRow(o), proveedorObj: o.proveedores, empresaObj: o.empresas,
      items: o.oc_items.map(x => ({ ...x, cantidad: +x.cantidad, precio_unit: +x.precio_unit, producto: x.productos.nombre, unidad: x.productos.unidad, link_compra: x.productos.link_compra, subtotal: x.cantidad * x.precio_unit })),
      distribucion: dist.map(d => ({ sucursal: d.solicitudes.sucursales.nombre, direccion: d.solicitudes.sucursales.direccion, producto: d.productos.nombre, cantidad: +d.cantidad_aprobada, solicitud_id: d.solicitud_id })) };
  },
  async guardarOC(id, campos, items) {
    if (campos && Object.keys(campos).length) ok(await sb.from('ordenes_compra').update(campos).eq('id', id).eq('estado', 'borrador'));
    for (const it of items || []) ok(await sb.from('oc_items').update({ precio_unit: Number(it.precio_unit) || 0, cantidad: Number(it.cantidad) }).eq('id', it.id));
  },
  // Envía la OC por mail (Edge Function "enviar-mail") y la marca como enviada.
  async enviarOC(id, pdfBase64) {
    const { data, error } = await sb.functions.invoke('enviar-mail', { body: { tipo: 'oc', oc_id: id, pdf_base64: pdfBase64 } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },
  // compra hecha por otro medio (Mercado Libre, WhatsApp, teléfono): queda como enviada sin mandar mail
  async registrarCompraSinMail(id, nota) {
    ok(await sb.from('ordenes_compra').update({ estado: 'enviada', enviada_at: new Date().toISOString(), enviada_a: nota || 'Comprada por otro medio' })
      .eq('id', id).eq('estado', 'borrador'));
  },
  async anularOC(id) {
    const oc = ok(await sb.from('ordenes_compra').select('estado').eq('id', id).single());
    if (oc.estado !== 'borrador') throw new Error('Solo se anula una OC en borrador');
    const sols = ok(await sb.from('solicitud_items').update({ oc_id: null }).eq('oc_id', id).select('solicitud_id'));
    ok(await sb.from('solicitudes').update({ estado: 'aprobada' }).in('id', [...new Set(sols.map(x => x.solicitud_id))]));
    ok(await sb.from('ordenes_compra').update({ estado: 'anulada' }).eq('id', id).eq('estado', 'borrador'));
  },
  async recibirOC(id, items) { return ok(await sb.rpc('recibir_oc', { p_oc: id, p_items: items })); },
  // recepción por sucursal: sin ocId = las de mi sucursal; con ocId = todas las de esa orden (equipo)
  async recepciones(ocId = null) { return ok(await sb.rpc('recepciones', { p_oc: ocId })) || []; },
  async confirmarRecepcion(solicitudId, ocId, items, obs) {
    return ok(await sb.rpc('confirmar_recepcion', { p_solicitud: solicitudId, p_oc: ocId, p_items: items, p_obs: obs }));
  },

  // ---- facturas ----
  async facturas() {
    return ok(await sb.from('facturas').select('*, proveedores(nombre)').order('recibida_at', { ascending: false }).limit(500))
      .map(f => ({ ...f, proveedor: f.proveedores?.nombre || null, neto: f.neto === null ? null : +f.neto, total: f.total === null ? null : +f.total }));
  },
  async facturaUrl(f) {
    const { data, error } = await sb.storage.from('facturas').createSignedUrl(f.archivo_path, 600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  async guardarFactura(id, c) {
    const campos = { ...c, auditada_por: c.estado === 'recibida' ? null : perfil?.id, auditada_at: c.estado === 'recibida' ? null : new Date().toISOString() };
    ok(await sb.from('facturas').update(campos).eq('id', id));
  },
  async subirFactura(file, proveedor_id) {
    const d = new Date(), limpio = file.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_');
    const path = `manual/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getTime()}-${limpio}`;
    const up = await sb.storage.from('facturas').upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (up.error) throw new Error(up.error.message);
    ok(await sb.from('facturas').insert({ origen: 'manual', archivo_path: path, archivo_nombre: file.name, archivo_tipo: file.type,
      archivo_bytes: file.size, proveedor_id, created_by: perfil?.id }));
  },

  async consumo() { return ok(await sb.from('v_consumo').select('*')).map(r => ({ ...r, cantidad_aprobada: +r.cantidad_aprobada, cantidad_solicitada: +r.cantidad_solicitada, precio_unit: +r.precio_unit, monto: +r.monto })); },
  async precios() { return ok(await sb.from('v_precios').select('*')).map(r => ({ ...r, precio: +r.precio })); },
  async tiempos() { return ok(await sb.from('v_tiempos').select('*')); },

  async guardarProducto(p) {
    const { id, ...campos } = p;
    if ('link_compra' in campos) campos.link_compra = (campos.link_compra || '').trim() || null;
    if (id) {
      const prev = ok(await sb.from('productos').select('precio_ref').eq('id', id).single());
      ok(await sb.from('productos').update(campos).eq('id', id));
      if (campos.precio_ref && +campos.precio_ref !== +prev.precio_ref && campos.proveedor_id)
        ok(await sb.from('precios').insert({ producto_id: id, proveedor_id: campos.proveedor_id, precio: campos.precio_ref, fuente: 'cotizacion' }));
    } else ok(await sb.from('productos').insert(campos));
  },
  // fotos de insumos: se achican en el navegador y van al bucket público "productos"
  async guardarFotoProducto(id, file) {
    const blob = await achicarImagen(file);
    const path = `${id}/${Date.now()}.jpg`;
    const up = await sb.storage.from('productos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up.error) throw new Error(up.error.message);
    const url = sb.storage.from('productos').getPublicUrl(path).data.publicUrl;
    const prev = ok(await sb.from('productos').select('foto_url').eq('id', id).single()).foto_url;
    ok(await sb.from('productos').update({ foto_url: url }).eq('id', id));
    const viejo = prev?.split('/productos/')[1];
    if (viejo) sb.storage.from('productos').remove([viejo]).catch(() => {});
    return url;
  },
  async quitarFotoProducto(id) {
    const prev = ok(await sb.from('productos').select('foto_url').eq('id', id).single()).foto_url;
    ok(await sb.from('productos').update({ foto_url: null }).eq('id', id));
    const viejo = prev?.split('/productos/')[1];
    if (viejo) sb.storage.from('productos').remove([viejo]).catch(() => {});
  },
  async guardarProveedor(p) { const { id, ...c } = p; ok(id ? await sb.from('proveedores').update(c).eq('id', id) : await sb.from('proveedores').insert(c)); },
  async guardarSucursal(s) { const { id, ...c } = s; ok(id ? await sb.from('sucursales').update(c).eq('id', id) : await sb.from('sucursales').insert(c)); },
};
