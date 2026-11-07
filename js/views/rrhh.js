// RRHH Grassi: módulo en desarrollo. Por ahora, una presentación de lo que va a tener.
import { h } from '../ui.js?v=20261107-1517';

const QUE_VIENE = [
  ['Legajo de empleados', 'Datos de cada persona, sucursal o sector y puesto.'],
  ['Horarios', 'Turnos de cada sucursal y sector, a la vista de todos.'],
  ['Francos', 'Pedido y aprobación de francos, sin papeles.'],
  ['Vacaciones', 'Días disponibles, pedidos y calendario del equipo.'],
];

export async function render() {
  return h('div', { class: 'view rrhh' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'RRHH Grassi'), h('h1', {}, 'Gestión de empleados'),
      h('p', { class: 'muted' }, 'Este módulo está en desarrollo. Pronto vas a poder gestionar desde acá:'))),
    h('ul', { class: 'rrhh-viene' }, QUE_VIENE.map(([t, d]) => h('li', {}, h('strong', {}, t), h('span', {}, d)))),
    h('p', { class: 'muted' }, 'Mientras tanto, todo sigue como hasta ahora. Las consultas, a RRHH.'));
}
