// Adaptador Supabase: misma interfaz que api-demo.js.
// Requiere el script UMD de supabase-js cargado en index.html (window.supabase).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20261113-1943';
import { achicarImagen } from './ui.js?v=20261113-1943';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
let perfil = null;

const SOL_SELECT = `*, periodos(nombre), sucursales(nombre, empresa),
  solicitud_items(id, producto_id, cantidad_solicitada, cantidad_aprobada, estado, motivo, oc_id, cantidad_recibida,
    productos(nombre, unidad, tope_mensual, categorias(nombre), precios_lista(precio)), ordenes_compra:oc_id(oc_items(producto_id, precio_unit)))`;

// Precio de lista: está en la tabla precios_lista, que solo puede leer el equipo (para una sucursal llega vacío)
const lista = prod => { const v = prod?.precios_lista; const r = Array.isArray(v) ? v[0] : v; return r?.precio != null ? +r.precio : null; };

function solRow(s) {
  const its = s.solicitud_items || [];
  const pu = x => (x.ordenes_compra?.oc_items?.find(o => o.producto_id === x.producto_id)?.precio_unit) ?? lista(x.productos) ?? 0;
  const { solicitud_items, periodos, sucursales, ...base } = s;
  return { ...base, periodo: periodos?.nombre, sucursal: sucursales?.nombre, empresa: sucursales?.empresa, n_items: its.length,
    monto_solicitado: its.reduce((a, x) => a + x.cantidad_solicitada * (lista(x.productos) || 0), 0),
    monto_aprobado: its.reduce((a, x) => a + (x.cantidad_aprobada || 0) * pu(x), 0),
    _items: its.map(x => ({ id: x.id, solicitud_id: s.id, producto_id: x.producto_id, cantidad_solicitada: +x.cantidad_solicitada,
      cantidad_aprobada: x.cantidad_aprobada === null ? null : +x.cantidad_aprobada, estado: x.estado, motivo: x.motivo, oc_id: x.oc_id,
      cantidad_recibida: x.cantidad_recibida, producto: x.productos?.nombre, unidad: x.productos?.unidad,
      categoria: x.productos?.categorias?.nombre, precio_ref: pu(x), tope_mensual: x.productos?.tope_mensual })) };
}

// ticket con nombres planos (sucursal, categoría)
const tkRow = t => { const { sucursales, it_categorias, it_equipos, ...b } = t; return { ...b, sucursal: sucursales?.nombre, categoria: it_categorias?.nombre, equipo: it_equipos?.nombre || null }; };

function ocRow(o) {
  const its = o.oc_items || [];
  return { ...o, proveedor: o.proveedores?.nombre, proveedor_email: o.proveedores?.email, interno: !!o.proveedores?.interno, con_iva: !!o.proveedores?.precios_con_iva, periodo: o.periodos?.nombre,
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
    const staff = ['auditor', 'compras', 'admin'].includes(perfil?.rol);
    const [empresas, sucursales, categorias, proveedores, productos, precios] = await Promise.all([
      sb.from('empresas').select('*'), sb.from('sucursales').select('*').order('id'),
      sb.from('categorias').select('*').order('orden'), sb.from('proveedores').select('*').order('nombre'),
      sb.from('productos').select('*').order('nombre'),
      staff ? sb.from('precios_lista').select('*') : Promise.resolve({ data: [] })].map(p => p.then(ok)));
    // el equipo ve el precio de lista; a una sucursal no le llega
    const pl = new Map(precios.map(x => [x.producto_id, x]));
    for (const p of productos) { const x = pl.get(p.id); p.precio_ref = x ? +x.precio : null; p.precio_fuente = x?.fuente || null; p.precio_fecha = x?.fecha || null; }
    return { empresas, sucursales, categorias, proveedores, productos };
  },

  // el período del mes en curso se crea solo (pedidos abiertos todo el mes)
  async periodoActual() { return ok(await sb.rpc('periodo_actual')) || null; },
  async periodos() { return ok(await sb.from('periodos').select('*').order('desde')); },

  async crearSolicitud({ periodo_id, sucursal_id, solicitante_nombre, observaciones, urgente = false, motivo_urgencia = null, items }) {
    const s = ok(await sb.from('solicitudes').insert({ periodo_id, sucursal_id, solicitante_nombre, observaciones, urgente, motivo_urgencia,
      solicitante_id: perfil?.id }).select('id').single());
    ok(await sb.from('solicitud_items').insert(items.map(i => ({ solicitud_id: s.id, producto_id: i.producto_id, cantidad_solicitada: i.cantidad }))));
    // aviso por mail a RRHH de cada pedido nuevo: si falla, el pedido ya quedó guardado igual
    sb.functions.invoke('enviar-mail', { body: { tipo: 'nueva_solicitud', solicitud_id: s.id } }).catch(() => {});
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
      .select('*, solicitudes!inner(sucursal_id, estado, sucursales(nombre, empresa)), productos(nombre, unidad, proveedor_id, proveedores(nombre, interno), precios_lista(precio))')
      .in('solicitudes.estado', ['aprobada', 'aprobada_parcial', 'en_compra'])   // el histórico importado queda afuera
      .is('oc_id', null).in('estado', ['aprobado', 'ajustado']).gt('cantidad_aprobada', 0));
    return rows.map(si => ({ ...si, cantidad_aprobada: +si.cantidad_aprobada, sucursal: si.solicitudes.sucursales.nombre, empresa: si.solicitudes.sucursales.empresa,
      producto: si.productos.nombre, unidad: si.productos.unidad, precio_ref: lista(si.productos),
      proveedor_id: si.productos.proveedor_id, proveedor: si.productos.proveedores?.nombre || null, interno: !!si.productos.proveedores?.interno }));
  },
  async generarOrdenes() { return ok(await sb.rpc('generar_ordenes', {})); },
  async ordenes() {
    return ok(await sb.from('ordenes_compra').select('*, proveedores(nombre, email, interno, precios_con_iva), periodos(nombre), oc_items(cantidad, precio_unit, cantidad_recibida)')
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
  // Usuarios (solo IT los ve) y contraseña nueva vía Edge Function "admin-usuarios"
  async usuarios() {
    return ok(await sb.from('perfiles').select('id, email, rol, soporte, sucursales(nombre)').order('email'))
      .map(u => ({ ...u, sucursal: u.sucursales?.nombre || null }));
  },
  async ponerClave(usuario_id, clave) {
    const { data, error } = await sb.functions.invoke('admin-usuarios', { body: { accion: 'clave', usuario_id, clave } });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { /* sin detalle */ } throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data;
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
    // el precio va aparte (tabla precios_lista, solo equipo); el resto del insumo, en productos
    const { id, precio_ref, precio_fuente, precio_fecha, ...campos } = p;
    delete campos.precios_lista;
    if ('link_compra' in campos) campos.link_compra = (campos.link_compra || '').trim() || null;
    let pid = id;
    if (id) ok(await sb.from('productos').update(campos).eq('id', id));
    else pid = ok(await sb.from('productos').insert(campos).select('id').single()).id;
    const prev = ok(await sb.from('precios_lista').select('precio').eq('producto_id', pid).maybeSingle());
    if (+precio_ref > 0) {
      ok(await sb.from('precios_lista').upsert({ producto_id: pid, precio: +precio_ref, fuente: precio_fuente || null, fecha: precio_fecha || null }));
      if (+precio_ref !== +(prev?.precio || 0) && campos.proveedor_id)
        ok(await sb.from('precios').insert({ producto_id: pid, proveedor_id: campos.proveedor_id, precio: +precio_ref, fuente: 'cotizacion', fecha: precio_fecha || undefined }));
    } else if (prev) ok(await sb.from('precios_lista').delete().eq('producto_id', pid));
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
  // ---------------- IT Grassi · Mesa de ayuda ----------------
  async itCategorias() { return ok(await sb.from('it_categorias').select('*').eq('activo', true).order('orden')); },
  async tickets() {
    return ok(await sb.from('tickets').select('*, sucursales(nombre), it_categorias(nombre), it_equipos(nombre)').order('created_at', { ascending: false }))
      .map(tkRow);
  },
  async ticket(id) {
    const [t, mensajes, eventos, archivos] = await Promise.all([
      sb.from('tickets').select('*, sucursales(nombre), it_categorias(nombre), it_equipos(nombre)').eq('id', id).maybeSingle().then(ok),
      sb.from('ticket_mensajes').select('*').eq('ticket_id', id).order('created_at').then(ok),
      sb.from('ticket_eventos').select('*').eq('ticket_id', id).order('created_at').then(ok),
      sb.storage.from('tickets').list(String(id), { sortBy: { column: 'name', order: 'asc' } }).then(ok)]);
    if (!t) return null;
    return { ...tkRow(t), mensajes, eventos, archivos: (archivos || []).filter(a => a.name && !a.name.startsWith('.')).map(a => ({ path: `${id}/${a.name}`, nombre: a.name.replace(/^\d+-/, ''), tipo: a.metadata?.mimetype })) };
  },
  async crearTicket({ sucursal_id, solicitante_nombre, telefono, categoria_id, asunto, descripcion, frena_atencion, equipo_id, archivos = [] }) {
    const t = ok(await sb.from('tickets').insert({ sucursal_id: sucursal_id || perfil?.sucursal_id, solicitante_nombre, telefono: telefono || null,
      categoria_id, asunto, descripcion, frena_atencion: !!frena_atencion, equipo_id: equipo_id || null }).select('id').single());
    let fallidos = 0;
    for (const f of archivos) { try { await this.subirArchivoTicket(t.id, f); } catch { fallidos++; } }
    // aviso a IT (mail y, si es crítico, notificación al celular): si falla, el ticket ya quedó cargado
    sb.functions.invoke('enviar-mail', { body: { tipo: 'ticket', evento: 'nuevo', ticket_id: t.id } }).catch(() => {});
    return { id: t.id, fallidos };
  },
  async subirArchivoTicket(id, file) {
    const esImg = /^image\//.test(file.type) && !/heic/i.test(file.type);
    const blob = esImg ? await achicarImagen(file, 1600, 0.85) : file;
    const limpio = (file.name || 'archivo').normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-60);
    const nombre = esImg ? limpio.replace(/\.[^.]+$/, '') + '.jpg' : limpio;
    const up = await sb.storage.from('tickets').upload(`${id}/${Date.now()}-${nombre}`, blob, { contentType: esImg ? 'image/jpeg' : file.type });
    if (up.error) throw new Error(up.error.message);
  },
  async archivoTicketUrl(path) {
    const { data, error } = await sb.storage.from('tickets').createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  async ticketMensaje(id, texto, interno = false) {
    const m = ok(await sb.from('ticket_mensajes').insert({ ticket_id: id, texto, interno: !!interno,
      autor_nombre: perfil?.soporte ? 'IT' : (perfil?.nombre || perfil?.email || 'Sucursal') }).select('id').single());
    if (!interno) sb.functions.invoke('enviar-mail', { body: { tipo: 'ticket', evento: 'mensaje', mensaje_id: m.id } }).catch(() => {});
    return m.id;
  },
  // IT: estado, prioridad, categoría, solución o motivo de anulación
  async ticketActualizar(id, cambios) {
    const antes = ok(await sb.from('tickets').select('estado').eq('id', id).single());
    ok(await sb.from('tickets').update(cambios).eq('id', id));
    if (cambios.estado && cambios.estado !== antes.estado && ['en_curso', 'resuelto'].includes(cambios.estado))
      sb.functions.invoke('enviar-mail', { body: { tipo: 'ticket', evento: 'estado', ticket_id: id } }).catch(() => {});
  },
  async ticketConfirmar(id) { ok(await sb.rpc('ticket_confirmar', { p_id: id })); },
  async ticketReabrir(id, texto) {
    ok(await sb.rpc('ticket_reabrir', { p_id: id, p_texto: texto }));
    sb.functions.invoke('enviar-mail', { body: { tipo: 'ticket', evento: 'reabierto', ticket_id: id } }).catch(() => {});
  },
  // ---- Soporte IT fase 2: equipos, respuestas rápidas, guías ----
  async itEquipos() { return ok(await sb.from('it_equipos').select('*').order('nombre')); },
  async guardarEquipo(e) {
    const { id, ...c } = e;
    for (const k of ['marca', 'modelo', 'serie', 'usuario', 'remoto', 'nota']) c[k] = String(c[k] ?? '').trim() || null;
    c.nombre = String(c.nombre || '').trim(); c.sucursal_id = c.sucursal_id ? +c.sucursal_id : null;
    return ok(id ? await sb.from('it_equipos').update(c).eq('id', id).select('id').single() : await sb.from('it_equipos').insert(c).select('id').single()).id;
  },
  async itRespuestas() { return ok(await sb.from('it_respuestas').select('*').order('orden').order('titulo')); },
  async guardarRespuesta(r) { const { id, ...c } = r; c.categoria_id = c.categoria_id ? +c.categoria_id : null; ok(id ? await sb.from('it_respuestas').update(c).eq('id', id) : await sb.from('it_respuestas').insert(c)); },
  async borrarRespuesta(id) { ok(await sb.from('it_respuestas').delete().eq('id', id)); },
  async itSoluciones() { return ok(await sb.from('it_soluciones').select('*').order('orden').order('titulo')); },
  async guardarSolucion(x) { const { id, ...c } = x; c.categoria_id = c.categoria_id ? +c.categoria_id : null; ok(id ? await sb.from('it_soluciones').update(c).eq('id', id) : await sb.from('it_soluciones').insert(c)); },
  async borrarSolucion(id) { ok(await sb.from('it_soluciones').delete().eq('id', id)); },
  async solucionSirvio(id) { ok(await sb.rpc('solucion_sirvio', { p_id: id })); },
  async itSolucionesUsos() { return ok(await sb.from('it_soluciones_usos').select('solucion_id, sucursal_id, created_at').order('created_at', { ascending: false }).limit(2000)); },
  // notificaciones en el celular (Web Push): se guarda la suscripción de este dispositivo
  async guardarPush(sub, dispositivo) {
    const j = sub.toJSON();
    ok(await sb.from('push_suscripciones').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, dispositivo, user_id: perfil?.id }, { onConflict: 'endpoint' }));
  },
  async quitarPush(endpoint) { ok(await sb.from('push_suscripciones').delete().eq('endpoint', endpoint)); },
  async probarPush() {
    const { data, error } = await sb.functions.invoke('enviar-mail', { body: { tipo: 'push_prueba' } });
    if (error) throw new Error(error.message);
    return data;
  },
  // ---------------- Droguería: bachas y temperatura ----------------
  async bachas() { return ok(await sb.from('v_bachas').select('*').eq('activa', true).order('codigo')); },
  async bachaHistorial(id) { return ok(await sb.from('bacha_movimientos').select('*, sucursales(nombre)').eq('bacha_id', id).order('created_at', { ascending: false }).limit(20)).map(m => ({ ...m, sucursal: m.sucursales?.nombre })); },
  async bachaMovimiento({ bacha_id, tipo, sucursal_id = null, retorno_esperado = null, observacion = null }) {
    ok(await sb.from('bacha_movimientos').insert({ bacha_id, tipo, sucursal_id, retorno_esperado, observacion: observacion || null }));
  },
  async tempPuntos() { return ok(await sb.from('temp_puntos').select('*').eq('activo', true).order('orden')).map(p => ({ ...p, t_min: +p.t_min, t_max: +p.t_max, h_min: p.h_min === null ? null : +p.h_min, h_max: p.h_max === null ? null : +p.h_max })); },
  async tempLecturas(desde, hasta) {
    return ok(await sb.from('temp_lecturas').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha').order('turno'))
      .map(l => ({ ...l, temperatura: +l.temperatura, humedad: l.humedad === null ? null : +l.humedad }));
  },
  // guarda las lecturas de un turno (si ya estaban, las corrige)
  async tempGuardar(filas) {
    const datos = filas.map(f => ({ punto_id: f.punto_id, fecha: f.fecha, turno: f.turno, temperatura: f.temperatura, humedad: f.humedad ?? null, accion: f.accion || null }));
    ok(await sb.from('temp_lecturas').upsert(datos, { onConflict: 'punto_id,fecha,turno' }));
  },

  // ---------- Grassi Analytics: tableros de Power BI (los links solo los lee quien está habilitado) ----------
  // Conciliación Droguería → farmacias: se llena cuando estén conectadas las APIs de Quantio y Plex (Galbop)
  async conciliacion() { return { modo: 'sin_conexion', filas: [] }; },
  async feriados() { return ok(await sb.from('feriados').select('*').order('fecha')); },
  async tableros() { return ok(await sb.from('analytics_tableros').select('*').order('orden').order('titulo')); },
  async guardarTablero(t) {
    const campos = { titulo: t.titulo.trim(), descripcion: t.descripcion || null, area: t.area || null, url: t.url.trim(), orden: +t.orden || 0, activo: t.activo !== false };
    if (t.id) return ok(await sb.from('analytics_tableros').update(campos).eq('id', t.id).select().single());
    return ok(await sb.from('analytics_tableros').insert(campos).select().single());
  },
  async borrarTablero(id) { ok(await sb.from('analytics_tableros').delete().eq('id', id)); },

  // ---------- RRHH Grassi (solo RRHH y admin; lo controla la base con RLS) ----------
  async rrhhEmpleados() { return ok(await sb.from('rrhh_empleados').select('*').order('nombre')).map(e => ({ ...e, horas_semana: e.horas_semana === null ? null : +e.horas_semana })); },
  async rrhhGuardarEmpleado(e) {
    const campos = { nombre: e.nombre.trim(), sucursal_id: e.sucursal_id || null, puesto: e.puesto || null, acuerdo_sabado: e.acuerdo_sabado || null,
      horas_semana: e.horas_semana === '' || e.horas_semana == null ? null : +e.horas_semana, dias_vacaciones: e.dias_vacaciones === '' || e.dias_vacaciones == null ? null : +e.dias_vacaciones,
      activo: e.activo !== false, nota: e.nota || null };
    if (e.id) return ok(await sb.from('rrhh_empleados').update(campos).eq('id', e.id).select().single());
    return ok(await sb.from('rrhh_empleados').insert(campos).select().single());
  },
  // une dos fichas de la misma persona: las ausencias pasan a la que queda y la otra se borra
  async rrhhUnificar(origen, destino) {
    ok(await sb.from('rrhh_ausencias').update({ empleado_id: destino }).eq('empleado_id', origen));
    ok(await sb.from('rrhh_empleados').delete().eq('id', origen));
  },
  async rrhhAusencias(desde = null, hasta = null) {
    let q = sb.from('rrhh_ausencias').select('*').order('desde');
    if (desde) q = q.gte('hasta', desde);
    if (hasta) q = q.lte('desde', hasta);
    return ok(await q);
  },
  async rrhhGuardarAusencia(a) {
    const campos = { empleado_id: +a.empleado_id, tipo: a.tipo, desde: a.desde, hasta: a.hasta, dias: +a.dias, periodo: a.periodo ? +a.periodo : null,
      titulo: a.titulo || null, nota: a.nota || null, aproximada: !!a.aproximada };
    if (a.id) return ok(await sb.from('rrhh_ausencias').update(campos).eq('id', a.id).select().single());
    return ok(await sb.from('rrhh_ausencias').insert({ ...campos, usuario_nombre: perfil?.nombre || perfil?.email || null }).select().single());
  },
  async rrhhBorrarAusencia(id) { ok(await sb.from('rrhh_ausencias').delete().eq('id', id)); },
};
