// Usuarios (solo IT): ver quién tiene acceso y ponerle una contraseña nueva a cualquiera.
// Las contraseñas no se pueden ver: se definen acá y se anotan en el Registro de accesos.
import { h, toast, empty, modal, field } from '../ui.js?v=20261107-1537';

const ROL = { solicitante: 'Sucursal', auditor: 'Auditoría', compras: 'Compras', admin: 'Administrador' };
// sin letras que se confunden (l/I/1, O/0) para dictarla por teléfono
const LETRAS = 'abcdefghjkmnpqrstuvwxyz', MAYUS = 'ABCDEFGHJKMNPQRSTUVWXYZ', NUMS = '23456789';
function generar() {
  const r = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const pick = s => s[r(s.length)];
  const base = [pick(MAYUS), ...Array.from({ length: 6 }, () => pick(LETRAS)), pick(NUMS), pick(NUMS), pick(NUMS)];
  return base.join('');
}

export async function render({ api }) {
  const usuarios = await api.usuarios();
  let filtro = '';
  const lista = h('div', { class: 'table-wrap' });
  const buscar = h('input', { type: 'search', id: 'us-buscar', placeholder: 'Buscar sucursal o mail…', oninput: e => { filtro = e.target.value.toLowerCase(); pintar(); } });

  function ponerClave(u) {
    const inp = h('input', { id: 'us-clave', type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'mono', value: generar() });
    const copiar = async () => { try { await navigator.clipboard.writeText(inp.value); toast('Contraseña copiada'); } catch { inp.select(); } };
    modal({ title: `Contraseña para ${u.sucursal || u.email}`,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, h('span', { class: 'mono' }, u.email)),
        field('Contraseña nueva', inp, 'Mínimo 10 caracteres, con letras y números. Ya viene una sugerida.'),
        h('div', { class: 'toolbar filters' },
          h('button', { type: 'button', class: 'btn', onclick: () => { inp.value = generar(); inp.focus(); } }, 'Generar otra'),
          h('button', { type: 'button', class: 'btn', onclick: copiar }, 'Copiar')),
        h('div', { class: 'notice' }, 'Anotala en tu Registro de accesos antes de cerrar: después no se puede volver a ver. La contraseña anterior deja de funcionar en el acto.')),
      actions: [{ label: 'Cancelar' }, { label: 'Guardar contraseña', kind: 'primary', onClick: async () => {
        const c = inp.value.trim();
        if (c.length < 10 || !/[a-zA-Z]/.test(c) || !/\d/.test(c)) { toast('Mínimo 10 caracteres, con letras y números', 'bad'); return false; }
        try { const r = await api.ponerClave(u.id, c); toast(r?.simulado ? 'Modo demo: no se cambió ninguna contraseña' : `Contraseña nueva para ${u.email}`); }
        catch (e) { toast(e.message, 'bad'); return false; }
      } }] });
  }

  function pintar() {
    const rows = usuarios.filter(u => !filtro || `${u.sucursal || ''} ${u.email}`.toLowerCase().includes(filtro));
    lista.replaceChildren(rows.length ? h('table', { class: 'tbl hover' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Sucursal / área'), h('th', {}, 'Usuario (mail)'), h('th', {}, 'Rol'), h('th', {}, ''))),
      h('tbody', {}, rows.map(u => h('tr', {},
        h('td', {}, h('strong', {}, u.sucursal || (u.soporte ? 'IT' : '—'))),
        h('td', { class: 'mono' }, u.email),
        h('td', {}, h('span', { class: `pill ${u.rol === 'solicitante' ? 'pill-muted' : 'pill-info'}` }, u.soporte ? 'IT · Administrador' : ROL[u.rol] || u.rol)),
        h('td', { class: 'num' }, h('button', { class: 'btn', onclick: () => ponerClave(u) }, 'Poner contraseña'))))))
      : empty('Sin resultados', 'No hay usuarios que coincidan.'));
  }
  pintar();

  return h('section', { class: 'view' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'Soporte · solo IT'), h('h1', {}, 'Usuarios'),
      h('p', { class: 'muted' }, 'Las contraseñas las define IT. Si alguien se la olvida o no puede entrar, poné una nueva acá y pasásela. Las contraseñas no se pueden ver: anotalas en el Registro de accesos.'))),
    h('div', { class: 'toolbar' }, buscar, h('span', { class: 'muted' }, `${usuarios.length} usuarios`)),
    lista);
}
