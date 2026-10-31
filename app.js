// Shell de la app: sesión, navegación por rol y enrutado por #vista.
import { api } from './api.js';
import { h, toast, field, modal } from './ui.js';

const VISTAS = {
  solicitar:         { label: 'Nueva solicitud', mod: () => import('./views/solicitar.js'),   roles: ['solicitante', 'auditor', 'compras', 'admin'] },
  'mis-solicitudes': { label: 'Mis solicitudes', mod: () => import('./views/solicitudes.js'), roles: ['solicitante'] },
  auditoria:         { label: 'Auditoría',       mod: () => import('./views/auditoria.js'),   roles: ['auditor', 'admin'], badge: 'pend' },
  solicitudes:       { label: 'Solicitudes',     mod: () => import('./views/solicitudes.js'), roles: ['auditor', 'compras', 'admin'] },
  compras:           { label: 'Compras',         mod: () => import('./views/compras.js'),     roles: ['compras', 'admin'], badge: 'oc' },
  facturas:          { label: 'Facturas',        mod: () => import('./views/facturas.js'),    roles: ['auditor', 'compras', 'admin'], badge: 'fc' },
  indicadores:       { label: 'Indicadores',     mod: () => import('./views/indicadores.js'), roles: ['auditor', 'compras', 'admin'] },
  catalogo:          { label: 'Catálogo',        mod: () => import('./views/catalogo.js'),    roles: ['compras', 'admin'] },
};
const INICIO = { solicitante: 'solicitar', auditor: 'auditoria', compras: 'compras', admin: 'auditoria' };
const ROL = { solicitante: 'Sucursal', auditor: 'Auditoría (RRHH)', compras: 'Compras', admin: 'Administrador' };

const logo = cls => [h('img', { class: `${cls} logo-claro`, src: 'img/logo-grassi.png', alt: 'Farmacias Grassi' }), h('img', { class: `${cls} logo-oscuro`, src: 'img/logo-grassi-claro.png', alt: 'Farmacias Grassi' })];
const app = document.getElementById('app');
let me = null, ruta = null;

function irA(v) { ruta = v; try { history.replaceState(null, '', `#${v}`); } catch { /* sin history */ } pintar(); }

async function badges() {
  const out = {};
  try {
    if (['auditor', 'admin'].includes(me.rol)) out.pend = (await api.solicitudes({ estado: 'pendiente' })).length;
    if (['compras', 'admin'].includes(me.rol)) {
      const [p, o] = await Promise.all([api.pendientesOC(), api.ordenes()]);
      out.oc = new Set(p.map(x => `${x.proveedor_id}|${x.empresa}`)).size + o.filter(x => x.estado === 'borrador').length;
    }
    if (['auditor', 'compras', 'admin'].includes(me.rol)) out.fc = (await api.facturas()).filter(f => f.estado === 'recibida').length;
  } catch { /* nada */ }
  return out;
}

function demoBar() {
  if (api.modo !== 'demo') return null;
  const us = api.usuariosDemo();
  const actual = us.find(u => u.rol === me.rol && (u.sucursal_id ?? null) === (me.sucursal_id ?? null))?.key;
  return h('div', { class: 'demo-bar' },
    h('span', { class: 'demo-tag' }, 'Demo'),
    h('label', { class: 'demo-who' }, h('span', {}, 'Ver como'),
      h('select', { id: 'demo-user', onchange: async e => { await api.cambiarUsuario(us.find(u => u.key === e.target.value)); me = await api.me(); irA(INICIO[me.rol]); } },
        us.map(u => h('option', { value: u.key, selected: u.key === actual }, u.label)))),
    h('button', { class: 'link', onclick: async () => { await api.reset(); me = await api.me(); toast('Datos de ejemplo restaurados'); irA(INICIO[me.rol]); } }, 'Reiniciar datos'));
}

async function pintar() {
  const permitidas = Object.entries(VISTAS).filter(([, v]) => v.roles.includes(me.rol));
  if (!permitidas.some(([k]) => k === ruta)) ruta = INICIO[me.rol];
  const b = await badges();
  const nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' }, permitidas.map(([k, v]) =>
    h('a', { href: `#${k}`, class: `nav-item${k === ruta ? ' on' : ''}`, 'aria-current': k === ruta ? 'page' : null, onclick: e => { e.preventDefault(); irA(k); } },
      h('span', {}, v.label), v.badge && b[v.badge] ? h('span', { class: 'badge' }, b[v.badge]) : null)));
  const main = h('main', { class: 'main', id: 'main' }, h('div', { class: 'loading' }, 'Cargando…'));

  app.replaceChildren(
    demoBar(),
    h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'brand' }, h('img', { class: 'brand-iso', src: 'img/isotipo.png', alt: 'Farmacias Grassi · Insumos' }),
          h('div', { class: 'brand-logo' }, logo(''), h('span', { class: 'brand-app' }, 'Insumos'))),
        nav,
        h('div', { class: 'who' }, h('strong', {}, me.sucursal || me.nombre || me.email), h('small', {}, ROL[me.rol]),
          api.modo !== 'demo' ? h('div', { class: 'who-actions' },
            h('button', { class: 'link', onclick: () => cambiarClave() }, 'Cambiar contraseña'),
            h('button', { class: 'link', onclick: async () => { await api.logout(); inicio(); } }, 'Salir')) : null)),
      main));

  try {
    const cat = await api.catalogo();
    const { render } = await VISTAS[ruta].mod();
    const el = await render({ api, me, cat, go: irA, refresh: () => pintar() });
    main.replaceChildren(el);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'empty' }, h('strong', {}, 'No se pudo cargar esta sección'), h('p', {}, e.message)));
  }
}

function cambiarClave(recuperacion = false) {
  const p1 = h('input', { id: 'cc-1', type: 'password', autocomplete: 'new-password', minlength: 8 });
  const p2 = h('input', { id: 'cc-2', type: 'password', autocomplete: 'new-password' });
  modal({ title: recuperacion ? 'Elegí tu contraseña nueva' : 'Cambiar contraseña',
    body: h('div', { class: 'stack' }, field('Contraseña nueva', p1, 'Mínimo 8 caracteres'), field('Repetila', p2)),
    actions: [recuperacion ? null : { label: 'Cancelar' }, { label: 'Guardar', kind: 'primary', onClick: async () => {
      if (p1.value.length < 8) { toast('La contraseña tiene que tener al menos 8 caracteres', 'bad'); return false; }
      if (p1.value !== p2.value) { toast('Las dos contraseñas no coinciden', 'bad'); return false; }
      try { await api.cambiarClave(p1.value); toast('Contraseña actualizada'); if (recuperacion) inicio(); }
      catch (e) { toast(e.message, 'bad'); return false; }
    } }].filter(Boolean) });
}

function login() {
  const email = h('input', { id: 'l-mail', type: 'email', required: true, autocomplete: 'username', placeholder: 'suc1@grupograssi.com' });
  const pass = h('input', { id: 'l-pass', type: 'password', required: true, autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Ingresar');
  app.replaceChildren(h('div', { class: 'login' }, h('form', { class: 'login-card', onsubmit: async e => {
    e.preventDefault(); btn.disabled = true;
    try { await api.login(email.value.trim(), pass.value); await inicio(); }
    catch (err) { toast(err.message === 'Invalid login credentials' ? 'Mail o contraseña incorrectos' : err.message, 'bad'); btn.disabled = false; }
  } },
    h('div', { class: 'login-logo' }, logo(''), h('span', { class: 'brand-app' }, 'Pedidos de insumos')),
    h('p', { class: 'muted' }, 'Ingresá con el mail de tu sucursal o sector.'),
    field('Mail', email), field('Contraseña', pass), btn,
    h('button', { type: 'button', class: 'link', onclick: async () => {
      if (!email.value) return toast('Escribí tu mail primero', 'warn');
      try { await api.recuperar(email.value.trim()); toast('Te mandamos un mail para crear una contraseña nueva'); } catch (e) { toast(e.message, 'bad'); }
    } }, 'Olvidé mi contraseña')),
    h('p', { class: 'creditos' }, h('img', { src: 'img/ganimedes.png', alt: '' }), h('span', {}, 'Desarrollado por ', h('strong', {}, 'Ganímedes Lab')))));
}

async function inicio() {
  await api.init();
  me = await api.me();
  if (!me) return login();
  if (me.rol === 'solicitante' && !me.sucursal_id) {
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' }, h('strong', {}, 'Tu usuario no tiene sucursal asignada'),
      h('p', { class: 'muted' }, 'Pedile al administrador que asocie tu mail a una sucursal o sector.'),
      h('p', { class: 'muted mono' }, me.email),
      h('button', { class: 'btn', onclick: async () => { await api.logout(); inicio(); } }, 'Salir'))));
    return;
  }
  ruta = (location.hash || '').slice(1) || null;
  pintar();
}

api.alRecuperar?.(() => cambiarClave(true));
inicio();
