// Shell de Grassi Operaciones: sesión, módulos (De compras · IT · Droguería), navegación por rol y enrutado por #vista.
// Escritorio: barra angosta de módulos + menú del módulo + contenido. Celular: barra arriba, pestañas del módulo y barra de módulos abajo.
import { api } from './api.js?v=20261111-1253';
import { h, toast, field, modal } from './ui.js?v=20261111-1253';

const VISTAS = {
  inicio:            { label: 'Inicio',          mod: () => import('./views/inicio.js?v=20261111-1253'),      roles: ['solicitante', 'auditor', 'compras', 'admin', 'direccion'], grupo: 'inicio' },
  // De compras
  solicitar:         { label: 'Nueva solicitud', mod: () => import('./views/solicitar.js?v=20261111-1253'),   roles: ['solicitante', 'auditor', 'compras', 'admin'] },
  'mis-solicitudes': { label: 'Mis solicitudes', mod: () => import('./views/solicitudes.js?v=20261111-1253'), roles: ['solicitante'], badge: 'rec' },
  auditoria:         { label: 'Auditoría',       mod: () => import('./views/auditoria.js?v=20261111-1253'),   roles: ['auditor', 'admin'], badge: 'pend' },
  solicitudes:       { label: 'Solicitudes',     mod: () => import('./views/solicitudes.js?v=20261111-1253'), roles: ['auditor', 'compras', 'admin', 'direccion'] },
  compras:           { label: 'Compras',         mod: () => import('./views/compras.js?v=20261111-1253'),     roles: ['compras', 'admin', 'direccion'], badge: 'oc' },
  facturas:          { label: 'Facturas',        mod: () => import('./views/facturas.js?v=20261111-1253'),    roles: ['auditor', 'compras', 'admin', 'direccion'], badge: 'fc' },
  indicadores:       { label: 'Indicadores',     mod: () => import('./views/indicadores.js?v=20261111-1253'), roles: ['auditor', 'compras', 'admin', 'direccion'] },
  catalogo:          { label: 'Catálogo',        mod: () => import('./views/catalogo.js?v=20261111-1253'),    roles: ['compras', 'admin', 'direccion'] },
  // IT Grassi
  tickets:           { label: 'Tickets',         mod: () => import('./views/tickets.js?v=20261111-1253'),     roles: ['admin'], soporte: true, grupo: 'it', badge: 'tkit' },
  soporte:           { label: 'Soporte IT',      mod: () => import('./views/soporte.js?v=20261111-1253'),     roles: ['solicitante', 'auditor', 'compras', 'admin', 'direccion'], sinSoporte: true, grupo: 'it', badge: 'tk' },
  usuarios:          { label: 'Usuarios',        mod: () => import('./views/usuarios.js?v=20261111-1253'),    roles: ['admin'], soporte: true, grupo: 'it' },
  // Droguería (lo ve IT y quien tenga perfiles.drogueria; mientras DROGUERIA_PARA_TODOS sea false, solo IT)
  drogueria:         { label: 'Tablero',         mod: () => import('./views/drogueria.js?v=20261111-1253'),   roles: ['solicitante', 'auditor', 'compras', 'admin', 'direccion'], drog: true, grupo: 'drogueria' },
  temperatura:       { label: 'Temperatura y humedad', mod: () => import('./views/temperatura.js?v=20261111-1253'), roles: ['solicitante', 'auditor', 'compras', 'admin', 'direccion'], drog: true, grupo: 'drogueria', badge: 'temp' },
  // RRHH: solo lo ven RRHH (auditor) y administración
  cobertura:         { label: 'Cobertura',       mod: () => import('./views/cobertura.js?v=20261111-1253'),   roles: ['auditor', 'admin', 'direccion'], grupo: 'rrhh' },
  empleados:         { label: 'Empleados',       mod: () => import('./views/empleados.js?v=20261111-1253'),   roles: ['auditor', 'admin', 'direccion'], grupo: 'rrhh', badge: 'rhsin' },
  // Grassi Analytics: tableros de Power BI (IT y quien tenga perfiles.analytics)
  tableros:          { label: 'Tableros',        mod: () => import('./views/tableros.js?v=20261111-1253'),    roles: ['solicitante', 'auditor', 'compras', 'admin', 'direccion'], ana: true, grupo: 'analytics' },
  bachas:            { label: 'Bachas',          mod: () => import('./views/bachas.js?v=20261111-1253'),      roles: ['solicitante', 'auditor', 'compras', 'admin', 'direccion'], drog: true, grupo: 'drogueria', badge: 'bch' },
};
// Íconos de los módulos (trazo, toman el color del texto)
const ICONOS = {
  inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  drogueria: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  compras: '<path d="M3 4h2l2.4 11h11.2L21 8H7"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  it: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>',
  analytics: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/>',
  rrhh: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.9 0 5 2.2 5 5"/>',
};
const icono = (k, size = 22) => h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[k]}</svg>` });
const MODULOS = {
  drogueria: { nombre: 'Droguería', logo: 'drogueria', desc: 'Módulo logístico, controles y métricas' },
  compras:   { nombre: 'De compras', logo: 'compras', desc: 'Pedidos de insumos, auditoría y compra' },
  it:        { nombre: 'Soporte IT', logo: 'it', desc: 'Tickets de soporte para sucursales y áreas' },
  rrhh:      { nombre: 'RRHH', logo: 'rrhh', desc: 'Gestión de empleados: horarios, francos y vacaciones' },
  analytics: { nombre: 'Analytics', logo: 'analytics', desc: 'Tableros de gestión de Power BI' },
};
// Quién ve qué: Droguería, solo IT (DROGUERIA_PARA_TODOS). RRHH, solo RRHH y admin. Analytics, IT y perfiles.analytics. De compras y Soporte IT, todos.
const ORDEN_MODULOS = ['drogueria', 'compras', 'it', 'rrhh', 'analytics'];
// IT Grassi: con true lo ven todos (cada uno carga y sigue sus tickets en "Soporte IT"); IT atiende desde "Tickets".
// (en la demo se ve siempre)
const IT_PARA_TODOS = true;
// (en la demo se puede ocultar IT con localStorage 'demo-sin-it', para sacar capturas como las ve hoy una sucursal)
const demoConIT = () => { try { return api.modo === 'demo' && !localStorage.getItem('demo-sin-it'); } catch { return api.modo === 'demo'; } };
const itVisible = () => IT_PARA_TODOS || demoConIT() || me?.soporte;
const DROGUERIA_PARA_TODOS = false;
const drogVisible = () => !!(me?.soporte || me?.rol === 'direccion' || ((DROGUERIA_PARA_TODOS || api.modo === 'demo') && me?.drogueria));
// Gerencia y dirección: ven todo en solo lectura (la base no les deja cambiar nada; acá se esconden los botones de acción)
const soloLectura = () => me?.rol === 'direccion';
const ROL = { solicitante: 'Sucursal', auditor: 'Auditoría (RRHH)', compras: 'Compras', admin: 'Administrador', direccion: 'Gerencia y dirección' };
const grupoDe = v => v.grupo || 'compras';

// Logos (las OC, PDF y mails a proveedores siguen con el logo oficial logo-grassi.png)
const logoModulo = (m, cls = '') => [
  h('img', { class: `${cls} logo-claro`, src: `img/logo-${m}.png`, alt: `Grassi ${MODULOS[m]?.nombre || ''}` }),
  h('img', { class: `${cls} logo-oscuro`, src: `img/logo-${m}-claro.png`, alt: `Grassi ${MODULOS[m]?.nombre || ''}` })];
// Logo "Grassi Operaciones" chico (menú lateral en Inicio)
const marcaOperaciones = () => h('span', { class: 'op-mini' }, h('span', { class: 'op-mini-txt' }, 'operaciones'),
  h('img', { class: 'logo-claro', src: 'img/grassi-marca.png', alt: 'Grassi Operaciones' }), h('img', { class: 'logo-oscuro', src: 'img/grassi-marca-claro.png', alt: 'Grassi Operaciones' }));
// Tema: claro, oscuro o automático (sigue al sistema). Se recuerda en este navegador.
const TEMAS = [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Auto']];
const CLAVE_TEMA = 'grassi-tema';   // por defecto, claro
const leerTema = () => { try { return localStorage.getItem(CLAVE_TEMA) || 'claro'; } catch { return 'claro'; } };
function aplicarTema(t) {
  const r = document.documentElement;
  if (t === 'claro') r.dataset.theme = 'light'; else if (t === 'oscuro') r.dataset.theme = 'dark'; else delete r.dataset.theme;
}
aplicarTema(leerTema());
function selectorTema() {
  const box = h('div', { class: 'tema-sel', role: 'radiogroup', 'aria-label': 'Tema de la app' });
  const pintar = () => box.replaceChildren(...TEMAS.map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(leerTema() === k), class: leerTema() === k ? 'on' : '',
    onclick: () => { try { localStorage.setItem(CLAVE_TEMA, k); } catch { /* sin storage */ } aplicarTema(k); pintar(); } }, l)));
  pintar(); return box;
}
const app = document.getElementById('app');
// Contacto de soporte (IT) y si la app está embebida (GrassiNet, Google Sites)
const IT_TEL = '358 4164 187';
const enIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
let me = null, ruta = null, catCache = null, turno = 0, abrirParams = null;
const abiertos = new Set();   // grupos del menú lateral desplegados
// El catálogo casi no cambia: se trae una vez y se reutiliza al navegar (se refresca en Catálogo y con refresh)
async function catalogo(fresco) { if (fresco || !catCache) catCache = await api.catalogo(); return catCache; }

function irA(v) { ruta = v; try { history.replaceState(null, '', `#${v}`); } catch { /* sin history */ } pintar(); }

// Contadores (menú, módulos e inicio): se piden todos juntos y se completan cuando llegan, sin frenar la pantalla
async function badges() {
  const out = {}, tareas = [];
  const t = (k, f) => tareas.push(f().then(v => { out[k] = v; }).catch(() => {}));
  if (['auditor', 'admin'].includes(me.rol)) t('pend', async () => (await api.solicitudes({ estado: 'pendiente' })).length);
  if (['compras', 'admin'].includes(me.rol)) t('oc', async () => {
    const [p, o] = await Promise.all([api.pendientesOC(), api.ordenes()]);
    return new Set(p.map(x => `${x.proveedor_id}|${x.empresa}`)).size + o.filter(x => x.estado === 'borrador').length;
  });
  if (me.rol === 'solicitante') t('rec', async () => (await api.recepciones()).filter(r => r.pendiente).length);
  if (['auditor', 'compras', 'admin', 'direccion'].includes(me.rol)) t('fc', async () => (await api.facturas()).filter(f => f.estado === 'recibida').length);
  // tickets: a IT, los nuevos (y los críticos); a la sucursal, los que esperan su respuesta o su confirmación
  if (me.soporte) t('tkit', async () => { const ts = await api.tickets(); out.tkcrit = ts.filter(x => x.estado === 'nuevo' && x.prioridad === 'critica').length; return ts.filter(x => x.estado === 'nuevo').length; });
  else if (itVisible()) t('tk', async () => (await api.tickets()).filter(x => ['en_espera', 'resuelto'].includes(x.estado)).length);
  // RRHH: ausentes hoy, fechas importadas a confirmar y personas sin sucursal
  if (['auditor', 'admin', 'direccion'].includes(me.rol)) t('rhconf', async () => {
    const [emp, aus] = await Promise.all([api.rrhhEmpleados(), api.rrhhAusencias()]);
    const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    out.rhhoy = aus.filter(a => a.tipo !== 'evento' && a.desde <= hoy && a.hasta >= hoy).length;
    out.rhsin = emp.filter(e => e.activo && !e.sucursal_id).length;
    return aus.filter(a => a.aproximada && a.hasta >= hoy).length;
  });
  // Droguería: turnos de hoy que ya pasaron sin cargar, y bachas demoradas
  if (drogVisible()) {
    t('temp', async () => {
      const { hoyAR, turnosDe, estadoTurno } = await import('./views/drog-comun.js?v=20261111-1253');
      const hoy = hoyAR(), [ps, ls] = await Promise.all([api.tempPuntos(), api.tempLecturas(hoy, hoy)]);
      return turnosDe(hoy).filter(tu => ['ahora', 'atrasado'].includes(estadoTurno(hoy, tu, ls.filter(l => l.turno === tu).length, ps.length))).length;
    });
    t('bch', async () => (await api.bachas()).filter(b => b.estado === 'vencida').length);
  }
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
      h('select', { id: 'demo-user', onchange: async e => { await api.cambiarUsuario(us.find(u => u.key === e.target.value)); catCache = null; me = await api.me(); irA('inicio'); } },
        us.map(u => h('option', { value: u.key, selected: u.key === actual }, u.label)))),
    h('button', { class: 'link', onclick: async () => { await api.reset(); catCache = null; me = await api.me(); toast('Datos de ejemplo restaurados'); irA('inicio'); } }, 'Reiniciar datos'));
}

// vistas que puede abrir este usuario, y los módulos que le quedan
function permitidas() {
  return Object.entries(VISTAS).filter(([, v]) => v.roles.includes(me.rol) && (!v.soporte || me.soporte) && (!v.drog || drogVisible()) && (!v.ana || !!(me.analytics || me.soporte))
    && (grupoDe(v) !== 'it' || itVisible()) && !(v.sinSoporte && me.soporte && (IT_PARA_TODOS || demoConIT())));
}
const modulosDe = vistas => ORDEN_MODULOS.filter(m => vistas.some(([, v]) => grupoDe(v) === m));

async function pintar(fresco = false) {
  const mio = ++turno;   // si se navega rápido, solo la última pantalla pedida se dibuja
  const vistas = permitidas();
  if (!vistas.some(([k]) => k === ruta)) ruta = 'inicio';
  const modulos = modulosDe(vistas);
  const actual = grupoDe(VISTAS[ruta]);   // 'inicio' o un módulo
  const primera = m => vistas.find(([, v]) => grupoDe(v) === m)?.[0];
  const delModulo = actual === 'inicio' ? [] : vistas.filter(([, v]) => grupoDe(v) === actual);

  // contadores: cada badge se pinta donde aparezca (menú, pestañas del celular, puntos de los módulos)
  const cupos = [], puntos = [];
  const badgeEl = k => { const el = h('span', { class: 'badge', hidden: true }); cupos.push([k, el]); return el; };
  const pb = badges();
  pb.then(b => {
    for (const [k, el] of cupos) if (b[k]) { el.textContent = b[k]; el.hidden = false; }
    for (const [m, el] of puntos) if (vistas.some(([, v]) => grupoDe(v) === m && v.badge && b[v.badge])) el.hidden = false;
  });

  const item = ([k, v], cls) => h('a', { href: `#${k}`, class: `${cls}${k === ruta ? ' on' : ''}`, 'aria-current': k === ruta ? 'page' : null, onclick: e => { e.preventDefault(); irA(k); } },
    h('span', {}, v.label), v.badge ? badgeEl(v.badge) : null);
  const botonModulo = (m, cls, conTexto) => {
    const punto = h('span', { class: 'punto', hidden: true }); puntos.push([m, punto]);
    const destino = m === 'inicio' ? 'inicio' : primera(m);
    return h('a', { href: `#${destino}`, class: `${cls} mod-${m}${actual === m ? ' on' : ''}`, 'aria-current': actual === m ? 'page' : null, 'aria-label': m === 'inicio' ? 'Inicio' : MODULOS[m].nombre,
      title: m === 'inicio' ? 'Inicio' : MODULOS[m].nombre, onclick: e => { e.preventDefault(); irA(destino); } },
      icono(m), m === 'inicio' ? null : punto, conTexto ? h('span', { class: 'mod-txt' }, m === 'inicio' ? 'Inicio' : MODULOS[m].nombre) : null);
  };
  // grupo desplegable de un módulo en el menú lateral (se recuerda cuáles quedaron abiertos)
  if (actual !== 'inicio') abiertos.add(actual);
  const grupoMenu = m => {
    const punto = h('span', { class: 'punto', hidden: true }); puntos.push([m, punto]);
    const d = h('details', { class: `nav-grupo mod-${m}${actual === m ? ' actual' : ''}`, open: abiertos.has(m) },
      h('summary', {}, icono(m, 18), h('span', { class: 'nav-grupo-txt' }, MODULOS[m].nombre), punto, h('span', { class: 'nav-flecha', 'aria-hidden': 'true' })),
      h('div', { class: 'nav-sub' }, vistas.filter(([, v]) => grupoDe(v) === m).map(x => item(x, 'nav-item'))));
    d.addEventListener('toggle', () => { d.open ? abiertos.add(m) : abiertos.delete(m); });
    return d;
  };
  const quien = me.sucursal || me.nombre || me.email;
  const iniciales = (me.soporte ? 'IT' : quien).replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '·';
  const botonCuenta = cls => h('button', { type: 'button', class: cls, 'aria-label': 'Mi cuenta: tema, contraseña y salir', title: 'Mi cuenta', onclick: () => cuenta() }, iniciales);
  const main = h('main', { class: 'main', id: 'main' }, h('div', { class: 'loading' }, 'Cargando…'));
  document.body.classList.toggle('solo-lectura', soloLectura()); document.body.dataset.mod = actual;

  app.replaceChildren(
    demoBar(),
    h('div', { class: `plataforma${actual === 'inicio' ? ' en-inicio' : ''}`, 'data-mod': actual },
      // barra de módulos (escritorio)
      h('nav', { class: 'rail', 'aria-label': 'Módulos' },
        h('a', { href: '#inicio', class: 'rail-iso', 'aria-label': 'Inicio · Grassi Operaciones', title: 'Inicio', onclick: e => { e.preventDefault(); irA('inicio'); } },
          h('img', { src: 'img/isotipo.png', alt: '' })),
        modulos.map(m => botonModulo(m, 'rail-mod')),
        h('span', { class: 'rail-sep' }),
        botonCuenta('rail-cuenta')),
      // menú del módulo (escritorio)
      // menú lateral (escritorio): Inicio y cada módulo con sus secciones, desplegable
      h('aside', { class: 'modnav' },
        h('a', { href: '#inicio', class: 'modnav-logo', 'aria-label': 'Inicio', onclick: e => { e.preventDefault(); irA('inicio'); } },
          actual === 'inicio' ? marcaOperaciones() : logoModulo(MODULOS[actual].logo)),
        h('nav', { class: 'nav', 'aria-label': 'Menú' },
          item(['inicio', VISTAS.inicio], 'nav-item nav-inicio'),
          modulos.map(m => grupoMenu(m))),
        h('div', { class: 'who' }, h('strong', {}, quien), h('small', {}, ROL[me.rol]),
          enIframe ? h('a', { class: 'link abrir-fuera', href: location.href, target: '_blank', rel: 'noopener' }, 'Abrir en pestaña nueva ↗') : null)),
      // celular: barra de arriba y pestañas del módulo
      h('header', { class: 'top-movil' },
        h('a', { href: '#inicio', class: 'top-iso', onclick: e => { e.preventDefault(); irA('inicio'); } }, h('img', { src: 'img/isotipo.png', alt: 'Inicio' })),
        h('div', { class: 'top-txt' }, h('strong', {}, quien), h('small', {}, actual === 'inicio' ? 'Grassi Operaciones' : `Grassi ${MODULOS[actual].nombre}`)),
        botonCuenta('top-cuenta')),
      delModulo.length > 1 ? h('nav', { class: 'subnav', 'aria-label': 'Secciones' }, delModulo.map(x => item(x, 'subnav-item'))) : null,
      main,
      modulos.length > 0 ? h('nav', { class: 'tabbar', 'aria-label': 'Módulos' }, botonModulo('inicio', 'tab-mod', true), modulos.map(m => botonModulo(m, 'tab-mod', true))) : null));
  main.closest('.plataforma').querySelector('.subnav .on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });

  try {
    const [cat, { render }] = await Promise.all([catalogo(fresco || ruta === 'catalogo'), VISTAS[ruta].mod()]);
    const params = abrirParams; abrirParams = null;   // link directo (por ej. #soporte?t=12 desde un mail): se usa una vez
    const el = await render({ api, me, cat, go: irA, refresh: () => pintar(true), params,
      modulos, vistas: vistas.map(([k]) => k), badges: pb, primera, MODULOS, logoModulo });
    if (mio === turno) main.replaceChildren(el);
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div', { class: 'empty' }, h('strong', {}, 'No se pudo cargar esta sección'), h('p', {}, e.message)));
  }
}

// Mi cuenta: tema, pestaña nueva, contraseña (solo IT) y salir
function cuenta() {
  return modal({ title: 'Mi cuenta',
    body: h('div', { class: 'stack cuenta-body' },
      h('div', {}, h('strong', {}, me.sucursal || me.nombre || me.email), h('small', { class: 'muted', style: 'display:block' }, `${ROL[me.rol]} · ${me.email}`)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tema de la pantalla'), selectorTema()),
      enIframe ? h('a', { class: 'link', href: location.href, target: '_blank', rel: 'noopener' }, 'Abrir la app en pestaña nueva ↗') : null,
      me.soporte ? null : h('small', { class: 'muted' }, `¿Problemas con la contraseña? Llamá a IT: ${IT_TEL}.`)),
    actions: api.modo !== 'demo' ? [
      me.soporte ? { label: 'Cambiar contraseña', onClick: () => { setTimeout(() => cambiarClave(), 0); } } : null,
      { label: 'Salir', kind: 'primary', onClick: async () => { await api.logout(); inicio(); } }].filter(Boolean) : [{ label: 'Cerrar' }] });
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

// Ingreso: panel de la plataforma con sus módulos + formulario
function login() {
  const email = h('input', { id: 'l-mail', type: 'email', required: true, autocomplete: 'username', placeholder: 'suc1@grupograssi.com' });
  const pass = h('input', { id: 'l-pass', type: 'password', required: true, autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn primary block btn-ingresar', type: 'submit' }, 'Ingresar');
  // los cuatro módulos de la plataforma, con su descripción (RRHH todavía en desarrollo)
  const MODS_LOGIN = [
    ['drogueria', 'Droguería', 'Módulo logístico, controles y métricas.'],
    ['it', 'Soporte IT', 'Tickets de soporte para sucursales y áreas.'],
    ['compras', 'De compras', 'Pedidos de insumos, auditoría y compra.'],
    ['rrhh', 'RRHH', 'Gestión de empleados: horarios, francos y vacaciones.', true]];
  const tarjeta = ([m, nombre, desc, pronto], i) => h('li', { class: `login-mod mod-${m}${pronto ? ' pronto' : ''}`, style: `--i:${i}` },
    h('img', { src: `img/logo-${m}-claro.png`, alt: `Grassi ${nombre}` }),
    h('p', {}, desc),
    pronto ? h('span', { class: 'login-pronto' }, 'Próximamente') : null);
  // logo animado: "operaciones" que se revela con los colores de los módulos + la marca grassi + una barra con los colores de los módulos
  const opLogo = h('div', { class: 'op-logo', role: 'img', 'aria-label': 'Grassi Operaciones' },
    h('span', { class: 'op-palabra', 'aria-hidden': 'true' }, 'operaciones'),
    h('img', { class: 'op-marca logo-claro', src: 'img/grassi-marca.png', alt: '' }),
    h('img', { class: 'op-marca logo-oscuro', src: 'img/grassi-marca-claro.png', alt: '' }),
    h('span', { class: 'op-barra', 'aria-hidden': 'true' }, ['drogueria', 'it', 'compras', 'rrhh'].map((m, i) => h('i', { class: `b-${m}`, style: `--i:${i}` }))));
  app.replaceChildren(h('div', { class: 'login2' },
    h('section', { class: 'login-marca' },
      h('div', { class: 'login-grupo' }, h('img', { src: 'img/isotipo.png', alt: '' }), h('div', {}, h('strong', {}, 'Grupo Grassi'), h('small', {}, 'Herramientas internas'))),
      h('div', { class: 'login-titulo' },
        h('h1', {}, 'Todo lo operativo, en un solo lugar.'),
        h('p', {}, 'Un solo usuario para todos los módulos.'),
        h('ul', { class: 'login-mods' }, MODS_LOGIN.map(tarjeta))),
      h('small', { class: 'login-pie' }, 'Farmacias Grassi · Servicios Sociales Grassi · Río Cuarto')),
    h('section', { class: 'login-form-wrap' },
      opLogo,
      h('form', { class: 'login-form', onsubmit: async e => {
        e.preventDefault(); btn.disabled = true;
        try { await api.login(email.value.trim(), pass.value); await inicio(); }
        catch (err) { toast(err.message === 'Invalid login credentials' ? 'Mail o contraseña incorrectos' : err.message, 'bad'); btn.disabled = false; }
      } },
        h('div', {}, h('h2', {}, 'Ingresar'), h('p', { class: 'muted' }, 'Con el mail de tu sucursal o sector.')),
        field('Mail', email), field('Contraseña', pass), btn,
        h('p', { class: 'login-ayuda' }, '¿Olvidaste la contraseña o no podés entrar? Llamá a IT: ', h('a', { href: `tel:+54${IT_TEL.replace(/\D/g, '')}` }, IT_TEL), '.'))),
    h('footer', { class: 'creditos' },
      h('span', { class: 'gan-logo' }, h('img', { src: 'img/ganimedes-lab.png', alt: '' })),
      h('span', {}, h('small', {}, 'Desarrollado por'), h('strong', {}, 'Ganímedes Lab')))));
}

async function inicio() {
  catCache = null;   // otro usuario: el catálogo (con o sin precios) se vuelve a pedir
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
  const [r, q] = (location.hash || '').slice(1).split('?');
  ruta = r || 'inicio';
  abrirParams = q ? Object.fromEntries(new URLSearchParams(q)) : null;
  // los links de los mails de IT dicen #ticket?t=12: cada uno lo abre en su pantalla
  if (ruta === 'ticket') ruta = me.soporte ? 'tickets' : 'soporte';
  pintar();
}

api.alRecuperar?.(() => cambiarClave(true));
inicio();
