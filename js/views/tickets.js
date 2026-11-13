// IT Grassi · bandeja de IT: todos los tickets, ordenados por urgencia, con el plazo de primera respuesta.
import { h, empty, fechaHora, tkNum, tabs, toast } from '../ui.js?v=20261113-1924';
import { abrirTicket, estadoPill, prioPill, plazo, plazoTag, minutosHabiles, OBJETIVO_TXT } from './ticket.js?v=20261113-1924';
import { disponibilidad, estadoActual, activar, desactivar } from '../push.js?v=20261113-1924';

const GRUPOS = [
  ['pendientes', 'Por atender', ['nuevo', 'en_curso']],
  ['espera', 'Esperando a la sucursal', ['en_espera']],
  ['resueltos', 'Resueltos (a confirmar)', ['resuelto']],
  ['cerrados', 'Cerrados', ['cerrado', 'anulado']],
];
const ORDEN_PRIO = { critica: 0, alta: 1, normal: 2, baja: 3 };

export async function render({ api, me, cat, refresh, params }) {
  const [lista, cats] = await Promise.all([api.tickets(), api.itCategorias()]);
  let grupo = 'pendientes', fSuc = '', fCat = '';
  const cont = h('div', { class: 'stack' });
  const abrir = id => abrirTicket({ api, me, id, cats, onChange: refresh });

  function pintar() {
    const estados = GRUPOS.find(g => g[0] === grupo)[2];
    const rows = lista.filter(t => estados.includes(t.estado) && (!fSuc || t.sucursal_id === +fSuc) && (!fCat || t.categoria_id === +fCat))
      .sort((a, b) => grupo === 'cerrados' ? b.updated_at.localeCompare(a.updated_at)
        : (a.estado === 'nuevo' ? 0 : 1) - (b.estado === 'nuevo' ? 0 : 1) || ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad] || a.created_at.localeCompare(b.created_at));
    cont.replaceChildren(rows.length ? h('ul', { class: 'cards' }, rows.map(t => h('li', { class: `card${t.prioridad === 'critica' && t.estado === 'nuevo' ? ' card-critica' : ''}` },
      h('button', { class: 'card-row', onclick: () => abrir(t.id) },
        h('span', { class: 'mono strong' }, tkNum(t.id)),
        h('span', { class: 'card-main' }, h('strong', {}, t.asunto, t.reaperturas ? h('span', { class: 'pill pill-warn tag-urg' }, 'Reabierto') : null),
          h('small', { class: 'muted' }, `${t.sucursal} · ${t.categoria} · ${fechaHora(t.created_at)}`), grupo === 'pendientes' ? plazoTag(t) : null),
        prioPill(t.prioridad), estadoPill(t.estado, true)))))
      : empty(grupo === 'pendientes' ? 'No hay tickets por atender' : 'Nada por acá', grupo === 'pendientes' ? 'Cuando una sucursal cargue un ticket, aparece acá y te llega un mail.' : null));
  }
  const cuenta = id => lista.filter(t => GRUPOS.find(g => g[0] === id)[2].includes(t.estado)).length;
  const tabBar = h('div');
  const pintarTabs = () => tabBar.replaceChildren(tabs(GRUPOS.map(([id, l]) => [id, l, cuenta(id)]), grupo, id => { grupo = id; pintarTabs(); pintar(); }));
  pintarTabs(); pintar();
  if (params?.t) setTimeout(() => abrir(+params.t), 0);

  // números rápidos del mes
  const abiertos = lista.filter(t => ['nuevo', 'en_curso', 'en_espera'].includes(t.estado));
  const vencidos = abiertos.filter(t => plazo(t).vencido).length;
  const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
  const delMes = lista.filter(t => new Date(t.created_at) >= mes);
  const resp = delMes.filter(t => t.primera_respuesta_at);
  const enPlazo = resp.filter(t => plazo(t).enPlazo).length;
  const promMin = resp.length ? resp.reduce((a, t) => a + minutosHabiles(t.created_at, t.primera_respuesta_at), 0) / resp.length : null;
  const durTxt = m => m === null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 480 ? `${(m / 60).toFixed(1).replace('.', ',')} h` : `${(m / 480).toFixed(1).replace('.', ',')} días`;
  const kpi = (n, l, tono) => h('div', { class: `kpi ${tono || ''}` }, h('strong', {}, n), h('span', {}, l));
  const kpis = h('div', { class: 'kpis tk-kpis' },
    kpi(abiertos.length, 'abiertos ahora'),
    kpi(abiertos.filter(t => t.prioridad === 'critica').length, 'críticos abiertos', abiertos.some(t => t.prioridad === 'critica') ? 'bad' : ''),
    kpi(vencidos, 'con la respuesta vencida', vencidos ? 'warn' : ''),
    kpi(resp.length ? `${Math.round(enPlazo / resp.length * 100)}%` : '—', 'respondidos en plazo este mes'),
    kpi(durTxt(promMin), 'primera respuesta promedio (horario IT)'));

  // notificaciones en este dispositivo
  const pushBox = h('div', { class: 'push-box' });
  async function pintarPush() {
    const d = disponibilidad();
    if (api.modo === 'demo') return pushBox.replaceChildren(h('small', { class: 'muted' }, 'En la demo no se activan notificaciones.'));
    if (d === 'iframe') return pushBox.replaceChildren(h('small', { class: 'muted' }, 'Para recibir los críticos en el celular, abrí la app fuera de GrassiNet. '), h('a', { class: 'link', href: location.href, target: '_blank', rel: 'noopener' }, 'Abrir ↗'));
    if (d === 'ios-instalar') return pushBox.replaceChildren(h('small', { class: 'muted' }, 'En iPhone: tocá Compartir → “Agregar a inicio”, abrí la app desde ese ícono y activá las notificaciones ahí.'));
    if (d === 'no-soportado') return pushBox.replaceChildren(h('small', { class: 'muted' }, 'Este navegador no permite notificaciones.'));
    if (d === 'bloqueado') return pushBox.replaceChildren(h('small', { class: 'muted' }, 'Las notificaciones están bloqueadas para este sitio: habilitalas en la configuración del navegador.'));
    const sub = await estadoActual().catch(() => null);
    pushBox.replaceChildren(sub
      ? h('span', { class: 'push-on' }, '🔔 Avisos de críticos activos en este dispositivo ',
        h('button', { class: 'link', onclick: async () => { try { const r = await api.probarPush(); toast(r?.enviados ? 'Notificación de prueba enviada' : 'No hay dispositivos para avisar', r?.enviados ? 'ok' : 'bad'); } catch (e) { toast(e.message, 'bad'); } } }, 'Probar'), ' · ',
        h('button', { class: 'link', onclick: async () => { await desactivar(api); toast('Avisos desactivados en este dispositivo'); pintarPush(); } }, 'Desactivar'))
      : h('button', { class: 'btn', onclick: async () => { try { await activar(api); toast('Listo: te avisa cuando entre un ticket crítico'); pintarPush(); } catch (e) { toast(e.message, 'bad'); } } }, '🔔 Avisarme los críticos en este dispositivo'));
  }
  pintarPush();

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'IT Grassi · todas las sucursales'), h('h1', {}, 'Tickets'),
        h('p', { class: 'muted' }, `Primera respuesta en horario de IT (lun a vie, 8 a 16): crítica ${OBJETIVO_TXT.critica}, alta ${OBJETIVO_TXT.alta}, normal ${OBJETIVO_TXT.normal}, baja ${OBJETIVO_TXT.baja}.`))),
    pushBox,
    kpis,
    h('div', { class: 'toolbar' }, tabBar,
      h('div', { class: 'toolbar filters' },
        h('select', { 'aria-label': 'Filtrar por sucursal', onchange: e => { fSuc = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todas las sucursales'), cat.sucursales.map(s => h('option', { value: s.id }, s.nombre))),
        h('select', { 'aria-label': 'Filtrar por categoría', onchange: e => { fCat = e.target.value; pintar(); } }, h('option', { value: '' }, 'Todas las categorías'), cats.map(c => h('option', { value: c.id }, c.nombre))))),
    cont);
}
