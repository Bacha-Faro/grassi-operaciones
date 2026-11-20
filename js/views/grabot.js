// IT · GraBot: los mensajes que dejan desde la pantalla de ingreso (gente sin usuario o que no puede entrar).
import { h, toast, modal, field, empty, tabs, fechaHora } from '../ui.js?v=20261120-1456';
import { caraBot } from '../grabot.js?v=20261120-1456';

const TIPO = { acceso: ['No puede entrar', 'bad'], consulta: ['Consulta', 'info'], reclamo: ['Reclamo', 'warn'], sugerencia: ['Sugerencia', 'ok'] };
const ESTADO = { nuevo: ['Nuevo', 'bad'], leido: ['Leído', 'info'], resuelto: ['Resuelto', 'ok'] };
const pill = ([t, c]) => h('span', { class: `pill pill-${c}` }, t);

export async function render({ api, refresh }) {
  let lista = await api.grabotMensajes(), filtro = lista.some(m => m.estado === 'nuevo') ? 'nuevo' : 'todos';
  const cuerpo = h('div');
  const recargar = async () => { lista = await api.grabotMensajes(); pintar(); };

  function abrir(m) {
    const nota = h('textarea', { rows: 3, maxlength: 1000, placeholder: 'Qué se hizo o se respondió (lo ve solo IT)' }, m.nota_it || '');
    const guardar = estado => async () => { await api.grabotAtender(m.id, estado, nota.value); toast(estado === 'resuelto' ? 'Marcado como resuelto' : 'Guardado'); await recargar(); };
    if (m.estado === 'nuevo') api.grabotAtender(m.id, 'leido').then(() => { m.estado = 'leido'; pintar(); }).catch(() => {});
    modal({ title: `Mensaje n.º ${m.id}`, wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'toolbar filters' }, pill(TIPO[m.tipo] || [m.tipo, 'muted']), h('span', { class: 'muted' }, fechaHora(m.created_at))),
        h('p', {}, h('strong', {}, m.nombre), m.sector ? ` · ${m.sector}` : '', m.contacto ? ' · ' : '',
          m.contacto ? (/@/.test(m.contacto) ? h('a', { href: `mailto:${m.contacto}` }, m.contacto) : /\d{6,}/.test(m.contacto.replace(/\D/g, '')) ? h('a', { href: `tel:${m.contacto.replace(/[^\d+]/g, '')}` }, m.contacto) : m.contacto) : ''),
        h('blockquote', { class: 'gb-cita' }, m.mensaje),
        m.atendido_por ? h('small', { class: 'muted' }, `Última acción: ${m.atendido_por}, ${fechaHora(m.atendido_at)}`) : null,
        field('Nota de IT', nota)),
      actions: [
        m.estado === 'resuelto' ? { label: 'Reabrir', onClick: guardar('leido') } : { label: 'Guardar nota', onClick: guardar(m.estado === 'nuevo' ? 'leido' : m.estado) },
        m.estado !== 'resuelto' ? { label: 'Marcar resuelto', kind: 'primary', onClick: guardar('resuelto') } : null].filter(Boolean) });
  }

  function pintar() {
    const n = e => lista.filter(m => e === 'todos' || m.estado === e).length;
    const rows = lista.filter(m => filtro === 'todos' || m.estado === filtro);
    cuerpo.replaceChildren(
      tabs([['nuevo', 'Nuevos', n('nuevo')], ['leido', 'Leídos', n('leido')], ['resuelto', 'Resueltos', n('resuelto')], ['todos', 'Todos', n('todos')]], filtro, f => { filtro = f; pintar(); }),
      rows.length ? h('ul', { class: 'gb-lista' }, rows.map(m => h('li', {},
        h('button', { type: 'button', class: `gb-item${m.estado === 'nuevo' ? ' nuevo' : ''}`, onclick: () => abrir(m) },
          h('span', { class: 'gb-item-top' }, h('strong', {}, m.nombre), m.sector ? h('span', { class: 'muted' }, ` · ${m.sector}`) : null,
            h('span', { class: 'gb-item-pills' }, pill(TIPO[m.tipo] || [m.tipo, 'muted']), pill(ESTADO[m.estado]))),
          h('span', { class: 'gb-item-txt' }, m.mensaje),
          h('small', { class: 'muted' }, fechaHora(m.created_at), m.contacto ? ` · ${m.contacto}` : ' · sin contacto')))))
        : empty(filtro === 'nuevo' ? 'No hay mensajes nuevos' : 'No hay mensajes', 'Los mensajes llegan desde el botón GraBot de la pantalla de ingreso.'));
  }
  pintar();

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Soporte IT'), h('h1', { class: 'gb-titulo' }, h('span', { class: 'gb-avatar' }, caraBot()), 'GraBot'),
        h('p', { class: 'muted' }, 'Consultas, problemas para entrar, reclamos y sugerencias que dejan desde la pantalla de ingreso, sin usuario.')),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: recargar }, 'Actualizar'))),
    cuerpo);
}
