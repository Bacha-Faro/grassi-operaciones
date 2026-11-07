// IT Grassi · piezas compartidas de la mesa de ayuda: estados, prioridades, tiempo de respuesta,
// alta de un ticket y el detalle con la conversación (lo usan Soporte IT y la bandeja de IT).
import { h, toast, modal, field, fechaHora, tkNum, empty } from '../ui.js?v=20261107-1537';

export const PRIORIDADES = [['critica', 'Crítica'], ['alta', 'Alta'], ['normal', 'Normal'], ['baja', 'Baja']];
export const PRIO_TXT = Object.fromEntries(PRIORIDADES);
const PRIO_TONO = { critica: 'bad', alta: 'warn', normal: 'info', baja: 'muted' };
export const prioPill = p => h('span', { class: `pill pill-${PRIO_TONO[p] || 'muted'} prio-${p}` }, PRIO_TXT[p] || p);

const ESTADO = {
  nuevo: ['Nuevo', 'Recibido', 'warn'], en_curso: ['En curso', 'En curso', 'info'],
  en_espera: ['Esperando a la sucursal', 'Esperando tu respuesta', 'warn'], resuelto: ['Resuelto', 'Resuelto: confirmalo', 'ok'],
  cerrado: ['Cerrado', 'Cerrado', 'done'], anulado: ['Anulado', 'Anulado', 'bad'],
};
export const estadoPill = (e, paraIT) => { const [a, b, tono] = ESTADO[e] || [e, e, 'muted']; return h('span', { class: `pill pill-${tono}` }, paraIT ? a : b); };
export const ABIERTOS = ['nuevo', 'en_curso', 'en_espera', 'resuelto'];

// ---- tiempo de primera respuesta, en horario de IT (lunes a viernes de 8 a 16) ----
const H_INI = 8, H_FIN = 16;
export const OBJETIVO_MIN = { critica: 2 * 60, alta: 8 * 60, normal: 16 * 60, baja: 24 * 60 };   // 2 h · 1 día · 2 días · 3 días hábiles
export const OBJETIVO_TXT = { critica: '2 horas', alta: '1 día hábil', normal: '2 días hábiles', baja: '3 días hábiles' };
const habil = d => d.getDay() >= 1 && d.getDay() <= 5;
// minutos de horario de IT entre dos momentos
export function minutosHabiles(desde, hasta) {
  let a = new Date(desde), b = new Date(hasta), total = 0;
  if (b <= a) return 0;
  const d = new Date(a); d.setHours(0, 0, 0, 0);
  while (d <= b) {
    if (habil(d)) {
      const ini = new Date(d); ini.setHours(H_INI, 0, 0, 0);
      const fin = new Date(d); fin.setHours(H_FIN, 0, 0, 0);
      const x = Math.max(ini, a), y = Math.min(fin, b);
      if (y > x) total += (y - x) / 60000;
    }
    d.setDate(d.getDate() + 1);
  }
  return Math.round(total);
}
// momento límite: suma minutos de horario de IT a partir de una fecha
export function sumarHabiles(desde, minutos) {
  let t = new Date(desde), resto = minutos;
  for (let i = 0; i < 400 && resto > 0; i++) {
    if (!habil(t) || t.getHours() >= H_FIN) { t.setDate(t.getDate() + 1); t.setHours(H_INI, 0, 0, 0); continue; }
    if (t.getHours() < H_INI) t.setHours(H_INI, 0, 0, 0);
    const fin = new Date(t); fin.setHours(H_FIN, 0, 0, 0);
    const disp = (fin - t) / 60000;
    if (resto <= disp) return new Date(t.getTime() + resto * 60000);
    resto -= disp; t = fin;
  }
  return t;
}
// estado del plazo de primera respuesta: { vence, vencido, respondido, enPlazo }
export function plazo(t, ahora = new Date()) {
  const vence = sumarHabiles(t.created_at, OBJETIVO_MIN[t.prioridad] || OBJETIVO_MIN.normal);
  if (t.primera_respuesta_at) return { vence, respondido: true, enPlazo: new Date(t.primera_respuesta_at) <= vence };
  return { vence, respondido: false, vencido: ahora > vence };
}
const corto = d => d.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export function plazoTag(t) {
  if (['resuelto', 'cerrado', 'anulado'].includes(t.estado) && !t.primera_respuesta_at) return null;
  const p = plazo(t);
  if (p.respondido) return null;
  return h('span', { class: `plazo ${p.vencido ? 'vencido' : ''}`, title: `Objetivo de primera respuesta: ${OBJETIVO_TXT[t.prioridad]}` },
    p.vencido ? `Respuesta vencida (${corto(p.vence)})` : `Responder antes del ${corto(p.vence)}`);
}

// ---- alta de un ticket ----
const recordar = { get: () => { try { return localStorage.getItem('tk-nombre') || ''; } catch { return ''; } },
  set: v => { try { localStorage.setItem('tk-nombre', v); } catch { /* sin storage */ } } };
export function nuevoTicket({ api, me, cats, sucursales, onDone }) {
  const esIT = !!me.soporte;
  const cat = h('select', { id: 'tk-cat', required: true }, h('option', { value: '' }, 'Elegí una…'), cats.map(c => h('option', { value: c.id }, c.nombre)));
  const ejemplo = h('small', { class: 'hint' }, ' ');
  cat.addEventListener('change', () => { ejemplo.textContent = cats.find(c => c.id === +cat.value)?.ejemplos || ' '; avisoClaves.hidden = !/usuario|acceso/i.test(cats.find(c => c.id === +cat.value)?.nombre || ''); });
  const suc = esIT ? h('select', { id: 'tk-suc' }, h('option', { value: '' }, 'Elegí sucursal o área…'), sucursales.map(s => h('option', { value: s.id }, s.nombre))) : null;
  const nombre = h('input', { id: 'tk-nombre', maxlength: 80, autocomplete: 'name', value: esIT ? 'IT' : recordar.get(), placeholder: 'Tu nombre' });
  const tel = h('input', { id: 'tk-tel', maxlength: 40, inputmode: 'tel', placeholder: 'Opcional' });
  const asunto = h('input', { id: 'tk-asunto', maxlength: 120, placeholder: 'Ej.: No imprime la impresora de caja' });
  const desc = h('textarea', { id: 'tk-desc', rows: 4, maxlength: 4000, placeholder: 'Qué pasa, desde cuándo y qué probaste' });
  const frena = h('input', { type: 'checkbox', id: 'tk-frena' });
  const archivos = h('input', { type: 'file', id: 'tk-arch', accept: 'image/*,application/pdf', multiple: true });
  const avisoClaves = h('div', { class: 'notice', hidden: true }, 'No escribas contraseñas en el ticket. Si hace falta una, IT te la pide por teléfono.');
  const btn = { label: 'Enviar a IT', kind: 'primary', onClick: async () => {
    const files = [...archivos.files];
    if (esIT && !suc.value) { toast('Elegí la sucursal o área', 'bad'); return false; }
    if (!cat.value) { toast('Elegí el tipo de problema', 'bad'); return false; }
    if (nombre.value.trim().length < 2) { toast('Escribí tu nombre', 'bad'); return false; }
    if (asunto.value.trim().length < 3) { toast('Escribí en una línea qué pasa', 'bad'); return false; }
    if (desc.value.trim().length < 3) { toast('Contá un poco más en la descripción', 'bad'); return false; }
    if (files.length > 3) { toast('Podés adjuntar hasta 3 archivos', 'bad'); return false; }
    if (files.some(f => f.size > 15 * 1024 * 1024)) { toast('Algún archivo es muy pesado (máx. 15 MB)', 'bad'); return false; }
    try {
      if (!esIT) recordar.set(nombre.value.trim());
      const r = await api.crearTicket({ sucursal_id: esIT ? +suc.value : null, solicitante_nombre: nombre.value.trim(), telefono: tel.value.trim(),
        categoria_id: +cat.value, asunto: asunto.value.trim(), descripcion: desc.value.trim(), frena_atencion: frena.checked, archivos: files });
      toast(`Ticket ${tkNum(r.id)} enviado a IT`);
      if (r.fallidos) toast(`${r.fallidos} archivo(s) no se pudieron subir`, 'bad');
      onDone?.(r.id);
    } catch (e) { toast(e.message, 'bad'); return false; }
  } };
  modal({ title: 'Nuevo ticket para IT', wide: true,
    body: h('div', { class: 'stack tk-form' },
      suc ? field('Sucursal o área', suc) : null,
      h('div', { class: 'grid2' }, field('Tipo de problema', cat, ejemplo), field('Tu nombre', nombre)),
      field('¿Qué pasa? (en una línea)', asunto),
      field('Descripción', desc),
      avisoClaves,
      h('label', { class: 'check-frena' }, frena, h('span', {}, h('strong', {}, 'Frena la atención al público o el cobro'), h('small', { class: 'muted', style: 'display:block' }, 'Por ejemplo: sin sistema, sin posnet o sin internet. IT lo atiende primero.'))),
      h('div', { class: 'grid2' }, field('Teléfono o interno', tel, 'Para que IT te llame si hace falta'), field('Fotos o archivos', archivos, 'Hasta 3: una foto del error o de la pantalla ayuda mucho'))),
    actions: [{ label: 'Cancelar' }, btn] });
}

// ---- detalle del ticket con la conversación ----
const ESTADO_EVT = { nuevo: 'Nuevo', en_curso: 'En curso', en_espera: 'En espera', resuelto: 'Resuelto', cerrado: 'Cerrado', anulado: 'Anulado' };
const evtTexto = e => e.tipo === 'creado' ? 'Ticket cargado'
  : e.tipo === 'estado' ? `Estado: ${e.detalle.split(' → ').map(x => ESTADO_EVT[x] || x).join(' → ')}`
  : e.tipo === 'prioridad' ? `Prioridad: ${e.detalle.split(' → ').map(x => PRIO_TXT[x] || x).join(' → ')}`
  : e.tipo === 'categoria' ? `Categoría: ${e.detalle}` : e.tipo;

export async function abrirTicket({ api, me, id, cats = [], onChange }) {
  const esIT = !!me.soporte;
  const cuerpo = h('div', { class: 'tk-detalle' }, h('div', { class: 'loading' }, 'Cargando…'));
  let cambio = false;
  const m = modal({ title: tkNum(id), wide: true, body: cuerpo, onClose: () => { if (cambio) onChange?.(); } });

  async function cargar() {
    let t;
    try { t = await api.ticket(id); } catch (e) { cuerpo.replaceChildren(empty('No se pudo abrir el ticket', e.message)); return; }
    if (!t) { cuerpo.replaceChildren(empty('Ticket no encontrado', 'Puede que sea de otra sucursal.')); return; }
    m.el.querySelector('.modal-head h3').textContent = `${tkNum(t.id)} · ${t.asunto}`;
    const abierto = !['cerrado', 'anulado'].includes(t.estado);
    const hecho = async (fn, ok) => { try { await fn(); cambio = true; if (ok) toast(ok); await cargar(); } catch (e) { toast(e.message, 'bad'); } };

    // cabecera
    const cab = h('div', { class: 'tk-cab' },
      estadoPill(t.estado, esIT), prioPill(t.prioridad), plazoTag(t),
      h('span', { class: 'muted' }, `${t.sucursal} · ${t.categoria} · ${t.solicitante_nombre}${t.telefono ? ` · ☎ ${t.telefono}` : ''} · ${fechaHora(t.created_at)}`));

    // archivos
    const archivos = t.archivos?.length ? h('div', { class: 'tk-archivos' }, t.archivos.map(a =>
      h('button', { class: 'chip-archivo', onclick: async () => {
        try { const url = await api.archivoTicketUrl(a.path); window.open(url, '_blank', 'noopener'); } catch (e) { toast(e.message, 'bad'); }
      } }, /pdf/.test(a.tipo || a.nombre) ? '📄 ' : '🖼️ ', a.nombre))) : null;

    // conversación + historial, en orden
    const linea = [
      { at: t.created_at, el: h('div', { class: 'msg msg-suc' }, h('div', { class: 'msg-meta' }, `${t.solicitante_nombre} · ${fechaHora(t.created_at)}`), h('p', {}, t.descripcion), archivos) },
      ...t.mensajes.map(x => ({ at: x.created_at, el: h('div', { class: `msg ${x.de_it ? 'msg-it' : 'msg-suc'}${x.interno ? ' msg-interno' : ''}` },
        h('div', { class: 'msg-meta' }, `${x.de_it ? 'IT' : x.autor_nombre}${x.interno ? ' · nota interna (la sucursal no la ve)' : ''} · ${fechaHora(x.created_at)}`),
        h('p', {}, x.texto)) })),
      ...t.eventos.filter(e => e.tipo !== 'creado').map(e => ({ at: e.created_at, el: h('div', { class: 'evt' }, `${evtTexto(e)} · ${fechaHora(e.created_at)}`) })),
    ].sort((a, b) => a.at.localeCompare(b.at)).map(x => x.el);
    const solucion = t.solucion && ['resuelto', 'cerrado'].includes(t.estado) ? h('div', { class: 'tk-solucion' }, h('strong', {}, 'Solución: '), t.solucion,
      t.cierre_automatico ? h('small', { class: 'muted', style: 'display:block' }, 'Se cerró solo: pasaron 5 días hábiles sin respuesta.') : null) : null;
    const anulado = t.estado === 'anulado' ? h('div', { class: 'notice' }, h('strong', {}, 'Anulado: '), t.motivo_anulacion) : null;

    // confirmación de la sucursal
    const confirmar = !esIT && t.estado === 'resuelto' ? (() => {
      const txt = h('textarea', { rows: 2, maxlength: 2000, hidden: true, placeholder: 'Si sigue pasando, contá qué pasa' });
      return h('div', { class: 'tk-confirmar' },
        h('strong', {}, 'IT lo dio por resuelto. ¿Quedó solucionado?'),
        h('small', { class: 'muted', style: 'display:block' }, 'Si no respondés, se cierra solo a los 5 días hábiles.'),
        h('div', { class: 'toolbar filters' },
          h('button', { class: 'btn primary', onclick: () => hecho(() => api.ticketConfirmar(t.id), '¡Gracias! Ticket cerrado') }, 'Sí, está resuelto'),
          h('button', { class: 'btn', onclick: () => { if (!txt.value.trim()) { txt.hidden = false; txt.focus(); toast('Contá qué sigue pasando', 'bad'); return; } hecho(() => api.ticketReabrir(t.id, txt.value.trim()), 'Ticket reabierto: IT lo vuelve a ver'); } }, 'No, sigue pasando')),
        txt);
    })() : null;

    // responder
    const nota = h('input', { type: 'checkbox', id: 'tk-interno' });
    const caja = h('textarea', { id: 'tk-msg', rows: 3, maxlength: 4000, placeholder: esIT ? 'Escribile a la sucursal…' : 'Escribile a IT…' });
    const responder = abierto && !(!esIT && t.estado === 'resuelto') ? h('div', { class: 'tk-responder' }, caja,
      h('div', { class: 'toolbar filters' },
        esIT ? h('label', { class: 'check-mini' }, nota, ' Nota interna') : null,
        esIT ? h('button', { class: 'btn', title: 'Envía el mensaje y deja el ticket esperando la respuesta de la sucursal', onclick: () => {
          if (!caja.value.trim()) return toast('Escribí la pregunta', 'bad');
          hecho(async () => { await api.ticketMensaje(t.id, caja.value.trim(), false); await api.ticketActualizar(t.id, { estado: 'en_espera' }); }, 'Pregunta enviada');
        } }, 'Preguntar y esperar') : null,
        h('button', { class: 'btn primary', onclick: () => {
          if (!caja.value.trim()) return toast('Escribí el mensaje', 'bad');
          hecho(() => api.ticketMensaje(t.id, caja.value.trim(), esIT && nota.checked), esIT && nota.checked ? 'Nota guardada' : 'Mensaje enviado');
        } }, 'Enviar'))) : null;

    // gestión (solo IT)
    const gestion = esIT && abierto ? (() => {
      const prio = h('select', { id: 'tk-prio', onchange: e => hecho(() => api.ticketActualizar(t.id, { prioridad: e.target.value }), 'Prioridad actualizada') },
        PRIORIDADES.map(([k, l]) => h('option', { value: k, selected: k === t.prioridad }, l)));
      const cat = h('select', { id: 'tk-cat2', onchange: e => hecho(() => api.ticketActualizar(t.id, { categoria_id: +e.target.value }), 'Categoría actualizada') },
        cats.map(c => h('option', { value: c.id, selected: c.id === t.categoria_id }, c.nombre)));
      const resolver = () => {
        const sol = h('textarea', { rows: 3, maxlength: 2000, value: t.solucion || '', placeholder: 'Qué se hizo, en una o dos líneas' });
        modal({ title: `Resolver ${tkNum(t.id)}`, body: h('div', { class: 'stack' }, field('Solución', sol, 'La sucursal la ve y confirma si quedó resuelto.')),
          actions: [{ label: 'Cancelar' }, { label: 'Marcar resuelto', kind: 'primary', onClick: async () => {
            if (!sol.value.trim()) { toast('Escribí qué se hizo', 'bad'); return false; }
            await hecho(() => api.ticketActualizar(t.id, { estado: 'resuelto', solucion: sol.value.trim() }), 'Ticket resuelto: la sucursal tiene que confirmarlo');
          } }] });
      };
      const anular = () => {
        const mot = h('input', { maxlength: 200, placeholder: 'Ej.: duplicado del T-0012' });
        modal({ title: `Anular ${tkNum(t.id)}`, body: h('div', { class: 'stack' }, field('Motivo', mot)),
          actions: [{ label: 'Cancelar' }, { label: 'Anular', kind: 'danger', onClick: async () => {
            if (!mot.value.trim()) { toast('Escribí el motivo', 'bad'); return false; }
            await hecho(() => api.ticketActualizar(t.id, { estado: 'anulado', motivo_anulacion: mot.value.trim() }), 'Ticket anulado');
          } }] });
      };
      return h('div', { class: 'tk-gestion' },
        h('label', { class: 'field tk-mini' }, h('span', { class: 'field-label' }, 'Prioridad'), prio),
        h('label', { class: 'field tk-mini' }, h('span', { class: 'field-label' }, 'Categoría'), cat),
        h('div', { class: 'tk-acciones' },
          t.estado === 'nuevo' ? h('button', { class: 'btn primary', onclick: () => hecho(() => api.ticketActualizar(t.id, { estado: 'en_curso' }), 'Ticket tomado: la sucursal recibe el aviso') }, 'Tomar ticket') : null,
          t.estado === 'en_espera' ? h('button', { class: 'btn', onclick: () => hecho(() => api.ticketActualizar(t.id, { estado: 'en_curso' })) }, 'Volver a En curso') : null,
          t.estado !== 'resuelto' ? h('button', { class: 'btn ok', onclick: resolver }, 'Resolver') : null,
          h('button', { class: 'link danger', onclick: anular }, 'Anular')));
    })() : null;

    cuerpo.replaceChildren(cab, gestion, anulado, h('div', { class: 'tk-linea' }, linea), solucion, confirmar, responder);
    const lin = cuerpo.querySelector('.tk-linea'); if (lin) lin.scrollTop = lin.scrollHeight;
  }
  await cargar();
}
