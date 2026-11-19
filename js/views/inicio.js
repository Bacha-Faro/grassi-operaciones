// Inicio de Grassi Operaciones: una tarjeta por módulo con lo pendiente y "Para hacer hoy" con todo junto.
import { h, modal, field, toast } from '../ui.js?v=20261119-1503';

const saludo = () => { const hr = new Date().getHours(); return hr < 13 ? 'Buen día' : hr < 20 ? 'Buenas tardes' : 'Buenas noches'; };
const hoy = () => new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export async function render({ api, cat, me, go, modulos, vistas, badges, primera, MODULOS, logoModulo }) {
  const puede = v => vistas.includes(v);
  const sucursal = me.rol === 'solicitante';
  const nombre = sucursal ? null : (me.nombre || '').split(' ')[0] || null;

  // qué cuenta cada módulo (el número llega después, sin frenar la pantalla)
  const DATOS = {
    compras: [
      puede('auditoria') && ['pend', 'Pedidos para auditar', 'auditoria'],
      puede('compras') && ['oc', 'Órdenes por generar o enviar', 'compras'],
      puede('facturas') && ['fc', 'Facturas por revisar', 'facturas'],
      puede('mis-solicitudes') && ['rec', 'Pedidos para recibir', 'mis-solicitudes'],
    ].filter(Boolean),
    it: [
      puede('tickets') && ['tkit', 'Tickets nuevos', 'tickets'],
      puede('tickets') && ['tkcrit', 'Críticos sin responder', 'tickets', 'bad'],
      puede('soporte') && ['tk', 'Esperan tu respuesta', 'soporte'],
      puede('grabot') && ['gb', 'Mensajes de GraBot sin leer', 'grabot'],
    ].filter(Boolean),
    drogueria: [
      puede('temperatura') && ['temp', 'Lecturas de temperatura por cargar', 'temperatura'],
      puede('bachas') && ['bch', 'Bachas demoradas', 'bachas', 'bad'],
      puede('drog-recepcion') && ['rcp', 'Recepciones demoradas', 'drog-recepcion', 'bad'],
      puede('drog-expedicion') && ['exp', 'Salidas atrasadas sin registrar', 'drog-expedicion', 'bad'],
    ].filter(Boolean),
    analytics: [],
    rrhh: [
      puede('cobertura') && ['rhhoy', 'Ausentes hoy', 'cobertura'],
      puede('cobertura') && ['rhconf', 'Fechas a confirmar', 'cobertura'],
      puede('empleados') && ['rhsin', 'Personas sin sucursal', 'empleados', 'bad'],
    ].filter(Boolean),
  };
  const nums = {};   // clave → elemento del número
  const num = k => (nums[k] ||= []).push(h('strong', { class: 'mono' }, '·')) && nums[k].at(-1);

  const tarjeta = m => {
    const filas = DATOS[m].map(([k, l, v, tono]) => h('li', { class: tono ? `t-${tono}` : '' }, h('span', {}, l), num(k)));
    const acciones = m === 'compras' && puede('solicitar') && sucursal
      ? h('div', { class: 'mod-acciones' },
        h('button', { class: 'btn primary', onclick: e => { e.stopPropagation(); go('solicitar'); } }, 'Hacer el pedido'),
        h('button', { class: 'btn', onclick: e => { e.stopPropagation(); go('mis-solicitudes'); } }, 'Mis solicitudes'))
      : m === 'it' && puede('soporte') && !me.soporte
        ? h('div', { class: 'mod-acciones' }, h('button', { class: 'btn', onclick: e => { e.stopPropagation(); go('soporte'); } }, '+ Nuevo ticket'))
        : m === 'analytics' ? h('div', { class: 'mod-acciones' }, h('button', { class: 'btn', onclick: e => { e.stopPropagation(); go('tableros'); } }, 'Ver tableros')) : null;
    return h('article', { class: `mod-card mod-${m}` },
      h('a', { href: `#${primera(m)}`, class: 'mod-card-link', onclick: e => { e.preventDefault(); go(primera(m)); } },
        h('span', { class: 'mod-logo' }, logoModulo(MODULOS[m].logo)),
        h('span', { class: 'mod-desc' }, m === 'compras' && sucursal ? 'Los pedidos del mes se hacen del 20 al 25' : MODULOS[m].desc)),
      filas.length ? h('ul', { class: 'mod-nums' }, filas) : null,
      acciones);
  };

  const pendientes = h('ul', { class: 'hoy-lista' }, h('li', { class: 'muted' }, 'Revisando…'));
  badges.then(b => {
    for (const [k, els] of Object.entries(nums)) for (const el of els) el.textContent = b[k] ?? 0;
    const items = [];
    for (const m of modulos) for (const [k, l, v, tono] of DATOS[m]) if (b[k] && k !== 'rhhoy' && !(k === 'tkit' && b.tkcrit === b.tkit))
      items.push(h('li', {}, h('a', { href: `#${v}`, class: `hoy-item mod-${m}${tono ? ` t-${tono}` : ''}`, onclick: e => { e.preventDefault(); go(v); } },
        h('span', { class: 'hoy-barra' }), h('span', {}, h('strong', {}, `${b[k]} · ${l}`), h('small', {}, MODULOS[m].nombre)))));
    pendientes.replaceChildren(...(items.length ? items : [h('li', { class: 'muted hoy-vacio' }, 'Todo al día: no hay nada pendiente.')]));
  });

  // farmacias: la mercadería que despachó la Droguería y falta confirmar (así se mide la entrega real)
  const enCamino = h('div');
  if (sucursal && me.sucursal_id && api?.misEntregas) pintarEnCamino(api, enCamino, me.sucursal_id).catch(() => {});

  return h('div', { class: 'view inicio' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, hoy()),
      h('h1', {}, nombre ? `${saludo()}, ${nombre}` : saludo()),
      sucursal ? h('p', { class: 'muted' }, me.sucursal) : null)),
    enCamino,
    h('div', { class: 'inicio-grid' },
      h('div', { class: `mod-cards n${modulos.length}` }, modulos.map(tarjeta)),
      h('aside', { class: 'hoy' }, h('h2', {}, 'Para hacer hoy'), pendientes)));
}

const hora = iso => new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

async function pintarEnCamino(api, caja, suc) {
  const lista = (await api.misEntregas()).filter(s => !s.recibido_at && s.sucursal_id === suc);
  if (!lista.length) { caja.replaceChildren(); return; }
  const recibir = (s, ok) => {
    const bultos = h('input', { type: 'number', min: 0, max: 999, inputmode: 'numeric', value: s.bultos });
    const nota = h('input', { maxlength: 500, placeholder: 'Ej.: faltó una caja, llegó una bacha abierta…' });
    if (ok) return guardar(s, true, s.bultos, null).catch(() => {});
    modal({ title: 'Llegó con problemas',
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, `Salió con ${s.bultos} bulto${s.bultos === 1 ? '' : 's'}${s.bachas ? ` y ${s.bachas} bacha${s.bachas === 1 ? '' : 's'}` : ''}.`),
        field('Bultos que llegaron', bultos), field('Qué pasó', nota)),
      actions: [{ label: 'Cancelar' }, { label: 'Confirmar', kind: 'primary', onClick: async () => {
        if (!nota.value.trim()) { toast('Contá qué llegó mal', 'bad'); return false; }
        await guardar(s, false, bultos.value, nota.value.trim());
      } }] });
  };
  async function guardar(s, ok, bultos, nota) {
    try { await api.confirmarEntrega(s.id, ok, bultos, nota); toast(ok ? 'Gracias, quedó confirmada' : 'Avisamos a la Droguería'); await pintarEnCamino(api, caja, suc); }
    catch (e) { toast(e.message, 'bad'); throw e; }
  }
  caja.replaceChildren(h('section', { class: 'en-camino' },
    h('h2', {}, lista.length === 1 ? 'Mercadería en camino' : `Mercadería en camino · ${lista.length} envíos`),
    h('p', { class: 'muted' }, 'Cuando llegue, tocá "Llegó bien" o avisá si vino con problemas.'),
    h('ul', {}, lista.map(s => h('li', {},
      h('span', {}, h('strong', {}, `${s.bultos} bulto${s.bultos === 1 ? '' : 's'}${s.bachas ? ` + ${s.bachas} bacha${s.bachas === 1 ? '' : 's'}` : ''}`),
        h('small', { class: 'muted' }, ` · ${s.ola_nombre || 'Droguería'} · salió ${hora(s.salio_at)}`)),
      h('span', { class: 'toolbar' },
        h('button', { class: 'btn ok', onclick: () => recibir(s, true) }, 'Llegó bien'),
        h('button', { class: 'btn ghost-bad', onclick: () => recibir(s, false) }, 'Llegó con problemas')))))));
}
