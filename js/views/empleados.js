// RRHH · Empleados: la lista de personas con su sucursal, acuerdo de sábado, horas y vacaciones del período.
import { h, toast, modal, field, empty, confirmar } from '../ui.js?v=20261113-1822';
import { hoyAR, estiloSuc, ordenSuc, nombreSuc, TIPOS, ACUERDOS, periodoDe, rango, fichaAusencia } from './rrhh-comun.js?v=20261113-1822';

export async function render({ api, cat }) {
  const hoy = hoyAR(), per = periodoDe(hoy);
  let [empleados, ausencias] = await Promise.all([api.rrhhEmpleados(), api.rrhhAusencias()]);
  let buscar = '', filtroSuc = '', verInactivos = false;
  const sucursales = cat.sucursales.filter(s => s.activo !== false);
  const sucDe = id => sucursales.find(s => s.id === id) || cat.sucursales.find(s => s.id === id);
  const opcionesSuc = (sel) => [h('option', { value: '' }, 'Sin sucursal'),
    ...[...sucursales].sort(ordenSuc).map(s => h('option', { value: s.id, selected: s.id === sel }, s.nombre))];
  const cont = h('div');
  const recargar = async () => { [empleados, ausencias] = await Promise.all([api.rrhhEmpleados(), api.rrhhAusencias()]); pintar(); };
  const tomadas = e => ausencias.filter(a => a.empleado_id === e.id && a.tipo === 'vacaciones' && a.periodo === per).reduce((s, a) => s + a.dias, 0);
  const proxima = e => ausencias.filter(a => a.empleado_id === e.id && a.hasta >= hoy && a.tipo !== 'evento').sort((a, b) => a.desde.localeCompare(b.desde))[0];

  function ficha(e = {}) {
    const nueva = !e.id;
    const nombre = h('input', { id: 'em-nombre', maxlength: 120, value: e.nombre || '', required: true, placeholder: 'Nombre y apellido' });
    const suc = h('select', { id: 'em-suc' }, opcionesSuc(e.sucursal_id));
    const puesto = h('input', { id: 'em-puesto', maxlength: 80, value: e.puesto || '', placeholder: 'Ej.: Vendedora, Farmacéutico' });
    const acuerdo = h('select', { id: 'em-acuerdo' }, h('option', { value: '' }, 'Sin definir'), Object.entries(ACUERDOS).map(([k, t]) => h('option', { value: k, selected: k === e.acuerdo_sabado }, t)));
    const horas = h('input', { type: 'number', id: 'em-horas', min: 0, max: 60, step: 0.5, value: e.horas_semana ?? '', placeholder: 'Ej.: 40' });
    const vac = h('input', { type: 'number', id: 'em-vac', min: 0, max: 60, value: e.dias_vacaciones ?? '', placeholder: 'Ej.: 14' });
    const activo = h('input', { type: 'checkbox', id: 'em-activo', checked: e.activo !== false });
    const nota = h('input', { id: 'em-nota', maxlength: 500, value: e.nota || '', placeholder: 'Opcional' });
    const suyas = ausencias.filter(a => a.empleado_id === e.id).sort((a, b) => b.desde.localeCompare(a.desde));
    const m = modal({ title: nueva ? 'Nuevo empleado' : e.nombre, wide: !nueva,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, field('Nombre y apellido', nombre), field('Sucursal', suc)),
        h('div', { class: 'grid2' }, field('Puesto', puesto), field('Sábados', acuerdo)),
        h('div', { class: 'grid2' }, field('Horas por semana', horas), field('Días de vacaciones por período', vac, 'Los que le corresponden en el año.')),
        field('Nota', nota),
        h('label', { class: 'check-mini' }, activo, ' Activo (si ya no trabaja, destildalo: queda en el historial)'),
        nueva ? null : h('div', { class: 'stack em-ausencias' },
          h('div', { class: 'toolbar' }, h('h3', {}, 'Ausencias'),
            h('button', { class: 'btn', onclick: () => { m.close(); fichaAusencia({ api, a: { empleado_id: e.id, desde: hoy }, empleados, sucursales: cat.sucursales, ausencias, onDone: recargar }); } }, '+ Cargar ausencia')),
          suyas.length ? h('ul', { class: 'em-aus-lista' }, suyas.map(a => h('li', {},
            h('button', { class: 'link', onclick: () => { m.close(); fichaAusencia({ api, a, empleados, sucursales: cat.sucursales, ausencias, onDone: recargar }); } }, `${TIPOS[a.tipo].label}${a.titulo ? `: ${a.titulo}` : ''}`),
            h('span', { class: 'muted' }, ` · ${rango(a)} ${a.desde.slice(0, 4)} · ${a.dias} día${a.dias > 1 ? 's' : ''}${a.tipo === 'vacaciones' && a.periodo ? ` · período ${a.periodo}` : ''}`),
            a.aproximada ? h('span', { class: 'pill pill-warn' }, 'Fecha a confirmar') : null))) : h('p', { class: 'muted' }, 'No tiene ausencias cargadas.'),
          h('div', { class: 'em-unificar' }, h('small', { class: 'muted' }, '¿Es la misma persona que otra ficha (por ejemplo, el nombre escrito al revés)? '),
            h('button', { class: 'link', onclick: () => { m.close(); unificar(e); } }, 'Unificar con otra ficha')))),
      actions: [{ label: 'Cancelar' }, { label: nueva ? 'Agregar' : 'Guardar', kind: 'primary', onClick: async () => {
        if (nombre.value.trim().length < 2) { toast('Escribí el nombre', 'bad'); return false; }
        try {
          await api.rrhhGuardarEmpleado({ id: e.id, nombre: nombre.value, sucursal_id: suc.value ? +suc.value : null, puesto: puesto.value.trim(), acuerdo_sabado: acuerdo.value,
            horas_semana: horas.value, dias_vacaciones: vac.value, activo: activo.checked, nota: nota.value.trim() });
          toast(nueva ? 'Empleado agregado' : 'Cambios guardados'); recargar();
        } catch (err) { toast(err.message, 'bad'); return false; }
      } }] });
  }

  function unificar(e) {
    const otro = h('select', { id: 'em-otro' }, h('option', { value: '' }, 'Elegí la otra ficha…'),
      empleados.filter(x => x.id !== e.id).map(x => h('option', { value: x.id }, `${x.nombre} · ${nombreSuc(sucDe(x.sucursal_id))}`)));
    modal({ title: `Unificar ${e.nombre}`, body: h('div', { class: 'stack' },
      h('p', {}, 'Las ausencias de esta ficha pasan a la que elijas, y esta ficha se borra. Queda el nombre y los datos de la otra.'), field('Queda la ficha de', otro)),
      actions: [{ label: 'Cancelar' }, { label: 'Unificar', kind: 'primary', onClick: async () => {
        if (!otro.value) { toast('Elegí la otra ficha', 'bad'); return false; }
        const dest = empleados.find(x => x.id === +otro.value);
        if (!(await confirmar('Unificar fichas', `"${e.nombre}" se borra y sus ausencias pasan a "${dest.nombre}". ¿Seguimos?`, 'Unificar'))) return false;
        try { await api.rrhhUnificar(e.id, dest.id); toast('Fichas unificadas'); recargar(); } catch (err) { toast(err.message, 'bad'); return false; }
      } }] });
  }

  // cambiar la sucursal directo desde la lista
  const selSucFila = e => h('select', { class: `em-suc-sel${e.sucursal_id ? '' : ' falta'}`, 'aria-label': `Sucursal de ${e.nombre}`, onclick: ev => ev.stopPropagation(),
    onchange: async ev => {
      try { await api.rrhhGuardarEmpleado({ ...e, sucursal_id: ev.target.value ? +ev.target.value : null, nota: e.sucursal_id || !e.nota?.startsWith('En el Excel') ? e.nota : null });
        toast(`${e.nombre}: ${ev.target.value ? sucDe(+ev.target.value).nombre : 'sin sucursal'}`); recargar(); }
      catch (err) { toast(err.message, 'bad'); }
    } }, opcionesSuc(e.sucursal_id));

  function pintar() {
    const q = buscar.trim().toLowerCase();
    const rows = empleados.filter(e => (verInactivos || e.activo) && (!q || e.nombre.toLowerCase().includes(q))
      && (!filtroSuc || String(e.sucursal_id ?? 'sin') === filtroSuc))
      .sort((a, b) => ordenSuc(sucDe(a.sucursal_id), sucDe(b.sucursal_id)) || a.nombre.localeCompare(b.nombre, 'es'));
    const nSin = empleados.filter(e => e.activo && !e.sucursal_id).length;
    selFiltro.value = filtroSuc;
    cont.replaceChildren(
      nSin && filtroSuc !== 'sin' ? h('div', { class: 'notice' }, h('strong', {}, `${nSin} persona${nSin > 1 ? 's' : ''} sin sucursal. `),
        'En la planilla tenían otro color o ninguno. Elegí la sucursal en la lista. ', h('button', { class: 'link', onclick: () => { filtroSuc = 'sin'; pintar(); } }, 'Ver solo esas')) : null,
      rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'tbl em-tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Persona'), h('th', {}, 'Sucursal'), h('th', {}, 'Sábados'), h('th', { class: 'num' }, 'Horas'),
          h('th', { class: 'num' }, `Vacaciones ${per}`), h('th', {}, 'Próxima ausencia'))),
        h('tbody', {}, rows.map(e => {
          const t = tomadas(e), p = proxima(e);
          return h('tr', { class: `clic${e.activo ? '' : ' inactivo'}`, style: estiloSuc(sucDe(e.sucursal_id)), onclick: () => ficha(e) },
            h('td', {}, h('span', { class: 'cob-punto' }), h('strong', {}, e.nombre), e.puesto ? h('small', { class: 'muted' }, ` · ${e.puesto}`) : null, e.activo ? null : h('span', { class: 'pill pill-muted' }, 'Inactivo')),
            h('td', {}, selSucFila(e)),
            h('td', {}, e.acuerdo_sabado ? ACUERDOS[e.acuerdo_sabado].replace(/ \(.*\)/, '') : h('span', { class: 'muted' }, '—')),
            h('td', { class: 'num' }, e.horas_semana ?? '—'),
            h('td', { class: `num${e.dias_vacaciones && t > e.dias_vacaciones ? ' em-pasado' : ''}`, title: e.dias_vacaciones && t > e.dias_vacaciones ? 'Tiene cargados más días que los que le corresponden' : null }, e.dias_vacaciones ? `${t} de ${e.dias_vacaciones}` : t ? `${t} días` : '—'),
            h('td', {}, p ? [`${TIPOS[p.tipo].label} · ${rango(p)}`, p.aproximada ? h('span', { class: 'cob-aprox' }, ' ≈') : null] : h('span', { class: 'muted' }, '—')));
        })))) : empty('No hay empleados con ese filtro'));
  }

  const ids = [...new Set(empleados.map(e => e.sucursal_id ?? null))].sort((a, b) => ordenSuc(sucDe(a), sucDe(b)));
  const selFiltro = h('select', { 'aria-label': 'Sucursal', onchange: ev => { filtroSuc = ev.target.value; pintar(); } }, h('option', { value: '' }, 'Todas las sucursales'),
    ids.map(id => h('option', { value: id ?? 'sin' }, id ? sucDe(id)?.nombre : 'Sin sucursal')));
  const filtros = h('div', { class: 'toolbar filters' },
    h('input', { type: 'search', placeholder: 'Buscar por nombre', 'aria-label': 'Buscar', oninput: ev => { buscar = ev.target.value; pintar(); } }),
    selFiltro,
    h('label', { class: 'check-mini' }, h('input', { type: 'checkbox', onchange: ev => { verInactivos = ev.target.checked; pintar(); } }), ' Ver inactivos'));
  pintar();

  return h('div', { class: 'view empleados' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'RRHH Grassi'), h('h1', {}, 'Empleados'),
        h('p', { class: 'muted' }, `${empleados.filter(e => e.activo).length} personas. Tocá una fila para ver su ficha y sus ausencias.`)),
      h('button', { class: 'btn primary', onclick: () => ficha() }, '+ Nuevo empleado')),
    filtros, cont);
}
