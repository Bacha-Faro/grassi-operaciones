// Shell de la app: sesión, navegación por rol y enrutado por #vista.
import { api } from './api.js?v=20261104-1250';
import { h, toast, field, modal, carrito } from './ui.js?v=20261104-1250';

const VISTAS = {
  solicitar:         { label: 'Nueva solicitud', mod: () => import('./views/solicitar.js?v=20261104-1250'),   roles: ['solicitante', 'auditor', 'compras', 'admin'] },
  'mis-solicitudes': { label: 'Mis solicitudes', mod: () => import('./views/solicitudes.js?v=20261104-1250'), roles: ['solicitante'], badge: 'rec' },
  auditoria:         { label: 'Auditoría',       mod: () => import('./views/auditoria.js?v=20261104-1250'),   roles: ['auditor', 'admin'], badge: 'pend' },
  solicitudes:       { label: 'Solicitudes',     mod: () => import('./views/solicitudes.js?v=20261104-1250'), roles: ['auditor', 'compras', 'admin'] },
  compras:           { label: 'Compras',         mod: () => import('./views/compras.js?v=20261104-1250'),     roles: ['compras', 'admin'], badge: 'oc' },
  facturas:          { label: 'Facturas',        mod: () => import('./views/facturas.js?v=20261104-1250'),    roles: ['auditor', 'compras', 'admin'], badge: 'fc' },
  indicadores:       { label: 'Indicadores',     mod: () => import('./views/indicadores.js?v=20261104-1250'), roles: ['auditor', 'compras', 'admin'] },
  catalogo:          { label: 'Catálogo',        mod: () => import('./views/catalogo.js?v=20261104-1250'),    roles: ['compras', 'admin'] },
  usuarios:          { label: 'Usuarios',        mod: () => import('./views/usuarios.js?v=20261104-1250'),    roles: ['admin'], soporte: true },
};
const INICIO = { solicitante: 'solicitar', auditor: 'auditoria', compras: 'compras', admin: 'auditoria' };
const ROL = { solicitante: 'Sucursal', auditor: 'Auditoría (RRHH)', compras: 'Compras', admin: 'Administrador' };

// Logo de la app: "de compras" + grassi (las OC, PDF y mails a proveedores siguen con el logo oficial logo-grassi.png)
const logo = cls => [h('img', { class: `${cls} logo-claro`, src: 'img/logo-compras.png', alt: 'Grassi de compras' }), h('img', { class: `${cls} logo-oscuro`, src: 'img/logo-compras-claro.png', alt: 'Grassi de compras' })];
// Tema: claro, oscuro o automático (sigue al sistema). Se recuerda en este navegador.
const TEMAS = [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Auto']];
const leerTema = () => { try { return localStorage.getItem('insumos-tema') || 'auto'; } catch { return 'auto'; } };
function aplicarTema(t) {
  const r = document.documentElement;
  if (t === 'claro') r.dataset.theme = 'light'; else if (t === 'oscuro') r.dataset.theme = 'dark'; else delete r.dataset.theme;
}
aplicarTema(leerTema());
function selectorTema() {
  const box = h('div', { class: 'tema-sel', role: 'radiogroup', 'aria-label': 'Tema de la app' });
  const pintar = () => box.replaceChildren(...TEMAS.map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(leerTema() === k), class: leerTema() === k ? 'on' : '',
    onclick: () => { try { localStorage.setItem('insumos-tema', k); } catch { /* sin storage */ } aplicarTema(k); pintar(); } }, l)));
  pintar(); return box;
}
const app = document.getElementById('app');
// Contacto de soporte (IT) y si la app está embebida (GrassiNet, Google Sites)
const IT_TEL = '358 4164 187';
const enIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
let me = null, ruta = null, catCache = null, turno = 0;
// El catálogo casi no cambia: se trae una vez y se reutiliza al navegar (se refresca en Catálogo y con refresh)
async function catalogo(fresco) { if (fresco || !catCache) catCache = await api.catalogo(); return catCache; }

function irA(v) { ruta = v; try { history.replaceState(null, '', `#${v}`); } catch { /* sin history */ } pintar(); }

// Contadores del menú: se piden todos juntos y se completan cuando llegan, sin frenar la pantalla
async function badges() {
  const out = {}, tareas = [];
  const t = (k, f) => tareas.push(f().then(v => { out[k] = v; }).catch(() => {}));
  if (['auditor', 'admin'].includes(me.rol)) t('pend', async () => (await api.solicitudes({ estado: 'pendiente' })).length);
  if (['compras', 'admin'].includes(me.rol)) t('oc', async () => {
    const [p, o] = await Promise.all([api.pendientesOC(), api.ordenes()]);
    return new Set(p.map(x => `${x.proveedor_id}|${x.empresa}`)).size + o.filter(x => x.estado === 'borrador').length;
  });
  if (me.rol === 'solicitante') t('rec', async () => (await api.recepciones()).filter(r => r.pendiente).length);
  if (['auditor', 'compras', 'admin'].includes(me.rol)) t('fc', async () => (await api.facturas()).filter(f => f.estado === 'recibida').length);
  await Promise.all(tareas);
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
    h('button', { class: 'link', onclick: async () => { await api.reset(); catCache = null; me = await api.me(); toast('Datos de ejemplo restaurados'); irA(INICIO[me.rol]); } }, 'Reiniciar datos'));
}

async function pintar(fresco = false) {
  const mio = ++turno;   // si se navega rápido, solo la última pantalla pedida se dibuja
  const permitidas = Object.entries(VISTAS).filter(([, v]) => v.roles.includes(me.rol) && (!v.soporte || me.soporte));
  if (!permitidas.some(([k]) => k === ruta)) ruta = INICIO[me.rol];
  const cupos = {};
  const nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' }, permitidas.map(([k, v]) =>
    h('a', { href: `#${k}`, class: `nav-item${k === ruta ? ' on' : ''}`, 'aria-current': k === ruta ? 'page' : null, onclick: e => { e.preventDefault(); irA(k); } },
      h('span', {}, v.label), v.badge ? (cupos[v.badge] = h('span', { class: 'badge', hidden: true })) : null)));
  badges().then(b => { for (const [k, el] of Object.entries(cupos)) if (b[k]) { el.textContent = b[k]; el.hidden = false; } });
  const main = h('main', { class: 'main', id: 'main' }, h('div', { class: 'loading' }, 'Cargando…'));

  app.replaceChildren(
    demoBar(),
    h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'brand' }, h('img', { class: 'brand-iso', src: 'img/isotipo.png', alt: 'Farmacias Grassi · Insumos' }), carrito('mini solo-movil'),
          h('div', { class: 'brand-logo' }, logo(''), h('span', { class: 'brand-app' }, carrito('mini'), 'Insumos'))),
        nav,
        h('button', { type: 'button', class: 'cuenta-movil', 'aria-label': 'Mi cuenta: tema, contraseña y salir', onclick: () => cuentaMovil() },
          h('span', { 'aria-hidden': 'true', html: ICONO_CUENTA })),
        h('div', { class: 'who' }, h('strong', {}, me.sucursal || me.nombre || me.email), h('small', {}, ROL[me.rol]),
          selectorTema(),
          enIframe ? h('a', { class: 'link abrir-fuera', href: location.href, target: '_blank', rel: 'noopener' }, 'Abrir en pestaña nueva ↗') : null,
          api.modo !== 'demo' ? h('div', { class: 'who-actions' },
            me.soporte ? h('button', { class: 'link', onclick: () => cambiarClave() }, 'Cambiar contraseña') : null,
            h('button', { class: 'link', onclick: async () => { await api.logout(); inicio(); } }, 'Salir')) : null)),
      main));

  try {
    const [cat, { render }] = await Promise.all([catalogo(fresco || ruta === 'catalogo'), VISTAS[ruta].mod()]);
    const el = await render({ api, me, cat, go: irA, refresh: () => pintar(true) });
    if (mio === turno) main.replaceChildren(el);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'empty' }, h('strong', {}, 'No se pudo cargar esta sección'), h('p', {}, e.message)));
  }
}

// En el celular la barra lateral no entra: la cuenta (tema, contraseña, salir) se abre desde un botón arriba a la derecha
const ICONO_CUENTA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
function cuentaMovil() {
  const m = modal({ title: 'Mi cuenta',
    body: h('div', { class: 'stack cuenta-body' },
      h('div', {}, h('strong', {}, me.sucursal || me.nombre || me.email), h('small', { class: 'muted', style: 'display:block' }, `${ROL[me.rol]} · ${me.email}`)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tema de la pantalla'), selectorTema()),
      enIframe ? h('a', { class: 'link', href: location.href, target: '_blank', rel: 'noopener' }, 'Abrir la app en pestaña nueva ↗') : null,
      me.soporte ? null : h('small', { class: 'muted' }, `¿Problemas con la contraseña? Llamá a IT: ${IT_TEL}.`)),
    actions: api.modo !== 'demo' ? [
      me.soporte ? { label: 'Cambiar contraseña', onClick: () => { setTimeout(() => cambiarClave(), 0); } } : null,
      { label: 'Salir', kind: 'primary', onClick: async () => { await api.logout(); inicio(); } }].filter(Boolean) : [{ label: 'Cerrar' }] });
  return m;
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
    h('div', { class: 'login-logo' }, logo(''), h('span', { class: 'brand-app login-sub' }, carrito('llega'), 'Pedidos de insumos')),
    h('p', { class: 'muted' }, 'Ingresá con el mail de tu sucursal o sector.'),
    field('Mail', email), field('Contraseña', pass), btn,
    h('p', { class: 'muted login-ayuda' }, '¿Olvidaste la contraseña o no podés entrar? Llamá a IT: ', h('a', { href: `tel:+54${IT_TEL.replace(/\D/g, '')}` }, IT_TEL), '.')),
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
