// GraBot: botón flotante en la pantalla de ingreso. Por ahora solo toma un mensaje (consulta, problema para entrar,
// reclamo o sugerencia) y lo deja para IT, que lo lee en su módulo. Más adelante puede crecer a un asistente.
import { h, toast } from './ui.js?v=20261119-1503';

const NS = 'http://www.w3.org/2000/svg';
const svg = (attrs, ...hijos) => { const e = document.createElementNS(NS, attrs.tag); for (const [k, v] of Object.entries(attrs)) if (k !== 'tag') e.setAttribute(k, v); e.append(...hijos); return e; };
// cara del robot: antena, cabeza redondeada y dos ojos
export const caraBot = () => svg({ tag: 'svg', viewBox: '0 0 32 32', width: 28, height: 28, 'aria-hidden': 'true', class: 'gb-cara' },
  svg({ tag: 'line', x1: 16, y1: 3, x2: 16, y2: 8, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }),
  svg({ tag: 'circle', cx: 16, cy: 3, r: 2, fill: 'currentColor' }),
  svg({ tag: 'rect', x: 5, y: 8, width: 22, height: 18, rx: 7, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
  svg({ tag: 'circle', cx: 12, cy: 17, r: 2.3, fill: 'currentColor', class: 'gb-ojo' }),
  svg({ tag: 'circle', cx: 20, cy: 17, r: 2.3, fill: 'currentColor', class: 'gb-ojo' }),
  svg({ tag: 'line', x1: 2, y1: 15, x2: 2, y2: 20, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }),
  svg({ tag: 'line', x1: 30, y1: 15, x2: 30, y2: 20, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }));

const TIPOS = [['acceso', 'No puedo entrar'], ['consulta', 'Consulta'], ['reclamo', 'Reclamo'], ['sugerencia', 'Sugerencia']];

export function grabot(api) {
  let abierto = false;
  const burbuja = (txt, quien = 'bot') => h('div', { class: `gb-msg gb-${quien}` }, txt);
  const charla = h('div', { class: 'gb-charla', 'aria-live': 'polite' });
  let tipo = null;
  const nombre = h('input', { maxlength: 80, placeholder: 'Tu nombre', autocomplete: 'name' });
  const sector = h('input', { maxlength: 80, placeholder: 'Sucursal o sector (ej.: Suc 3)' });
  const contacto = h('input', { maxlength: 120, placeholder: 'Mail o teléfono para responderte (opcional)' });
  const mensaje = h('textarea', { maxlength: 1500, rows: 3, placeholder: 'Escribí tu mensaje…' });
  // campo trampa: invisible para las personas; si viene completo es un robot
  const trampa = h('input', { class: 'gb-trampa', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', name: 'web' });
  const enviar = h('button', { class: 'btn primary', type: 'submit' }, 'Enviar a IT');
  const chips = h('div', { class: 'gb-chips' }, TIPOS.map(([k, l]) => h('button', { type: 'button', class: 'gb-chip', onclick: () => elegir(k, l) }, l)));
  const form = h('form', { class: 'gb-form', hidden: true, onsubmit: mandar }, nombre, sector, contacto, mensaje, trampa, enviar);

  function inicio() {
    tipo = null; form.hidden = true; chips.hidden = false;
    charla.replaceChildren(
      burbuja('¡Hola! Soy GraBot 👋 Todavía estoy aprendiendo, pero le paso tu mensaje al equipo de IT.'),
      burbuja('¿Sobre qué es?'), chips);
  }
  function elegir(k, l) {
    tipo = k; chips.hidden = true;
    charla.append(burbuja(l, 'yo'), burbuja(k === 'acceso'
      ? 'Contame qué pasa (no escribas tu contraseña). Dejá un mail o teléfono así te contactan.'
      : 'Dale. Dejame tus datos y el mensaje, y IT lo lee en su módulo.'), form);
    form.hidden = false; setTimeout(() => nombre.focus(), 30);
    charla.scrollTop = charla.scrollHeight;
  }
  async function mandar(e) {
    e.preventDefault();
    if (nombre.value.trim().length < 2) { toast('Decinos tu nombre', 'bad'); nombre.focus(); return; }
    if (mensaje.value.trim().length < 5) { toast('Contanos un poco más', 'bad'); mensaje.focus(); return; }
    enviar.disabled = true;
    try {
      const r = await api.grabotDejar({ nombre: nombre.value, sector: sector.value, contacto: contacto.value, mensaje: mensaje.value, tipo, trampa: trampa.value });
      const n = Number(r) > 0 ? Number(r) : null;
      form.hidden = true;
      charla.append(burbuja(mensaje.value.trim(), 'yo'),
        burbuja(`¡Listo! IT ya tiene tu mensaje${n ? ` (n.º ${n})` : ''}.${contacto.value.trim() ? ' Te van a responder por el contacto que dejaste.' : ''}`),
        h('button', { type: 'button', class: 'gb-chip', onclick: () => { mensaje.value = ''; inicio(); } }, 'Dejar otro mensaje'));
      charla.scrollTop = charla.scrollHeight;
    } catch (err) { toast(err.message || 'No se pudo enviar. Probá de nuevo.', 'bad'); }
    finally { enviar.disabled = false; }
  }

  const panel = h('section', { class: 'gb-panel', role: 'dialog', 'aria-label': 'GraBot', hidden: true },
    h('header', { class: 'gb-head' }, h('span', { class: 'gb-avatar' }, caraBot()),
      h('div', {}, h('strong', {}, 'GraBot'), h('small', {}, 'Mensajes para IT')),
      h('button', { type: 'button', class: 'gb-cerrar', 'aria-label': 'Cerrar', onclick: () => alternar(false) }, '✕')),
    charla);
  const boton = h('button', { type: 'button', class: 'gb-boton', 'aria-label': 'Abrir GraBot', 'aria-expanded': 'false', onclick: () => alternar() },
    caraBot(), h('span', { class: 'gb-etq' }, 'GraBot'));
  function alternar(v = !abierto) {
    abierto = v; panel.hidden = !v; boton.setAttribute('aria-expanded', String(v)); boton.classList.toggle('on', v);
    if (v && !charla.childElementCount) inicio();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto) alternar(false); });
  return h('div', { class: 'gb' }, panel, boton);
}
