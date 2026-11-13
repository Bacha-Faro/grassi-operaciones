// Modo demo: misma interfaz que api-supabase.js, con datos en el navegador.
// Genera 11 meses de historia (dic-2025 a oct-2026) para que los indicadores tengan contenido.
import { EMPRESAS, SUCURSALES, CATEGORIAS, PROVEEDORES, PRODUCTOS } from './seed-data.js?v=20261113-1943';

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
  semillaTickets();
  semillaDrogueria();
  semillaRRHH();
  who = { id: 'demo', rol: 'solicitante', sucursal_id: 1, nombre: 'Suc 1' };
  save();
}
const NOMBRES = ['Laura Gómez', 'Martín Ríos', 'Carla Funes', 'Diego Sosa', 'Paula Ferreyra', 'Nicolás Paez', 'Sofía Bustos', 'Javier Molina', 'Romina Aguirre', 'Lucas Ledesma', 'Valeria Quiroga'];


// ---------- IT Grassi · tickets de ejemplo ----------
const IT_CATS = ['PC y notebooks', 'Impresoras y etiquetadoras', 'Posnet y cobros', 'Internet y red', 'Sistema de gestión', 'Usuarios y accesos', 'Teléfonos y celulares', 'Pedido o compra'];
const RRHH_SUC = 9;   // en la demo, RRHH carga sus tickets como "Centro (Planta Alta)"
function semillaTickets() {
  db.it_categorias = IT_CATS.map((nombre, i) => ({ id: i + 1, nombre, orden: i + 1, activo: true }));
  db.tickets = []; db.ticket_mensajes = []; db.ticket_eventos = []; db.seq.tickets = 0; db.seq.ticket_mensajes = 0; db.seq.ticket_eventos = 0;
  const hace = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const nuevo = (o, h) => { const id = nextId('tickets'); const t = { id, telefono: null, prioridad: o.frena_atencion ? 'critica' : 'normal', prioridad_confirmada: false, estado: 'nuevo',
    solucion: null, motivo_anulacion: null, reaperturas: 0, created_at: hace(h), primera_respuesta_at: null, resuelto_at: null, cerrado_at: null, cierre_automatico: false, updated_at: hace(h), ...o };
    db.tickets.push(t); evento(id, 'creado', null, t.created_at); return t; };
  const t1 = nuevo({ sucursal_id: 1, solicitante_nombre: 'Laura Gómez', categoria_id: 3, asunto: 'El posnet no conecta', descripcion: 'Desde las 9 el posnet de caja 1 dice "sin conexión". Ya lo reiniciamos dos veces.', frena_atencion: true }, 1.5);
  const t2 = nuevo({ sucursal_id: 4, solicitante_nombre: 'Diego Sosa', categoria_id: 2, asunto: 'La impresora de etiquetas imprime corrido', descripcion: 'Las etiquetas salen desplazadas, se imprime la mitad en una y la mitad en la otra.', frena_atencion: false }, 26);
  Object.assign(t2, { estado: 'en_curso', prioridad: 'alta', prioridad_confirmada: true, primera_respuesta_at: hace(24) });
  mensaje(t2.id, 'IT', true, false, '¿Cambiaron el rollo de etiquetas hace poco? Mandame una foto de cómo sale.', hace(24));
  mensaje(t2.id, 'Diego Sosa', false, false, 'Sí, ayer pusimos un rollo nuevo. Ahí te mando la foto.', hace(23));
  const t3 = nuevo({ sucursal_id: 1, solicitante_nombre: 'Martín Ríos', categoria_id: 1, asunto: 'La PC de atrás está muy lenta', descripcion: 'Tarda mucho en abrir el sistema y a veces se cuelga.', frena_atencion: false }, 80);
  Object.assign(t3, { estado: 'resuelto', primera_respuesta_at: hace(76), resuelto_at: hace(20), solucion: 'Se liberó espacio en disco y se desactivaron programas al inicio.' });
  mensaje(t3.id, 'IT', true, false, 'Me conecto de forma remota a las 14, dejala prendida.', hace(76));
}
// Soporte IT fase 2: equipos, respuestas rápidas y guías de ejemplo
function semillaIT2() {
  db.seq.it_equipos = 0; db.seq.it_respuestas = 0; db.seq.it_soluciones = 0;
  const eq = (o) => { const e = { id: nextId('it_equipos'), marca: null, modelo: null, serie: null, usuario: null, remoto: null, estado: 'en_uso', nota: null, ...o }; return e; };
  db.it_equipos = [
    eq({ sucursal_id: 1, tipo: 'pc', nombre: 'PC Caja 1', marca: 'Lenovo', modelo: 'ThinkCentre M70', serie: 'MJ0AB123', usuario: 'Caja 1', remoto: '123 456 789' }),
    eq({ sucursal_id: 1, tipo: 'pc', nombre: 'PC Atrás', marca: 'HP', modelo: 'ProDesk 400', usuario: 'Depósito' }),
    eq({ sucursal_id: 1, tipo: 'posnet', nombre: 'Posnet Caja 1', marca: 'Ingenico', modelo: 'Move/5000' }),
    eq({ sucursal_id: 1, tipo: 'impresora', nombre: 'Impresora mostrador', marca: 'Brother', modelo: 'HL-L2360' }),
    eq({ sucursal_id: 2, tipo: 'pc', nombre: 'PC Caja 1', marca: 'Dell', modelo: 'OptiPlex 3080' }),
    eq({ sucursal_id: 2, tipo: 'router', nombre: 'Router principal', marca: 'TP-Link', modelo: 'Archer C6' }),
    eq({ sucursal_id: 4, tipo: 'etiquetadora', nombre: 'Etiquetadora', marca: 'Zebra', modelo: 'GC420t' }),
    eq({ sucursal_id: 4, tipo: 'pc', nombre: 'PC Caja 2', marca: 'Lenovo', modelo: 'V50s', estado: 'en_reparacion', nota: 'Fuente quemada, en el service.' }),
    eq({ sucursal_id: null, tipo: 'notebook', nombre: 'Notebook de reemplazo', marca: 'HP', modelo: '240 G8', estado: 'en_deposito' }),
  ];
  const t1 = db.tickets.find(t => t.asunto === 'El posnet no conecta'); if (t1) t1.equipo_id = 3;
  const t2 = db.tickets.find(t => t.asunto.startsWith('La impresora de etiquetas')); if (t2) t2.equipo_id = 7;
  const t3 = db.tickets.find(t => t.asunto.startsWith('La PC de atrás')); if (t3) t3.equipo_id = 2;
  const cat = n => db.it_categorias.find(c => c.nombre === n)?.id ?? null;
  db.it_respuestas = [
    ['Conexión remota', 'Hola, me voy a conectar de forma remota para revisarlo. Dejá la PC prendida, abrí AnyDesk y pasame el número que aparece.'],
    ['Reiniciar el equipo', '¿Podés apagar el equipo por completo, esperar 30 segundos y volver a encenderlo? Contame si sigue pasando.'],
    ['Foto del error', '¿Me mandás una foto de la pantalla con el error? Así lo veo mejor.'],
    ['Voy a la sucursal', 'Paso por la sucursal a revisarlo. Te aviso el horario.'],
    ['Probar y confirmar', 'Ya lo solucioné desde acá. ¿Podés probar y confirmarme si anda?'],
  ].map(([titulo, texto], i) => ({ id: nextId('it_respuestas'), categoria_id: null, titulo, texto, orden: i + 1, activo: true }));
  db.it_soluciones = [
    [cat('Impresoras y etiquetadoras'), 'La impresora no imprime', 'Fijate que esté encendida, con papel y sin luces de error.\nSi hay papel trabado, abrí la tapa y sacalo con cuidado.\nApagala, esperá 30 segundos y volvé a prenderla.\nEn la PC, cancelá los documentos que quedaron en cola y volvé a imprimir.'],
    [cat('Internet y red'), 'No hay internet', 'Fijate si los otros equipos de la sucursal tienen internet.\nApagá el router y el módem, esperá 1 minuto y prendelos.\nEsperá unos 3 minutos a que se conecten.\nSi sigue sin andar, cargá el ticket y marcá si frena la atención.'],
    [cat('PC y notebooks'), 'La PC está lenta o colgada', 'Guardá lo que estés haciendo.\nCerrá los programas que no estés usando.\nReiniciá la PC (Inicio → Reiniciar; no la apagues del botón).\nSi sigue igual, cargá el ticket con una foto de la pantalla.'],
    [cat('Posnet y cobros'), 'El posnet no conecta', 'Apagá el posnet y volvé a prenderlo.\nFijate que tenga señal (wifi o chip) o el cable conectado.\nProbá una operación.\nSi sigue sin andar, cobrá con otro medio y cargá el ticket marcando que frena la atención.'],
  ].map(([categoria_id, titulo, pasos], i) => ({ id: nextId('it_soluciones'), categoria_id, titulo, pasos, orden: 1, activo: true, updated_at: new Date().toISOString() }));
  const hace = d => new Date(Date.now() - d * 86400e3).toISOString();
  db.it_soluciones_usos = [{ solucion_id: 1, sucursal_id: 2, created_at: hace(3) }, { solucion_id: 2, sucursal_id: 5, created_at: hace(6) }, { solucion_id: 1, sucursal_id: 1, created_at: hace(9) }];
}
function evento(ticket_id, tipo, detalle, at) { db.ticket_eventos.push({ id: nextId('ticket_eventos'), ticket_id, tipo, detalle, created_at: at || new Date().toISOString() }); }
function mensaje(ticket_id, autor_nombre, de_it, interno, texto, at) {
  const m = { id: nextId('ticket_mensajes'), ticket_id, autor_nombre, de_it, interno, texto, created_at: at || new Date().toISOString() };
  db.ticket_mensajes.push(m); return m;
}
const esIT = () => who.rol === 'admin';
const miSucTk = () => who.sucursal_id || (who.rol === 'auditor' ? RRHH_SUC : null);
const tkVisible = t => esIT() || t.sucursal_id === miSucTk();
const tkRowDemo = t => ({ ...t, sucursal: suc(t.sucursal_id)?.nombre, categoria: db.it_categorias.find(c => c.id === t.categoria_id)?.nombre, equipo: (db.it_equipos || []).find(e => e.id === t.equipo_id)?.nombre || null });
function cambiarEstadoTk(t, estado, extra = {}) {
  const antes = t.estado; if (antes === estado) return;
  const ahora = new Date().toISOString();
  if (estado === 'resuelto' && !String(extra.solucion ?? t.solucion ?? '').trim()) throw new Error('Escribí qué se hizo para resolverlo');
  if (estado === 'anulado' && !String(extra.motivo_anulacion ?? '').trim()) throw new Error('Indicá el motivo para anular el ticket');
  if (['en_curso', 'en_espera', 'resuelto'].includes(estado) && antes === 'nuevo' && !t.primera_respuesta_at) t.primera_respuesta_at = ahora;
  if (estado === 'resuelto') t.resuelto_at = ahora;
  if (['cerrado', 'anulado'].includes(estado)) t.cerrado_at = ahora;
  if (antes === 'resuelto' && estado === 'en_curso') { t.reaperturas++; t.resuelto_at = null; }
  t.estado = estado; evento(t.id, 'estado', `${antes} → ${estado}`);
}


// ---------- Droguería: bachas y temperatura de ejemplo ----------
const fechaAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const TURNOS_DIA = d => { const w = new Date(`${d}T12:00:00`).getDay(); return w === 0 ? [] : w === 6 ? ['08:10', '12:00'] : ['08:10', '12:00', '15:30', '18:50']; };
function semillaDrogueria() {
  db.bachas = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, codigo: `BCH-${String(i + 1).padStart(4, '0')}`, activa: true, nota: null }));
  db.bacha_mov = []; db.seq.bacha_mov = 0;
  db.temp_puntos = [
    { id: 1, nombre: 'Depósito · punto 1', tipo: 'ambiente', mide_humedad: true, t_min: 15, t_max: 30, h_min: 40, h_max: 70, orden: 1, activo: true },
    { id: 2, nombre: 'Depósito · punto 2', tipo: 'ambiente', mide_humedad: true, t_min: 15, t_max: 30, h_min: 40, h_max: 70, orden: 2, activo: true },
    { id: 3, nombre: 'Cámara de frío', tipo: 'frio', mide_humedad: false, t_min: 2, t_max: 8, h_min: null, h_max: null, orden: 3, activo: true }];
  db.temp_lecturas = []; db.seq.temp_lecturas = 0;
  let semilla = 7; const r = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;
  const ahora = Date.now();
  // salidas de los últimos días (algunas ya volvieron, otras están afuera o vencidas)
  for (let k = 0; k < 46; k++) {
    const b = 1 + Math.floor(r() * 100), sid = 1 + Math.floor(r() * 6), dias = Math.floor(r() * 7);
    const t = new Date(ahora - dias * 86400e3 - r() * 4 * 3600e3).toISOString();
    const ult = db.bacha_mov.filter(m => m.bacha_id === b).at(-1);
    if (ult?.tipo === 'salida') continue;
    db.bacha_mov.push({ id: nextId('bacha_mov'), bacha_id: b, tipo: 'salida', sucursal_id: sid, retorno_esperado: fechaAR(new Date(new Date(t).getTime() + 3 * 86400e3)), observacion: null, usuario_nombre: 'Droguería', created_at: t });
    if (dias > 1 && r() < 0.65) db.bacha_mov.push({ id: nextId('bacha_mov'), bacha_id: b, tipo: 'retorno', sucursal_id: null, retorno_esperado: null, observacion: null, usuario_nombre: 'Droguería', created_at: new Date(new Date(t).getTime() + (1 + r()) * 86400e3).toISOString() });
  }
  db.bacha_mov.sort((a, b) => a.created_at.localeCompare(b.created_at));
  // lecturas de los últimos 30 días (hoy, solo las que ya pasaron)
  const hoy = fechaAR(), hhmm = new Date(ahora - 3 * 3600e3).toISOString().slice(11, 16);
  for (let d = 30; d >= 0; d--) {
    const f = fechaAR(new Date(ahora - d * 86400e3));
    for (const turno of TURNOS_DIA(f)) {
      if (f === hoy && turno > hhmm) continue;
      for (const p of db.temp_puntos) {
        const base = p.tipo === 'frio' ? 4.5 + r() * 2 : 21 + (turno >= '12:00' ? 3 : 0) + r() * 3 + (p.id === 2 ? 1.2 : 0);
        const temperatura = Math.round((base + (d === 9 && p.tipo === 'frio' && turno === '15:30' ? 4.4 : 0)) * 10) / 10;
        const humedad = p.mide_humedad ? Math.round((48 + r() * 14) * 10) / 10 : null;
        const fuera = temperatura < p.t_min || temperatura > p.t_max || (p.mide_humedad && (humedad < p.h_min || humedad > p.h_max));
        db.temp_lecturas.push({ id: nextId('temp_lecturas'), punto_id: p.id, fecha: f, turno, temperatura, humedad, fuera_rango: fuera, accion: fuera ? 'Se revisó el cierre de la puerta; a los 30 min marcaba 6,8 °C' : null, usuario_nombre: 'Droguería', created_at: new Date().toISOString() });
      }
    }
  }
}
// RRHH: empleados y ausencias de ejemplo (nombres inventados)
const RRHH_NOMBRES = ['Ana Bustos', 'Bruno Cabrera', 'Carla Díaz', 'Damián Escobar', 'Elena Funes', 'Federico Gil', 'Gisela Herrera', 'Hugo Ibáñez', 'Inés Juárez',
  'Julián Luna', 'Karina Medina', 'Leandro Núñez', 'Marina Ortiz', 'Nahuel Peralta', 'Olga Quinteros', 'Pablo Ramos', 'Rocío Suárez', 'Sergio Toledo', 'Tamara Urquiza',
  'Valeria Vera', 'Walter Zárate', 'Yanina Acosta', 'Ezequiel Benítez', 'Florencia Castro'];
function semillaRRHH() {
  const r = rng(41); db.rrhh_empleados = []; db.rrhh_ausencias = [];
  const sucs = [1, 2, 3, 4, 5, 6, 10];
  RRHH_NOMBRES.forEach((nombre, i) => db.rrhh_empleados.push({ id: nextId('rrhh_empleados'), nombre, sucursal_id: i < 21 ? sucs[i % sucs.length] : null,
    puesto: i % 4 === 0 ? 'Farmacéutico/a' : 'Vendedor/a', acuerdo_sabado: ['franquera', 'manana_fija', 'por_medio', null][i % 4], horas_semana: [36, 40, 44][i % 3],
    dias_vacaciones: [14, 21, 14, 28][i % 4], activo: true, nota: i >= 21 ? 'Falta indicar la sucursal.' : null, created_at: new Date().toISOString() }));
  const lunes = d => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const mas = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const base = lunes(fechaAR());
  for (const e of db.rrhh_empleados) for (let k = 0; k < (r() < 0.4 ? 2 : 1); k++) {
    const desde = mas(base, Math.floor(r() * 26) * 7 - 14 + (k ? 0 : Math.floor(r() * 3))), dias = k ? 7 : [7, 14, 14][Math.floor(r() * 3)];
    const aprox = r() < 0.35;
    db.rrhh_ausencias.push({ id: nextId('rrhh_ausencias'), empleado_id: e.id, tipo: 'vacaciones', desde, hasta: mas(desde, dias - 1), dias, periodo: +desde.slice(0, 4) - (+desde.slice(5, 7) < 10 ? 1 : 0),
      titulo: null, nota: aprox ? 'Importada del Excel: el Excel solo indica la semana, confirmar la fecha exacta.' : null, aproximada: aprox, usuario_nombre: 'RRHH', created_at: new Date().toISOString() });
  }
  const d1 = mas(base, 3), d2 = mas(base, 9);
  db.rrhh_ausencias.push({ id: nextId('rrhh_ausencias'), empleado_id: 2, tipo: 'dia_libre', desde: d1, hasta: d1, dias: 1, periodo: null, titulo: null, nota: 'Cumpleaños', aproximada: false, usuario_nombre: 'RRHH', created_at: new Date().toISOString() });
  db.rrhh_ausencias.push({ id: nextId('rrhh_ausencias'), empleado_id: 5, tipo: 'evento', desde: d2, hasta: d2, dias: 1, periodo: null, titulo: 'Entrega de título', nota: null, aproximada: false, usuario_nombre: 'RRHH', created_at: new Date().toISOString() });
}
const esRRHH = () => ['auditor', 'admin', 'direccion'].includes(who.rol);
const esDrog = () => ['admin', 'direccion'].includes(who.rol) || who.sucursal_id === 7;

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
  return { ...o, proveedor: p.nombre, proveedor_email: p.email, interno: !!p.interno, con_iva: !!p.precios_con_iva, periodo: per(o.periodo_id)?.nombre,
    total: its.reduce((a, x) => a + x.cantidad * x.precio_unit, 0), n_items: its.length,
    total_recibido: its.some(x => x.cantidad_recibida !== null && x.cantidad_recibida !== undefined) ? its.reduce((a, x) => a + (Number(x.cantidad_recibida) || 0) * x.precio_unit, 0) : null };
}
const visible = s => who.rol !== 'solicitante' || s.sucursal_id === who.sucursal_id;
const tick = v => new Promise(r => setTimeout(() => r(clone(v)), 60));
const need = (...roles) => { if (!roles.includes(who.rol)) throw new Error('Tu rol no tiene permiso para esta acción'); };

// ---------- API pública ----------
export const api = {
  // ---------- Analytics (en la demo, tableros de ejemplo sin link real) ----------
  // Conciliación Droguería → farmacias (datos de prueba hasta conectar Quantio y Plex)
  async conciliacion({ desde, hasta } = {}) {
    let x = 20261113; const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const PRODS = ['Ibuprofeno 400 mg x 20', 'Paracetamol 500 mg x 20', 'Amoxicilina 500 mg x 16', 'Omeprazol 20 mg x 28', 'Enalapril 10 mg x 30', 'Losartán 50 mg x 30',
      'Metformina 850 mg x 60', 'Atorvastatina 20 mg x 30', 'Diclofenac 75 mg x 15', 'Loratadina 10 mg x 10', 'Salbutamol aerosol', 'Insulina NPH 10 ml',
      'Alcohol en gel 250 ml', 'Gasas estériles x 10', 'Jeringa 5 ml x 100', 'Protector solar FPS 50'];
    const farmacias = db.sucursales.filter(s => s.tipo === 'sucursal');
    const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const sumar = (f, d) => { const t = new Date(`${f}T12:00:00`); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
    const filas = []; let nro = 41200;
    for (let d = 45; d >= 0; d--) {
      const f = sumar(hoy, -d), w = new Date(`${f}T12:00:00`).getDay();
      if (w === 0) continue;
      for (const s of farmacias) {
        const cant = w === 6 ? (rnd() < 0.4 ? 1 : 0) : 1 + (rnd() < 0.5 ? 1 : 0);
        for (let k = 0; k < cant; k++) {
          const surtido = [...PRODS].sort(() => rnd() - 0.5);
          const renglones = Array.from({ length: 3 + Math.floor(rnd() * 6) }, (_, j) => {
            const c = 1 + Math.floor(rnd() * 12);
            return { producto: surtido[j], cantidad: c, lote: `L${Math.floor(rnd() * 90000 + 10000)}`, vence: sumar(hoy, 200 + Math.floor(rnd() * 500)), precio: Math.round(1500 + rnd() * 18000) };
          });
          const unid = renglones.reduce((a, r) => a + r.cantidad, 0);
          const tipo = rnd() < 0.7 ? 'remito' : 'factura';
          const num = `${tipo === 'remito' ? 'R' : 'A'} 0003-${String(++nro).padStart(8, '0')}`;
          let ingreso = null; const r = rnd();
          if (d >= 1 && !(d <= 2 && r < 0.35) && !(r > 0.965)) {
            const demora = Math.min(d, rnd() < 0.1 ? 3 + Math.floor(rnd() * 3) : rnd() < 0.55 ? 0 : 1);
            const dif = rnd() < 0.09 ? -(1 + Math.floor(rnd() * 3)) : rnd() < 0.02 ? 1 : 0;
            ingreso = { fecha: sumar(f, demora), estado: rnd() < 0.05 ? 'N' : rnd() < 0.5 ? 'U' : 'C', unidades_facturadas: unid, unidades_recibidas: unid + dif, idcomprobante: 900000 + nro };
          }
          filas.push({ id: nro, fecha: f, tipo, comprobante: num, sucursal_id: s.id, sucursal: s.nombre, unidades: unid,
            total: renglones.reduce((a, r) => a + r.cantidad * r.precio, 0), renglones, ingreso });
        }
      }
    }
    return tick({ modo: 'demo', filas: filas.filter(f => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta)) });
  },
  async feriados() { return tick([{ fecha: '2026-11-23', nombre: 'Día de la Soberanía Nacional', tipo: 'feriado' }, { fecha: '2026-12-08', nombre: 'Inmaculada Concepción de María', tipo: 'feriado' }, { fecha: '2026-12-25', nombre: 'Navidad', tipo: 'feriado' }]); },
  async tableros() {
    if (!['admin', 'direccion', 'analista'].includes(who.rol)) return tick([]);
    db.tableros ||= [
      { id: 1, titulo: 'Ventas por sucursal', descripcion: 'Facturación diaria y mensual de las 13 sucursales.', area: 'Gerencia', url: 'https://app.powerbi.com/view?r=ejemplo1', orden: 1, activo: true },
      { id: 2, titulo: 'Stock y quiebres', descripcion: 'Cobertura de stock y faltantes por droguería.', area: 'Operaciones', url: 'https://app.powerbi.com/view?r=ejemplo2', orden: 2, activo: true },
      { id: 3, titulo: 'Resultados del mes', descripcion: 'Ingresos, gastos y margen por razón social.', area: 'Dirección', url: 'https://app.powerbi.com/view?r=ejemplo3', orden: 3, activo: true }];
    return tick(db.tableros);
  },
  async guardarTablero(t) {
    need('admin'); if (!/^https:\/\/app\.powerbi\.com\//.test(t.url)) throw new Error('El link tiene que ser de app.powerbi.com');
    const campos = { titulo: t.titulo.trim(), descripcion: t.descripcion || null, area: t.area || null, url: t.url.trim(), orden: +t.orden || 0, activo: t.activo !== false };
    let x = t.id && db.tableros.find(y => y.id === t.id);
    if (x) Object.assign(x, campos); else db.tableros.push(x = { id: Math.max(0, ...db.tableros.map(y => y.id)) + 1, ...campos });
    save(); return tick(x);
  },
  async borrarTablero(id) { need('admin'); db.tableros = db.tableros.filter(t => t.id !== id); save(); },
  // ---------- RRHH ----------
  async rrhhEmpleados() { if (!esRRHH()) return tick([]); return tick([...db.rrhh_empleados].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))); },
  async rrhhGuardarEmpleado(e) {
    need('auditor', 'admin');
    const campos = { nombre: e.nombre.trim(), sucursal_id: e.sucursal_id ? +e.sucursal_id : null, puesto: e.puesto || null, acuerdo_sabado: e.acuerdo_sabado || null,
      horas_semana: e.horas_semana === '' || e.horas_semana == null ? null : +e.horas_semana, dias_vacaciones: e.dias_vacaciones === '' || e.dias_vacaciones == null ? null : +e.dias_vacaciones,
      activo: e.activo !== false, nota: e.nota || null };
    let x = e.id && db.rrhh_empleados.find(y => y.id === e.id);
    if (x) Object.assign(x, campos); else db.rrhh_empleados.push(x = { id: nextId('rrhh_empleados'), ...campos, created_at: new Date().toISOString() });
    save(); return tick(x);
  },
  async rrhhUnificar(origen, destino) {
    need('auditor', 'admin');
    db.rrhh_ausencias.forEach(a => { if (a.empleado_id === origen) a.empleado_id = destino; });
    db.rrhh_empleados = db.rrhh_empleados.filter(e => e.id !== origen); save();
  },
  async rrhhAusencias(desde = null, hasta = null) {
    if (!esRRHH()) return tick([]);
    return tick(db.rrhh_ausencias.filter(a => (!desde || a.hasta >= desde) && (!hasta || a.desde <= hasta)).sort((a, b) => a.desde.localeCompare(b.desde)));
  },
  async rrhhGuardarAusencia(a) {
    need('auditor', 'admin');
    if (a.hasta < a.desde) throw new Error('La fecha "hasta" no puede ser anterior a "desde"');
    const campos = { empleado_id: +a.empleado_id, tipo: a.tipo, desde: a.desde, hasta: a.hasta, dias: +a.dias, periodo: a.periodo ? +a.periodo : null, titulo: a.titulo || null, nota: a.nota || null, aproximada: !!a.aproximada };
    let x = a.id && db.rrhh_ausencias.find(y => y.id === a.id);
    if (x) Object.assign(x, campos); else db.rrhh_ausencias.push(x = { id: nextId('rrhh_ausencias'), ...campos, usuario_nombre: who.nombre || 'RRHH', created_at: new Date().toISOString() });
    save(); return tick(x);
  },
  async rrhhBorrarAusencia(id) { need('auditor', 'admin'); db.rrhh_ausencias = db.rrhh_ausencias.filter(a => a.id !== id); save(); },

  modo: 'demo',
  async init() { if (!load()) construir(); if (!db.tickets) { semillaTickets(); save(); } if (!db.bachas) { semillaDrogueria(); save(); } if (!db.rrhh_empleados) { semillaRRHH(); save(); } if (!db.it_equipos) { semillaIT2(); save(); } },
  async reset() { construir(); },
  async me() {
    const s = who.sucursal_id ? suc(who.sucursal_id) : null;
    return tick({ ...who, email: s?.email || `${who.rol}@grupograssi.com`, sucursal: s?.nombre || null, soporte: who.rol === 'admin', drogueria: who.sucursal_id === 7, analytics: ['admin', 'direccion', 'analista'].includes(who.rol) });
  },
  usuariosDemo() {
    return [
      ...db.sucursales.map(s => ({ key: `s${s.id}`, label: `${s.nombre} · solicitante`, rol: 'solicitante', sucursal_id: s.id, nombre: s.nombre })),
      { key: 'auditor', label: 'RRHH · auditoría', rol: 'auditor', sucursal_id: null, nombre: 'RRHH' },
      { key: 'compras', label: 'Compras', rol: 'compras', sucursal_id: null, nombre: 'Compras' },
      { key: 'admin', label: 'Administrador', rol: 'admin', sucursal_id: null, nombre: 'Admin' },
      { key: 'direccion', label: 'Gerencia y dirección', rol: 'direccion', sucursal_id: null, nombre: 'Dirección' },
      { key: 'analista', label: 'Contabilidad (solo Analytics)', rol: 'analista', sucursal_id: null, nombre: 'Contabilidad' },
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
    const { achicarImagen } = await import('./ui.js?v=20261113-1943');
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
  // ---------------- IT Grassi · Mesa de ayuda ----------------
  async itCategorias() { return tick(db.it_categorias.filter(c => c.activo)); },
  async tickets() { return tick(db.tickets.filter(tkVisible).map(tkRowDemo).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
  async ticket(id) {
    const t = db.tickets.find(x => x.id === id && tkVisible(x)); if (!t) return tick(null);
    return tick({ ...tkRowDemo(t), mensajes: db.ticket_mensajes.filter(m => m.ticket_id === id && (esIT() || !m.interno)),
      eventos: db.ticket_eventos.filter(e => e.ticket_id === id), archivos: (db.ticket_archivos || []).filter(a => a.ticket_id === id) });
  },
  async crearTicket({ sucursal_id, solicitante_nombre, telefono, categoria_id, asunto, descripcion, frena_atencion, equipo_id, archivos = [] }) {
    const sid = esIT() ? +sucursal_id : miSucTk();
    const eqOk = equipo_id && (db.it_equipos || []).some(e => e.id === +equipo_id && e.sucursal_id === sid) ? +equipo_id : null;
    if (!sid) throw new Error('Elegí la sucursal o área');
    if (String(asunto || '').trim().length < 3) throw new Error('Escribí el asunto');
    const id = nextId('tickets'); const at = new Date().toISOString();
    db.tickets.push({ id, sucursal_id: sid, solicitante_nombre, telefono: telefono || null, categoria_id: +categoria_id, asunto, descripcion, frena_atencion: !!frena_atencion, equipo_id: eqOk,
      prioridad: frena_atencion ? 'critica' : 'normal', prioridad_confirmada: false, estado: 'nuevo', solucion: null, motivo_anulacion: null, reaperturas: 0,
      created_at: at, primera_respuesta_at: null, resuelto_at: null, cerrado_at: null, cierre_automatico: false, updated_at: at });
    evento(id, 'creado', null, at);
    db.ticket_archivos ||= [];
    for (const f of archivos) db.ticket_archivos.push({ ticket_id: id, path: `${id}/${f.name}`, nombre: f.name, tipo: f.type, demo: true });
    save(); return tick({ id, fallidos: 0 });
  },
  async archivoTicketUrl() { throw new Error('En la demo los archivos no se guardan'); },
  async ticketMensaje(id, texto, interno = false) {
    const t = db.tickets.find(x => x.id === id && tkVisible(x)); if (!t) throw new Error('Ticket no encontrado');
    if (['cerrado', 'anulado'].includes(t.estado)) throw new Error('El ticket está cerrado');
    const m = mensaje(id, esIT() ? 'IT' : who.nombre, esIT(), esIT() && !!interno, texto);
    if (esIT() && !interno && !t.primera_respuesta_at) t.primera_respuesta_at = m.created_at;
    if (!esIT() && t.estado === 'en_espera') cambiarEstadoTk(t, 'en_curso');
    save(); return tick(m.id);
  },
  async ticketActualizar(id, cambios) {
    if (!esIT()) throw new Error('Solo IT puede cambiar el ticket');
    const t = db.tickets.find(x => x.id === id);
    if (cambios.prioridad && cambios.prioridad !== t.prioridad) { evento(id, 'prioridad', `${t.prioridad} → ${cambios.prioridad}`); t.prioridad = cambios.prioridad; t.prioridad_confirmada = true; }
    if (cambios.categoria_id && +cambios.categoria_id !== t.categoria_id) { t.categoria_id = +cambios.categoria_id; evento(id, 'categoria', 'cambio de categoría'); }
    if ('equipo_id' in cambios && (cambios.equipo_id || null) !== (t.equipo_id || null)) { t.equipo_id = cambios.equipo_id ? +cambios.equipo_id : null; evento(id, 'equipo', db.it_equipos.find(e => e.id === t.equipo_id)?.nombre || 'sin equipo'); }
    if ('solucion' in cambios) t.solucion = cambios.solucion;
    if ('motivo_anulacion' in cambios) t.motivo_anulacion = cambios.motivo_anulacion;
    if (cambios.estado) cambiarEstadoTk(t, cambios.estado, cambios);
    save(); return tick(true);
  },
  async ticketConfirmar(id) { const t = db.tickets.find(x => x.id === id && tkVisible(x)); if (t?.estado !== 'resuelto') throw new Error('El ticket no está para confirmar'); cambiarEstadoTk(t, 'cerrado'); save(); return tick(true); },
  async ticketReabrir(id, texto) {
    if (!String(texto || '').trim()) throw new Error('Contá qué sigue pasando');
    const t = db.tickets.find(x => x.id === id && tkVisible(x)); if (t?.estado !== 'resuelto') throw new Error('El ticket no se puede reabrir');
    cambiarEstadoTk(t, 'en_curso'); mensaje(id, who.nombre, false, false, `Sigue pasando: ${texto.trim()}`); save(); return tick(true);
  },
  // ---- Soporte IT fase 2 ----
  async itEquipos() { return tick((db.it_equipos || []).filter(e => esIT() || (e.sucursal_id === miSucTk() && e.estado !== 'de_baja')).sort((a, b) => a.nombre.localeCompare(b.nombre))); },
  async guardarEquipo(e) {
    if (!esIT()) throw new Error('Solo IT');
    const c = { ...e, nombre: String(e.nombre || '').trim(), sucursal_id: e.sucursal_id ? +e.sucursal_id : null };
    for (const k of ['marca', 'modelo', 'serie', 'usuario', 'remoto', 'nota']) c[k] = String(c[k] ?? '').trim() || null;
    if (c.nombre.length < 2) throw new Error('Poné un nombre');
    const ex = c.id && db.it_equipos.find(x => x.id === c.id);
    if (ex) Object.assign(ex, c); else { c.id = nextId('it_equipos'); db.it_equipos.push(c); }
    save(); return tick(c.id);
  },
  async itRespuestas() { if (!esIT()) return tick([]); return tick([...db.it_respuestas].sort((a, b) => a.orden - b.orden)); },
  async guardarRespuesta(x) { if (!esIT()) throw new Error('Solo IT'); const ex = x.id && db.it_respuestas.find(r => r.id === x.id); const c = { activo: true, ...x, categoria_id: x.categoria_id ? +x.categoria_id : null }; if (ex) Object.assign(ex, c); else db.it_respuestas.push({ ...c, id: nextId('it_respuestas') }); save(); return tick(true); },
  async borrarRespuesta(id) { db.it_respuestas = db.it_respuestas.filter(r => r.id !== id); save(); return tick(true); },
  async itSoluciones() { return tick(db.it_soluciones.filter(x => x.activo || esIT()).sort((a, b) => a.orden - b.orden)); },
  async guardarSolucion(x) { if (!esIT()) throw new Error('Solo IT'); const ex = x.id && db.it_soluciones.find(r => r.id === x.id); const c = { ...x, categoria_id: x.categoria_id ? +x.categoria_id : null, updated_at: new Date().toISOString() }; if (ex) Object.assign(ex, c); else db.it_soluciones.push({ activo: true, ...c, id: nextId('it_soluciones') }); save(); return tick(true); },
  async borrarSolucion(id) { db.it_soluciones = db.it_soluciones.filter(r => r.id !== id); save(); return tick(true); },
  async solucionSirvio(id) { db.it_soluciones_usos.push({ solucion_id: id, sucursal_id: miSucTk(), created_at: new Date().toISOString() }); save(); return tick(true); },
  async itSolucionesUsos() { return tick(esIT() ? [...db.it_soluciones_usos] : []); },
  async guardarPush() { return tick(true); },
  async quitarPush() { return tick(true); },
  async probarPush() { return tick({ ok: true, enviados: 0, simulado: true }); },
  // ---------------- Droguería ----------------
  async bachas() {
    if (!esDrog()) return tick([]);
    const hoy = fechaAR();
    return tick(db.bachas.filter(b => b.activa).map(b => {
      const m = db.bacha_mov.filter(x => x.bacha_id === b.id).at(-1);
      const afuera = m?.tipo === 'salida';
      return { ...b, estado: afuera ? (m.retorno_esperado < hoy ? 'vencida' : 'afuera') : 'disponible', sucursal_id: afuera ? m.sucursal_id : null,
        sucursal: afuera ? suc(m.sucursal_id)?.nombre : null, desde: m?.created_at || null, retorno_esperado: afuera ? m.retorno_esperado : null, usuario_nombre: m?.usuario_nombre || null };
    }));
  },
  async bachaHistorial(id) { return tick(db.bacha_mov.filter(m => m.bacha_id === id).slice(-20).reverse().map(m => ({ ...m, sucursal: m.sucursal_id ? suc(m.sucursal_id)?.nombre : null }))); },
  async bachaMovimiento({ bacha_id, tipo, sucursal_id = null, retorno_esperado = null, observacion = null }) {
    if (!esDrog()) throw new Error('Sin permiso');
    const ult = db.bacha_mov.filter(m => m.bacha_id === bacha_id).at(-1);
    if (tipo === 'salida' && ult?.tipo === 'salida') throw new Error('La bacha ya figura afuera: registrá primero el retorno');
    if (tipo === 'retorno' && (ult?.tipo || 'retorno') === 'retorno') throw new Error('La bacha ya está en la Droguería');
    if (tipo === 'salida' && !sucursal_id) throw new Error('Elegí la sucursal');
    db.bacha_mov.push({ id: nextId('bacha_mov'), bacha_id, tipo, sucursal_id: tipo === 'salida' ? +sucursal_id : null, retorno_esperado: tipo === 'salida' ? retorno_esperado : null,
      observacion: observacion || null, usuario_nombre: who.nombre, created_at: new Date().toISOString() });
    save(); return tick(true);
  },
  async tempPuntos() { return tick(esDrog() ? db.temp_puntos.filter(p => p.activo) : []); },
  async tempLecturas(desde, hasta) { return tick(esDrog() ? db.temp_lecturas.filter(l => l.fecha >= desde && l.fecha <= hasta) : []); },
  async tempGuardar(filas) {
    if (!esDrog()) throw new Error('Sin permiso');
    for (const f of filas) {
      const p = db.temp_puntos.find(x => x.id === f.punto_id);
      if (p.mide_humedad && (f.humedad === null || f.humedad === undefined || f.humedad === '')) throw new Error(`Falta la humedad de ${p.nombre}`);
      const fuera = f.temperatura < p.t_min || f.temperatura > p.t_max || (p.mide_humedad && (f.humedad < p.h_min || f.humedad > p.h_max));
      if (fuera && !String(f.accion || '').trim()) throw new Error(`${p.nombre} está fuera de rango: anotá qué se hizo (acción correctiva)`);
    }
    for (const f of filas) {
      const p = db.temp_puntos.find(x => x.id === f.punto_id);
      const fuera = f.temperatura < p.t_min || f.temperatura > p.t_max || (p.mide_humedad && (f.humedad < p.h_min || f.humedad > p.h_max));
      const prev = db.temp_lecturas.find(l => l.punto_id === f.punto_id && l.fecha === f.fecha && l.turno === f.turno);
      const fila = { punto_id: f.punto_id, fecha: f.fecha, turno: f.turno, temperatura: +f.temperatura, humedad: p.mide_humedad ? +f.humedad : null, fuera_rango: fuera, accion: f.accion || null, usuario_nombre: who.nombre };
      if (prev) Object.assign(prev, fila, { updated_at: new Date().toISOString() }); else db.temp_lecturas.push({ id: nextId('temp_lecturas'), ...fila, created_at: new Date().toISOString() });
    }
    save(); return tick(true);
  },
};
