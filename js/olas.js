// Salidas de la Droguería a las farmacias (cronograma de comisionistas y reparto propio).
// Definido por el Responsable de Droguería el 18/11/2026; los cortes todavía son una propuesta.
// La misma tabla está en herramientas/indicadores/calc.py (línea de base de los indicadores): si se cambia acá, cambiarla allá.
// sucursales: id de la tabla "sucursales" de la app (1 = Suc 1 Gral. Paz … 13 = Suc 15 Justo Daract).
// dias: 0 = domingo … 6 = sábado (como Date.getDay()).
export const RIO_CUARTO = [1, 2, 3, 4, 5, 6];

export const SALIDAS = [
  { id: 'rc12', nombre: 'Río Cuarto 12 h', hora: '12:00', cortes: 'cortes 8 y 10', dias: [1, 2, 3, 4, 5], sucursales: RIO_CUARTO, reparto: 'Reparto propio' },
  { id: 'rc17', nombre: 'Río Cuarto 17 h', hora: '17:00', cortes: 'corte 13:30', dias: [1, 2, 3, 4, 5], sucursales: RIO_CUARTO, reparto: 'Reparto propio' },
  { id: 'rc_sab', nombre: 'Río Cuarto sábado', hora: '12:00', cortes: 'cortes 8 y 9:30', dias: [6], sucursales: [2, 4, 5], reparto: 'Reparto propio' },   // sábado: solo Suc 2, 4 y 5
  { id: 'cba', nombre: 'Córdoba', hora: '12:00', cortes: 'cortes 8 y 10', dias: [1, 3, 5], sucursales: [12], reparto: 'Comisionista' },
  { id: 'mol', nombre: 'Moldes', hora: '15:00', cortes: 'cortes 8 y 13', dias: [1, 3, 5], sucursales: [7], reparto: 'Comisionista' },
  { id: 'ale', nombre: 'Alejandro', hora: '15:00', cortes: 'cortes 8 y 13', dias: [1, 3, 4], sucursales: [8], reparto: 'Comisionista' },
  { id: 'r3vm2', nombre: 'Río Tercero y Villa Mercedes 2', hora: '18:00', cortes: 'cortes 8 y 13', dias: [1, 3, 5], sucursales: [11, 10], reparto: 'Comisionista' },
  { id: 'vm1jd', nombre: 'Villa Mercedes 1 y Justo Daract', hora: '18:00', cortes: 'cortes 8 y 13', dias: [2, 4], sucursales: [9, 13], reparto: 'Comisionista' },
];
export const EXTRA = { id: 'extra', nombre: 'Envío extra (fuera de cronograma)', hora: '', cortes: '', dias: [], sucursales: [], reparto: '' };

// salidas programadas para una fecha 'AAAA-MM-DD'
export function salidasDelDia(fecha) {
  const dia = new Date(fecha + 'T12:00:00').getDay();
  return SALIDAS.filter(s => s.dias.includes(dia));
}
export const salidaPorId = id => SALIDAS.find(s => s.id === id) || (id === 'extra' ? EXTRA : null);
