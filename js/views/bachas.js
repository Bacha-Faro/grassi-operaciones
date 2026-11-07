// Droguería · Bachas: dónde está cada una, salidas a sucursales y retornos (se pueden registrar varias juntas).
import { h, toast, modal, field, empty, tabs, fechaHora } from '../ui.js?v=20261107-1435';
import { hoyAR, sumarDias, fechaCorta, codigoBacha, pillBacha } from './drog-comun.js?v=20261107-1435';

const FILTROS = [['todas', 'Todas'], ['disponible', 'En Droguería'], ['afuera', 'En sucursales'], ['vencida', 'Demoradas']];
const DIAS_RETORNO = 3;

export async function render({ api, cat, refresh }) {
  let lista = await api.bachas();
  if (!lista.length) return empty('Sin acceso', 'Este módulo es de la Droguería.');
  let filtro = 'todas', elegidas = new Set();
  const sucursales = cat.sucursales.filter(s => s.activo !== false && !/drogu/i.test(s.nombre));
  const grilla = h('div', { class: 'bachas-grilla' });
  const barra = h('div', { class: 'bachas-barra', hidden: true });
  const cuenta = e => lista.filter(b => e === 'todas' || b.estado === e).length;

  async function recargar() { lista = await api.bachas(); elegidas.clear(); pintar(); pintarTabs(); pintarResumen(); }

  // salida o retorno de una o varias bachas
  function mover(bs) {
    const tipo = bs[0].estado === 'disponible' ? 'salida' : 'retorno';
    if (bs.some(b => (b.estado === 'disponible') !== (tipo === 'salida'))) return toast('Elegí bachas en el mismo estado: todas en Droguería o todas afuera', 'bad');
    const suc = h('select', { id: 'bch-suc' }, h('option', { value: '' }, 'Elegí la sucursal…'), sucursales.map(s => h('option', { value: s.id }, s.nombre)));
    const vuelve = h('input', { type: 'date', id: 'bch-vuelve', value: sumarDias(hoyAR(), DIAS_RETORNO), min: hoyAR() });
    const obs = h('input', { maxlength: 500, id: 'bch-obs', placeholder: tipo === 'salida' ? 'Opcional' : 'Opcional: llegó rota, sucia, sin tapa…' });
    const titulo = bs.length === 1 ? bs[0].codigo : `${bs.length} bachas`;
    modal({ title: tipo === 'salida' ? `Salida de ${titulo}` : `Retorno de ${titulo}`,
      body: h('div', { class: 'stack' },
        bs.length > 1 ? h('p', { class: 'mono muted' }, bs.map(b => b.codigo.slice(4)).join(' · ')) : null,
        tipo === 'salida' ? [field('Va a', suc), field('Vuelve, a más tardar, el', vuelve, `Por defecto, ${DIAS_RETORNO} días. Si no volvió para esa fecha, figura como demorada.`)]
          : h('p', {}, bs.length === 1 ? `Está en ${bs[0].sucursal} desde el ${fechaHora(bs[0].desde)}.` : 'Vuelven a la Droguería.'),
        field('Observación', obs)),
      actions: [{ label: 'Cancelar' }, { label: tipo === 'salida' ? 'Registrar salida' : 'Registrar retorno', kind: 'primary', onClick: async () => {
        if (tipo === 'salida' && !suc.value) { toast('Elegí la sucursal', 'bad'); return false; }
        let ok = 0;
        for (const b of bs) {
          try { await api.bachaMovimiento({ bacha_id: b.id, tipo, sucursal_id: tipo === 'salida' ? +suc.value : null, retorno_esperado: tipo === 'salida' ? vuelve.value : null, observacion: obs.value.trim() }); ok++; }
          catch (e) { toast(`${b.codigo}: ${e.message}`, 'bad'); }
        }
        if (ok) toast(tipo === 'salida' ? `Salida registrada: ${ok} bacha${ok > 1 ? 's' : ''}` : `Retorno registrado: ${ok} bacha${ok > 1 ? 's' : ''}`);
        await recargar();
      } }] });
  }

  async function ficha(b) {
    const hist = h('div', { class: 'muted' }, 'Cargando historial…');
    const m = modal({ title: b.codigo, wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'toolbar filters' }, pillBacha(b.estado),
          b.estado !== 'disponible' ? h('span', {}, `${b.sucursal} · desde ${fechaHora(b.desde)} · vuelve el ${fechaCorta(b.retorno_esperado)}`) : null),
        h('div', {}, h('button', { class: 'btn primary', onclick: () => { m.close(); mover([b]); } }, b.estado === 'disponible' ? 'Registrar salida' : 'Registrar retorno')),
        h('h3', {}, 'Últimos movimientos'), hist) });
    const ms = await api.bachaHistorial(b.id);
    hist.replaceChildren(ms.length ? h('ul', { class: 'bacha-hist' }, ms.map(m => h('li', {},
      h('strong', {}, m.tipo === 'salida' ? `Salió a ${m.sucursal}` : 'Volvió a la Droguería'),
      h('span', { class: 'muted' }, ` · ${fechaHora(m.created_at)}${m.usuario_nombre ? ` · ${m.usuario_nombre}` : ''}`),
      m.observacion ? h('small', { class: 'motivo' }, m.observacion) : null))) : h('p', { class: 'muted' }, 'Todavía no tuvo movimientos.'));
  }

  function pintar() {
    const rows = lista.filter(b => filtro === 'todas' || b.estado === filtro);
    grilla.replaceChildren(...(rows.length ? rows.map(b => h('button', { type: 'button', class: `bacha est-${b.estado}${elegidas.has(b.id) ? ' elegida' : ''}`, 'aria-pressed': elegidas.has(b.id) ? 'true' : null,
      title: `${b.codigo} · ${b.estado === 'disponible' ? 'en Droguería' : `${b.sucursal}, vuelve ${fechaCorta(b.retorno_esperado)}`}`,
      onclick: () => { if (modoVarias.checked) { elegidas.has(b.id) ? elegidas.delete(b.id) : elegidas.add(b.id); pintar(); } else ficha(b); } },
      h('span', { class: 'bacha-num mono' }, b.codigo.slice(4)),
      h('span', { class: 'bacha-lugar' }, b.estado === 'disponible' ? 'Droguería' : (b.sucursal || '').replace(/^Suc \d+ /, '')))) : [empty('No hay bachas en este estado')]));
    const sel = lista.filter(b => elegidas.has(b.id));
    barra.hidden = !sel.length;
    barra.replaceChildren(h('span', {}, h('strong', {}, String(sel.length)), ' elegida', sel.length > 1 ? 's' : ''),
      h('button', { class: 'btn primary', onclick: () => mover(sel) }, sel[0]?.estado === 'disponible' ? 'Registrar salida' : 'Registrar retorno'),
      h('button', { class: 'link', onclick: () => { elegidas.clear(); pintar(); } }, 'Quitar selección'));
  }

  // buscar o escanear un código
  const buscar = h('input', { type: 'search', id: 'bch-buscar', placeholder: 'Escaneá o escribí el código (ej.: 7 o BCH-0007) y Enter', autocomplete: 'off',
    onkeydown: e => { if (e.key !== 'Enter') return; const c = codigoBacha(e.target.value); const b = lista.find(x => x.codigo === c);
      if (!b) return toast(`No existe la bacha ${c}`, 'bad');
      e.target.value = '';
      if (modoVarias.checked) { elegidas.add(b.id); pintar(); toast(`${b.codigo} agregada`); } else ficha(b); } });
  const modoVarias = h('input', { type: 'checkbox', id: 'bch-varias', onchange: () => { elegidas.clear(); pintar(); } });

  const tabBar = h('div');
  const pintarTabs = () => tabBar.replaceChildren(tabs(FILTROS.map(([id, l]) => [id, l, cuenta(id)]), filtro, id => { filtro = id; pintarTabs(); pintar(); }));
  const resumen = h('div', { class: 'bachas-resumen' });
  function pintarResumen() {
    const afuera = lista.filter(b => b.estado !== 'disponible');
    const porSuc = {}; for (const b of afuera) (porSuc[b.sucursal] ||= []).push(b);
    resumen.replaceChildren(
      h('div', { class: 'tk-kpis' },
        h('div', { class: 'kpi' }, h('strong', {}, String(cuenta('disponible'))), h('span', {}, 'en la Droguería')),
        h('div', { class: 'kpi' }, h('strong', {}, String(cuenta('afuera'))), h('span', {}, 'en sucursales, a tiempo')),
        h('div', { class: `kpi ${cuenta('vencida') ? 'bad' : ''}` }, h('strong', {}, String(cuenta('vencida'))), h('span', {}, 'demoradas (pasó la fecha de vuelta)'))),
      Object.keys(porSuc).length ? h('details', { class: 'bachas-porsuc' }, h('summary', {}, 'Bachas afuera por sucursal'),
        h('ul', {}, Object.entries(porSuc).sort((a, b) => b[1].length - a[1].length).map(([s, bs]) => h('li', {},
          h('strong', {}, `${s}: ${bs.length}`), h('span', { class: 'mono muted' }, ` ${bs.map(b => b.codigo.slice(4)).join(' · ')}`),
          bs.some(b => b.estado === 'vencida') ? h('span', { class: 'pill pill-bad tag-urg' }, `${bs.filter(b => b.estado === 'vencida').length} demorada${bs.filter(b => b.estado === 'vencida').length > 1 ? 's' : ''}`) : null)))) : null);
  }
  pintarTabs(); pintarResumen(); pintar();

  return h('div', { class: 'view bachas-view' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'Droguería Grassi'), h('h1', {}, 'Bachas'),
      h('p', { class: 'muted' }, 'Tocá una bacha para ver dónde está y registrar la salida o el retorno. Para mover varias juntas, activá "Elegir varias".'))),
    resumen,
    h('div', { class: 'toolbar' }, buscar, h('label', { class: 'check-mini' }, modoVarias, ' Elegir varias')),
    h('div', { class: 'toolbar' }, tabBar),
    grilla, barra);
}
