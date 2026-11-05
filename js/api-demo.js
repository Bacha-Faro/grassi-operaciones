// Modo demo: misma interfaz que api-supabase.js, con datos en el navegador.
// Genera 11 meses de historia (dic-2025 a oct-2026) para que los indicadores tengan contenido.
import { EMPRESAS, SUCURSALES, CATEGORIAS, PROVEEDORES, PRODUCTOS } from './seed-data.js?v=20261105-1741';

const KEY = 'insumos-demo-v1';
const clone = o => JSON.parse(JSON.stringify(o));
let db, who;

// ---------- persistencia ----------
function save() { try { localStorage.setItem(KEY, JSON.stringify({ db, who })); } catch { /* sin storage */ } }
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.db?.v === 1) { db = s.db; who = s.who; return true; } } catch { /* nada */ }
  return false;
}
const nextId = t => (db.seq[t] = (db.seq[t] || 0) + 1);

// ---------- reglas (espejo de las funciones SQL) ----------
function _crearSolicitud(u, { periodo_id, sucursal_id, solicitante_nombre, observaciones, urgente = false, motivo_urgencia = null, items }, at) {
  const id = nextId('solicitudes');
  db.solicitudes.push({ id, periodo_id, sucursal_id, solicitante_nombre, observaciones: observaciones || null, urgente, motivo_urgencia,
    estado: 'pendiente', created_at: at || new Date().toISOString(), auditada_at: null, comentario_auditoria: null });
  for (const it of items) db.solicitud_items.push({ id: nextId('solicitud_items'), solicitud_id: id,
    producto_id: it.producto_id, cantidad_solicitada: it.cantidad, cantidad_aprobada: null, estado: 'pendiente',
    motivo: null, oc_id: null, cantidad_recibida: null });
  return id;
}

function _auditar(id, items, comentario, at) {
  for (const it of items) {
    const si = db.solicitud_items.find(x => x.id === it.id && x.solicitud_id === id);
    if (!si) continue;
    si.estado = it.estado;
    si.cantidad_aprobada = it.estado === 'rechazado' ? 0 : Number(it.cantidad_aprobada);
    si.motivo = it.motivo || null;
  }
  const its = db.solicitud_items.filter(x => x.solicitud_id === id);
  const estado = its.every(x => x.estado === 'rechazado') ? 'rechazada'
    : its.every(x => x.estado === 'aprobado') ? 'aprobada' : 'aprobada_parcial';
  Object.assign(db.solicitudes.find(s => s.id === id),
    { estado, auditada_at: at || new Date().toISOString(), comentario_auditoria: comentario || null });
  return estado;
}

function _generarOrdenes(at) {
  const libres = db.solicitud_items.filter(si => !si.oc_id && ['aprobado', 'ajustado'].includes(si.estado) && si.cantidad_aprobada > 0);
  const grupos = {};
  for (const si of libres) {
    const s = db.solicitudes.find(x => x.id === si.solicitud_id);
    const su = db.sucursales.find(x => x.id === s.sucursal_id);
    const p = db.productos.find(x => x.id === si.producto_id);
    if (!p.proveedor_id) continue;
    const interno = db.proveedores.find(x => x.id === p.proveedor_id)?.interno;
    (grupos[`${p.proveedor_id}|${interno ? '' : su.empresa}|${s.periodo_id}`] ||= []).push(si);
  }
  let n = 0;
  for (const [k, sis] of Object.entries(grupos)) {
    const [proveedor_id, empresa, periodo_id] = k.split('|');
    const prov = db.proveedores.find(p => p.id === +proveedor_id);
    const oc = { id: nextId('ordenes_compra'), proveedor_id: +proveedor_id, empresa: empresa || null, periodo_id: +periodo_id,
      estado: 'borrador', fecha: (at || new Date().toISOString()).slice(0, 10), fecha_entrega: null,
      forma_pago: prov.condicion_pago, observaciones: null, enviada_at: null, enviada_a: null,
      created_at: at || new Date().toISOString() };
    db.ordenes_compra.push(oc);
    const porProd = {};
    for (const si of sis) { si.oc_id = oc.id; porProd[si.producto_id] = (porProd[si.producto_id] || 0) + si.cantidad_aprobada; }
    for (const [pid, cant] of Object.entries(porProd)) {
      const p = db.productos.find(x => x.id === +pid);
      db.oc_items.push({ id: nextId('oc_items'), oc_id: oc.id, producto_id: +pid, cantidad: cant, precio_unit: p.precio_ref || 0, cantidad_recibida: null });
    }
    for (const sid of new Set(sis.map(x => x.solicitud_id))) db.solicitudes.find(s => s.id === sid).estado = 'en_compra';
    n++;
  }
  return n;
}

function _enviar(oc, email, at) {
  oc.estado = 'enviada'; oc.enviada_at = at || new Date().toISOString(); oc.enviada_a = email;
  for (const oi of db.oc_items.filter(x => x.oc_id === oc.id && x.precio_unit > 0)) {
    db.precios.push({ id: nextId('precios'), producto_id: oi.producto_id, proveedor_id: oc.proveedor_id,
      precio: oi.precio_unit, fecha: oc.enviada_at.slice(0, 10), fuente: 'oc', oc_id: oc.id });
    db.productos.find(p => p.id === oi.producto_id).precio_ref = oi.precio_unit;
  }
}

function _recibir(ocId, items) {
  const ois = db.oc_items.filter(x => x.oc_id === ocId);
  for (const it of items) { const oi = ois.find(x => x.id === it.id); if (oi) oi.cantidad_recibida = Number(it.cantidad_recibida); }
  for (const si of db.solicitud_items.filter(x => x.oc_id === ocId)) {
    const oi = ois.find(x => x.producto_id === si.producto_id);
    si.cantidad_recibida = oi.cantidad ? Math.round(si.cantidad_aprobada * oi.cantidad_recibida / oi.cantidad * 100) / 100 : 0;
  }
  const oc = db.ordenes_compra.find(o => o.id === ocId);
  oc.estado = ois.every(x => (x.cantidad_recibida || 0) >= x.cantidad) ? 'recibida' : 'recibida_parcial';
  const solIds = new Set(db.solicitud_items.filter(x => x.oc_id === ocId).map(x => x.solicitud_id));
  for (const sid of solIds) {
    const pend = db.solicitud_items.filter(x => x.solicitud_id === sid && x.estado !== 'rechazado').some(x => {
      const o = db.ordenes_compra.find(o => o.id === x.oc_id);
      return !o || !['recibida', 'recibida_parcial'].includes(o.estado);
    });
    if (!pend) db.solicitudes.find(s => s.id === sid).estado = 'recibida';
  }
  return oc.estado;
}

// ---------- historia de ejemplo ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const iso = (y, m, d, hh = 10) => new Date(Date.UTC(y, m, d, hh + 3)).toISOString();

function construir() {
  db = { v: 1, seq: {}, empresas: clone(EMPRESAS), sucursales: clone(SUCURSALES), categorias: clone(CATEGORIAS),
    proveedores: clone(PROVEEDORES).map(p => ({ cuit: '', telefono: '', direccion: '', contacto: '', activo: true, ...p })),
    productos: clone(PRODUCTOS), precios: [], periodos: [], solicitudes: [], solicitud_items: [], ordenes_compra: [], oc_items: [] };
  db.proveedores.forEach((p, i) => { p.email = `proveedor${i + 1}@ejemplo.com`; });
  db.proveedores.push({ id: 4, nombre: 'Cotización alternativa (ejemplo)', email: 'cotiza@ejemplo.com', condicion_pago: '30 días', cuit: '', telefono: '', direccion: '', contacto: '', activo: true });
  db.sucursales.forEach(s => { s.email = `${s.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '')}@grupograssi.com`; s.activo = true; });
  for (const t of ['sucursales', 'categorias', 'proveedores', 'productos']) db.seq[t] = Math.max(...db[t].map(x => x.id));

  const r = rng(26);
  const base = Object.fromEntries(db.productos.map(p => [p.id, p.precio_ref]));
  const kMax = p => /Resma/.test(p.nombre) ? 12 : /térmicos/.test(p.nombre) ? 8 : p.precio_ref < 1000 ? 10 : p.precio_ref < 3000 ? 6 : p.precio_ref < 8000 ? 4 : 2;
  const meses = []; for (let i = 0; i < 12; i++) { const m = (11 + i) % 12, y = 2025 + Math.floor((11 + i) / 12); meses.push([y, m]); }

  meses.forEach(([y, m], idx) => {
    const per = { id: nextId('periodos'), nombre: `${MESES[m]} ${y}`, desde: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      hasta: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10), cierre: iso(y, m, 5, 23), estado: idx < 11 ? 'cerrado' : 'abierto' };
    db.periodos.push(per);
    const factor = Math.pow(1.022, idx - 1);
    db.productos.forEach(p => { if (base[p.id]) p.precio_ref = Math.round(base[p.id] * factor); });
    // cotizaciones alternativas trimestrales
    if (idx % 3 === 1) db.productos.filter(p => p.categoria_id !== 1 && p.precio_ref && r() < 0.25).forEach(p =>
      db.precios.push({ id: nextId('precios'), producto_id: p.id, proveedor_id: 4, precio: Math.round(p.precio_ref * (0.9 + r() * 0.16)), fecha: per.desde, fuente: 'cotizacion' }));

    const ultimo = idx === 11;
    const quienes = ultimo ? [1, 4, 7, 2, 5] : db.sucursales.map(s => s.id);
    // en el período abierto los pedidos llegan "hace pocos días" (antes del 26/10)
    const [py, pm] = ultimo ? [2026, 9] : [y, m];
    quienes.forEach((sid, j) => {
      if (!ultimo && r() < 0.08) return;                       // alguna sucursal no pidió ese mes
      const items = db.productos.filter(p => p.precio_ref && r() < (sid >= 7 ? 0.18 : 0.13))
        .map(p => ({ producto_id: p.id, cantidad: 1 + Math.floor(r() * kMax(p) * (sid === 7 ? 3.5 : 2.2)) }));
      if (!items.length) return;
      const dia = ultimo ? 21 + j : 1 + Math.floor(r() * 4);
      const id = _crearSolicitud(null, { periodo_id: per.id, sucursal_id: sid, solicitante_nombre: NOMBRES[(sid + idx) % NOMBRES.length], items },
        iso(py, pm, dia, 9 + Math.floor(r() * 8)));
      if (ultimo && j < 3) return;                              // quedan pendientes de auditoría
      const its = db.solicitud_items.filter(x => x.solicitud_id === id).map(si => {
        const x = r();
        if (x < 0.07) return { id: si.id, estado: 'rechazado', cantidad_aprobada: 0, motivo: 'Stock suficiente en la sucursal' };
        if (x < 0.2) return { id: si.id, estado: 'ajustado', cantidad_aprobada: Math.max(1, Math.ceil(si.cantidad_solicitada * 0.6)), motivo: 'Supera el consumo habitual' };
        return { id: si.id, estado: 'aprobado', cantidad_aprobada: si.cantidad_solicitada };
      });
      _auditar(id, its, null, iso(py, pm, dia + 1 + Math.floor(r() * 2), 11 + Math.floor(r() * 6)));
    });
    if (ultimo) return;
    _generarOrdenes(iso(y, m, 7, 10));
    for (const oc of db.ordenes_compra.filter(o => o.periodo_id === per.id)) {
      oc.fecha_entrega = iso(y, m, 14).slice(0, 10);
      _enviar(oc, db.proveedores.find(p => p.id === oc.proveedor_id).email, iso(y, m, 7 + Math.floor(r() * 2), 12));
      const corto = r() < 0.1;   // ~1 de cada 10 órdenes llega con un faltante (sólo en los últimos 2 meses queda abierta)
      _recibir(oc.id, db.oc_items.filter(x => x.oc_id === oc.id).map((x, k) => ({ id: x.id, cantidad_recibida: corto && k === 0 && idx >= 9 ? Math.floor(x.cantidad * 0.5) : x.cantidad })));
    }
  });
  who = { id: 'demo', rol: 'solicitante', sucursal_id: 1, nombre: 'Suc 1' };
  save();
}
const NOMBRES = ['Laura Gómez', 'Martín Ríos', 'Carla Funes', 'Diego Sosa', 'Paula Ferreyra', 'Nicolás Paez', 'Sofía Bustos', 'Javier Molina', 'Romina Aguirre', 'Lucas Ledesma', 'Valeria Quiroga'];

// ---------- vistas de lectura ----------
const suc = id => db.sucursales.find(s => s.id === id);
const prod = id => db.productos.find(p => p.id === id);
const prov = id => db.proveedores.find(p => p.id === id);
const per = id => db.periodos.find(p => p.id === id);
const cat = id => db.categorias.find(c => c.id === id);
const ocPrecio = (si) => si.oc_id ? db.oc_items.find(o => o.oc_id === si.oc_id && o.producto_id === si.producto_id)?.precio_unit : null;

function solRow(s) {
  const its = db.solicitud_items.filter(x => x.solicitud_id === s.id);
  const su = suc(s.sucursal_id);
  return { ...s, periodo: per(s.periodo_id).nombre, sucursal: su.nombre, empresa: su.empresa, n_items: its.length,
    monto_solicitado: its.reduce((a, x) => a + x.cantidad_solicitada * (prod(x.producto_id).precio_ref || 0), 0),
    monto_aprobado: its.reduce((a, x) => a + (x.cantidad_aprobada || 0) * (ocPrecio(x) ?? prod(x.producto_id).precio_ref ?? 0), 0) };
}
function ocRow(o) {
  const its = db.oc_items.filter(x => x.oc_id === o.id); const p = prov(o.proveedor_id);
  return { ...o, proveedor: p.nombre, proveedor_email: p.email, interno: !!p.interno, periodo: per(o.periodo_id)?.nombre,
    total: its.reduce((a, x) => a + x.cantidad * x.precio_unit, 0), n_items: its.length,
    total_recibido: its.some(x => x.cantidad_recibida !== null && x.cantidad_recibida !== undefined) ? its.reduce((a, x) => a + (Number(x.cantidad_recibida) || 0) * x.precio_unit, 0) : null };
}
const visible = s => who.rol !== 'solicitante' || s.sucursal_id === who.sucursal_id;
const tick = v => new Promise(r => setTimeout(() => r(clone(v)), 60));
const need = (...roles) => { if (!roles.includes(who.rol)) throw new Error('Tu rol no tiene permiso para esta acción'); };

// ---------- API pública ----------
export const api = {
  modo: 'demo',
  async init() { if (!load()) construir(); },
  async reset() { construir(); },
  async me() {
    const s = who.sucursal_id ? suc(who.sucursal_id) : null;
    return tick({ ...who, email: s?.email || `${who.rol}@grupograssi.com`, sucursal: s?.nombre || null, soporte: who.rol === 'admin' });
  },
  usuariosDemo() {
    return [
      ...db.sucursales.map(s => ({ key: `s${s.id}`, label: `${s.nombre} · solicitante`, rol: 'solicitante', sucursal_id: s.id, nombre: s.nombre })),
      { key: 'auditor', label: 'RRHH · auditoría', rol: 'auditor', sucursal_id: null, nombre: 'RRHH' },
      { key: 'compras', label: 'Compras', rol: 'compras', sucursal_id: null, nombre: 'Compras' },
      { key: 'admin', label: 'Administrador', rol: 'admin', sucursal_id: null, nombre: 'Admin' },
    ];
  },
  async cambiarUsuario(u) { who = { id: 'demo', rol: u.rol, sucursal_id: u.sucursal_id, nombre: u.nombre }; save(); },
  async logout() {},
  async cambiarClave() {},
  async usuarios() {
    return this.usuariosDemo().map((u, i) => { const s = u.sucursal_id ? suc(u.sucursal_id) : null;
      return { id: u.key, email: s?.email || `${u.rol}@grupograssi.com`, rol: u.rol, soporte: u.rol === 'admin', sucursal: s?.nombre || (u.rol === 'auditor' ? 'RRHH' : null) }; });
  },
  async ponerClave(id, clave) { if (String(clave).length < 10) throw new Error('La contraseña tiene que tener al menos 10 caracteres, con letras y números'); return { ok: true, simulado: true }; },
  alRecuperar() {},

  async catalogo() {
    const productos = who.rol === 'solicitante' ? db.productos.map(({ precio_ref, ...p }) => ({ ...p, precio_ref: null })) : db.productos;
    return tick({ empresas: db.empresas, sucursales: db.sucursales, categorias: db.categorias,
      proveedores: db.proveedores, productos });
  },
  async periodoActual() { return tick([...db.periodos].reverse().find(p => p.estado === 'abierto') || null); },
  async periodos() { return tick(db.periodos); },

  async crearSolicitud(data) {
    if (who.rol === 'solicitante' && data.sucursal_id !== who.sucursal_id) throw new Error('Solo podés pedir para tu sucursal');
    const id = _crearSolicitud(who, data); save(); return id;
  },
  async solicitudes(f = {}) {
    return tick(db.solicitudes.filter(visible)
      .filter(s => !f.estado || [].concat(f.estado).includes(s.estado))
      .filter(s => !f.sucursal_id || s.sucursal_id === f.sucursal_id)
      .filter(s => !f.periodo_id || s.periodo_id === f.periodo_id)
      .map(solRow).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },
  async solicitud(id) {
    const s = db.solicitudes.find(x => x.id === id && visible(x)); if (!s) return null;
    return tick({ ...solRow(s), items: db.solicitud_items.filter(x => x.solicitud_id === id).map(si => {
      const p = prod(si.producto_id);
      return { ...si, producto: p.nombre, categoria: cat(p.categoria_id).nombre, unidad: p.unidad, precio_ref: ocPrecio(si) ?? p.precio_ref, tope_mensual: p.tope_mensual };
    }) });
  },
  async auditar(id, items, comentario) { need('auditor', 'admin'); const e = _auditar(id, items, comentario); save(); return e; },

  async pendientesOC() {
    return tick(db.solicitud_items.filter(si => !si.oc_id && ['aprobado', 'ajustado'].includes(si.estado) && si.cantidad_aprobada > 0).map(si => {
      const s = db.solicitudes.find(x => x.id === si.solicitud_id); const p = prod(si.producto_id); const su = suc(s.sucursal_id);
      return { ...si, sucursal: su.nombre, empresa: su.empresa, producto: p.nombre, unidad: p.unidad, precio_ref: p.precio_ref,
        proveedor_id: p.proveedor_id, proveedor: p.proveedor_id ? prov(p.proveedor_id).nombre : null, interno: !!(p.proveedor_id && prov(p.proveedor_id).interno) };
    }));
  },
  async generarOrdenes() { need('compras', 'admin'); const n = _generarOrdenes(); save(); return n; },
  async ordenes() { return tick(db.ordenes_compra.map(ocRow).sort((a, b) => b.id - a.id)); },
  async orden(id) {
    const o = db.ordenes_compra.find(x => x.id === id); if (!o) return null;
    const items = db.oc_items.filter(x => x.oc_id === id).map(oi => ({ ...oi, producto: prod(oi.producto_id).nombre, unidad: prod(oi.producto_id).unidad, link_compra: prod(oi.producto_id).link_compra || null, subtotal: oi.cantidad * oi.precio_unit }));
    const distribucion = db.solicitud_items.filter(x => x.oc_id === id).map(si => {
      const s = db.solicitudes.find(x => x.id === si.solicitud_id);
      return { sucursal: suc(s.sucursal_id).nombre, direccion: suc(s.sucursal_id).direccion || null, producto: prod(si.producto_id).nombre, cantidad: si.cantidad_aprobada, solicitud_id: s.id };
    });
    return tick({ ...ocRow(o), proveedorObj: prov(o.proveedor_id), empresaObj: db.empresas.find(e => e.codigo === o.empresa), items, distribucion });
  },
  async guardarOC(id, campos, items) {
    need('compras', 'admin');
    const o = db.ordenes_compra.find(x => x.id === id);
    if (o.estado !== 'borrador') throw new Error('Solo se puede editar una OC en borrador');
    Object.assign(o, campos);
    for (const it of items || []) Object.assign(db.oc_items.find(x => x.id === it.id), { precio_unit: Number(it.precio_unit) || 0, cantidad: Number(it.cantidad) });
    save();
  },
  async enviarOC(id /* , pdfBase64 */) {
    need('compras', 'admin');
    const o = db.ordenes_compra.find(x => x.id === id); const p = prov(o.proveedor_id);
    if (!p.email) throw new Error(`El proveedor ${p.nombre} no tiene mail cargado`);
    _enviar(o, p.email); save();
    return { simulado: true, a: p.email };
  },
  async registrarCompraSinMail(id, nota) {
    need('compras', 'admin'); const o = db.ordenes_compra.find(x => x.id === id);
    if (o.estado !== 'borrador') throw new Error('Solo se puede registrar una orden en borrador');
    _enviar(o, nota || 'Comprada por otro medio'); save();
  },
  async anularOC(id) {
    need('compras', 'admin');
    const o = db.ordenes_compra.find(x => x.id === id);
    if (o.estado !== 'borrador') throw new Error('Solo se anula una OC en borrador');
    o.estado = 'anulada';
    for (const si of db.solicitud_items.filter(x => x.oc_id === id)) { si.oc_id = null; db.solicitudes.find(s => s.id === si.solicitud_id).estado = 'aprobada'; }
    save();
  },
  async recibirOC(id, items) { need('compras', 'admin', 'auditor'); const e = _recibir(id, items); save(); return e; },
  async guardarFotoProducto(id, file) {
    need('compras', 'admin');
    const { achicarImagen } = await import('./ui.js?v=20261105-1741');
    const blob = await achicarImagen(file, 320, 0.7);
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    db.productos.find(p => p.id === id).foto_url = url; save(); return url;
  },
  async quitarFotoProducto(id) { need('compras', 'admin'); db.productos.find(p => p.id === id).foto_url = null; save(); },
  async recepciones(ocId = null) {
    db.recepciones ||= [];
    const pares = new Set(db.solicitud_items.filter(si => si.oc_id).map(si => `${si.solicitud_id}|${si.oc_id}`));
    const out = [];
    for (const k of pares) {
      const [sid, oid] = k.split('|').map(Number); const o = db.ordenes_compra.find(x => x.id === oid); const s = db.solicitudes.find(x => x.id === sid);
      if (!['enviada', 'recibida_parcial', 'recibida'].includes(o.estado)) continue;
      if (ocId ? o.id !== ocId : s.sucursal_id !== who.sucursal_id) continue;
      const rec = db.recepciones.find(r => r.solicitud_id === sid && r.oc_id === oid) || null;
      if (!rec && o.estado !== 'enviada') continue;   // historial de ejemplo: recibido antes de existir la recepción por sucursal
      if (!ocId && rec && Date.now() - new Date(rec.recibido_at) > 45 * 864e5) continue;
      const p = prov(o.proveedor_id);
      out.push({ solicitud_id: sid, oc_id: oid, proveedor: p.nombre, interno: !!p.interno, oc_estado: o.estado, enviada_at: o.enviada_at,
        sucursal: suc(s.sucursal_id).nombre, direccion: suc(s.sucursal_id).direccion || null, periodo: per(s.periodo_id)?.nombre, pendiente: !rec,
        recepcion: rec && { conforme: rec.conforme, observaciones: rec.observaciones, recibido_at: rec.recibido_at, por: rec.por },
        items: db.solicitud_items.filter(si => si.solicitud_id === sid && si.oc_id === oid).map(si => ({ id: si.id, producto: prod(si.producto_id).nombre,
          unidad: prod(si.producto_id).unidad, aprobada: si.cantidad_aprobada, recibida: rec ? si.cantidad_recibida : null })) });
    }
    return tick(out.sort((a, b) => (b.pendiente - a.pendiente) || String(b.enviada_at).localeCompare(String(a.enviada_at))));
  },
  async confirmarRecepcion(sid, oid, items, obs) {
    db.recepciones ||= [];
    const s = db.solicitudes.find(x => x.id === sid);
    if (who.rol === 'solicitante' && s.sucursal_id !== who.sucursal_id) throw new Error('Sin permiso para registrar esta recepción');
    const sis = db.solicitud_items.filter(si => si.solicitud_id === sid && si.oc_id === oid);
    for (const si of sis) { const it = items.find(x => x.id === si.id); si.cantidad_recibida = it ? Math.max(0, +it.recibida) : si.cantidad_aprobada; }
    const conforme = sis.every(si => +si.cantidad_recibida === +si.cantidad_aprobada);
    if (!conforme && !(obs || '').trim()) throw new Error('Contá qué pasó con las diferencias en Observaciones');
    db.recepciones = db.recepciones.filter(r => !(r.solicitud_id === sid && r.oc_id === oid));
    db.recepciones.push({ solicitud_id: sid, oc_id: oid, conforme, observaciones: obs || null, recibido_at: new Date().toISOString(), por: `${who.rol}@grupograssi.com` });
    const o = db.ordenes_compra.find(x => x.id === oid);
    for (const oi of db.oc_items.filter(x => x.oc_id === oid)) {
      const recs = db.solicitud_items.filter(si => si.oc_id === oid && si.producto_id === oi.producto_id && db.recepciones.some(r => r.solicitud_id === si.solicitud_id && r.oc_id === oid));
      oi.cantidad_recibida = recs.reduce((a, x) => a + +x.cantidad_recibida, 0);
    }
    const total = new Set(db.solicitud_items.filter(si => si.oc_id === oid).map(si => si.solicitud_id)).size;
    const confs = db.recepciones.filter(r => r.oc_id === oid);
    if (confs.length >= total) o.estado = confs.every(r => r.conforme) ? 'recibida' : 'recibida_parcial';
    if (db.solicitud_items.filter(si => si.solicitud_id === sid && si.estado !== 'rechazado' && si.cantidad_aprobada > 0)
      .every(si => db.recepciones.some(r => r.solicitud_id === sid && r.oc_id === si.oc_id))) s.estado = 'recibida';
    save(); return o.estado;
  },

  // ---- facturas (demo: sin archivos reales) ----
  async facturas() {
    if (!db.facturas) {
      const ocs = db.ordenes_compra.filter(o => o.estado !== 'borrador').slice(-3);
      db.facturas = ocs.map((o, i) => ({ id: i + 1, origen: 'mail', recibida_at: new Date(Date.now() - (i + 1) * 864e5).toISOString(),
        remitente: prov(o.proveedor_id).email, asunto: `Factura ${o.id}`, archivo_nombre: `factura-${o.id}.pdf`, archivo_tipo: 'application/pdf',
        proveedor_id: o.proveedor_id, empresa: null, oc_id: null, tipo: 'A', numero: null, fecha: null, neto: null, total: null, estado: 'recibida', observaciones: null }));
      db.facturas.push({ id: 9, origen: 'mail', recibida_at: new Date().toISOString(), remitente: 'ventas@desconocido.com', asunto: 'Envío comprobante',
        archivo_nombre: 'IMG_2026.jpeg', archivo_tipo: 'image/jpeg', proveedor_id: null, empresa: null, oc_id: null, tipo: 'A', numero: null,
        fecha: null, neto: null, total: null, estado: 'recibida', observaciones: null });
      save();
    }
    return tick(db.facturas.map(f => ({ ...f, proveedor: f.proveedor_id ? prov(f.proveedor_id).nombre : null })).sort((a, b) => b.recibida_at.localeCompare(a.recibida_at)));
  },
  async facturaUrl() { return null; },
  async guardarFactura(id, c) { Object.assign(db.facturas.find(f => f.id === id), c); save(); },
  async subirFactura(file, proveedor_id) {
    db.facturas.push({ id: Date.now(), origen: 'manual', recibida_at: new Date().toISOString(), remitente: null, asunto: null,
      archivo_nombre: file.name, archivo_tipo: file.type, proveedor_id, empresa: null, oc_id: null, tipo: 'A', numero: null, fecha: null,
      neto: null, total: null, estado: 'recibida', observaciones: null });
    save();
  },

  async consumo() {
    return tick(db.solicitud_items.map(si => {
      const s = db.solicitudes.find(x => x.id === si.solicitud_id); const p = prod(si.producto_id); const pe = per(s.periodo_id); const su = suc(s.sucursal_id);
      const pu = ocPrecio(si) ?? p.precio_ref ?? 0;
      return { periodo: pe.nombre, desde: pe.desde, sucursal: su.nombre, sucursal_id: su.id, empresa: su.empresa, categoria: cat(p.categoria_id).nombre,
        producto: p.nombre, producto_id: p.id, proveedor: p.proveedor_id ? prov(p.proveedor_id).nombre : null,
        cantidad_solicitada: si.cantidad_solicitada, cantidad_aprobada: si.cantidad_aprobada || 0, estado_item: si.estado,
        precio_unit: pu, monto: (si.cantidad_aprobada || 0) * pu };
    }));
  },
  async precios() {
    return tick(db.precios.map(h => ({ producto: prod(h.producto_id).nombre, producto_id: h.producto_id, categoria: cat(prod(h.producto_id).categoria_id).nombre,
      proveedor: prov(h.proveedor_id).nombre, precio: h.precio, fecha: h.fecha, fuente: h.fuente })));
  },
  async tiempos() {
    return tick(db.solicitudes.map(s => {
      const ocs = db.solicitud_items.filter(x => x.solicitud_id === s.id && x.oc_id).map(x => db.ordenes_compra.find(o => o.id === x.oc_id)).filter(o => o?.enviada_at);
      const env = ocs.length ? Math.min(...ocs.map(o => +new Date(o.enviada_at))) : null;
      return { id: s.id, sucursal: suc(s.sucursal_id).nombre, created_at: s.created_at,
        horas_a_auditoria: s.auditada_at ? (new Date(s.auditada_at) - new Date(s.created_at)) / 36e5 : null,
        horas_a_oc: env && s.auditada_at ? (env - new Date(s.auditada_at)) / 36e5 : null };
    }));
  },

  async guardarProducto(p) {
    need('compras', 'admin');
    const ex = p.id && db.productos.find(x => x.id === p.id);
    if (ex) {
      if (p.precio_ref && +p.precio_ref !== +ex.precio_ref && p.proveedor_id)
        db.precios.push({ id: nextId('precios'), producto_id: ex.id, proveedor_id: +p.proveedor_id, precio: +p.precio_ref, fecha: new Date().toISOString().slice(0, 10), fuente: 'cotizacion' });
      Object.assign(ex, p);
    } else db.productos.push({ activo: true, ...p, id: nextId('productos') });
    save();
  },
  async guardarProveedor(p) {
    need('compras', 'admin');
    const ex = p.id && db.proveedores.find(x => x.id === p.id);
    if (ex) Object.assign(ex, p); else db.proveedores.push({ activo: true, ...p, id: nextId('proveedores') });
    save();
  },
  async guardarSucursal(s) {
    need('admin');
    const ex = s.id && db.sucursales.find(x => x.id === s.id);
    if (ex) Object.assign(ex, s); else db.sucursales.push({ activo: true, ...s, id: nextId('sucursales') });
    save();
  },
};
