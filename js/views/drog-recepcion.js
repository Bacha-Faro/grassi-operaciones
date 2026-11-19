// Droguería · Recepción de proveedores: se registra cada llegada y se avanza por estados hasta que la mercadería
// queda disponible (dock-to-stock). Pensada para la compu de recepción y para el celular de cada operario:
// "quién lo hizo" se elige en cada paso, porque la compu de recepción la usan varios.
import { h, toast, modal, field, empty, fechaHora } from '../ui.js?v=20261119-0206';

export const ESTADOS = [
  ['recibido', 'Recibido', 'Pasar a control'],
  ['en_control', 'En control', 'Listo para ingresar'],
  ['listo_ingreso', 'Listo para ingresar', 'Ingresado en Quantio'],
  ['ingresado', 'Ingresado en Quantio', 'Guardado y disponible'],
  ['disponible', 'Disponible', null],
];
const SIG = { recibido: 'en_control', en_control: 'listo_ingreso', listo_ingreso: 'ingresado', ingresado: 'disponible' };
const DESDE = { recibido: 'llegada_at', en_control: 'control_at', listo_ingreso: 'listo_at', ingresado: 'ingresado_at' };
// horas que puede estar en cada estado antes de marcarse como demorada (metas piloto: se ajustan con datos)
export const META_H = { recibido: 1, en_control: 2, listo_ingreso: 4, ingresado: 4 };
export const INCIDENCIAS = [['ninguna', 'Sin incidencias'], ['faltan_bultos', 'Faltan bultos'], ['rotura', 'Rotura o envase dañado'], ['sin_documentacion', 'Sin remito o factura'],
  ['temperatura', 'Cadena de frío fuera de rango'], ['otro', 'Otro (contar en la nota)']];
const INC = Object.fromEntries(INCIDENCIAS);
const NOMBRE = Object.fromEntries(ESTADOS.map(([k, l]) => [k, l]));
const LS = 'drog-operario';
const leerOp = () => { try { return localStorage.getItem(LS) || ''; } catch { return ''; } };
const guardarOp = v => { try { localStorage.setItem(LS, v); } catch { /* sin almacenamiento */ } };
const horas = (a, b = Date.now()) => (new Date(b) - new Date(a)) / 3600e3;
const fh = v => v < 1 ? `${Math.round(v * 60)} min` : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(v)} h`;
const mediana = a => { const v = a.slice().sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const ahoraLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60e3); return d.toISOString().slice(0, 16); };

// campo "quién" con sugerencias (operarios que ya cargaron algo); recuerda el último en este equipo
export function campoOperario(id, lista, label = 'Quién lo hizo') {
  const dl = h('datalist', { id: `${id}-dl` }, lista.map(n => h('option', { value: n })));
  const input = h('input', { id, list: `${id}-dl`, maxlength: 80, value: leerOp(), placeholder: 'Nombre y apellido', autocomplete: 'off' });
  return { el: [field(label, input), dl], valor: () => { const v = input.value.trim(); if (v) guardarOp(v); return v; }, input };
}

export async function render({ api }) {
  let lista = await api.recepcionesDrog();
  const vista = h('div');
  const operarios = () => [...new Set(lista.map(r => r.operario).filter(Boolean))].sort();
  const proveedores = () => [...new Set(lista.map(r => r.proveedor).filter(Boolean))].sort();
  async function recargar() { lista = await api.recepcionesDrog(); pintar(); }

  function registrar() {
    const prov = h('input', { id: 'rc-prov', list: 'rc-prov-dl', maxlength: 120, placeholder: 'Ej.: Droguería del Sud', autocomplete: 'off' });
    const comp = h('input', { id: 'rc-comp', maxlength: 60, placeholder: 'Ej.: R 0001-00012345 (opcional)' });
    const bultos = h('input', { id: 'rc-bultos', type: 'number', min: 0, max: 9999, inputmode: 'numeric', placeholder: '0' });
    const frio = h('input', { id: 'rc-frio', type: 'checkbox' });
    const temp = h('input', { id: 'rc-temp', type: 'number', step: '0.1', min: -30, max: 40, inputmode: 'decimal', placeholder: '°C' });
    const cajaTemp = field('Temperatura al recibir (°C)', temp, 'Medila al abrir la conservadora. Rango esperado: 2 a 8 °C.');
    cajaTemp.hidden = true;
    frio.addEventListener('change', () => { cajaTemp.hidden = !frio.checked; });
    const inc = h('select', { id: 'rc-inc' }, INCIDENCIAS.map(([v, l]) => h('option', { value: v }, l)));
    const nota = h('input', { id: 'rc-nota', maxlength: 500, placeholder: 'Opcional' });
    const llegada = h('input', { id: 'rc-llegada', type: 'datetime-local', value: ahoraLocal(), max: ahoraLocal() });
    const op = campoOperario('rc-op', operarios(), 'Recibió');
    modal({ title: 'Registrar llegada de mercadería',
      body: h('div', { class: 'stack' },
        field('Proveedor', prov), h('datalist', { id: 'rc-prov-dl' }, proveedores().map(n => h('option', { value: n }))),
        h('div', { class: 'grid2' }, field('Remito o factura', comp), field('Bultos', bultos)),
        h('label', { class: 'check-frena' }, frio, ' Trae cadena de frío'), cajaTemp,
        h('div', { class: 'grid2' }, field('Incidencia', inc), field('Hora de llegada', llegada, 'Si la cargás más tarde, poné la hora real en que llegó.')),
        field('Nota', nota), ...op.el),
      actions: [{ label: 'Cancelar' }, { label: 'Registrar', kind: 'primary', onClick: async () => {
        if (!prov.value.trim()) { toast('Falta el proveedor', 'bad'); return false; }
        if (bultos.value === '' || +bultos.value < 0) { toast('Indicá la cantidad de bultos', 'bad'); return false; }
        if (frio.checked && temp.value === '') { toast('Falta la temperatura de la cadena de frío', 'bad'); return false; }
        if (inc.value === 'otro' && !nota.value.trim()) { toast('Contá la incidencia en la nota', 'bad'); return false; }
        const quien = op.valor();
        if (!quien) { toast('Indicá quién recibió', 'bad'); return false; }
        await api.registrarRecepcion({ proveedor: prov.value.trim(), comprobante: comp.value.trim(), bultos: +bultos.value, frio: frio.checked, temperatura: temp.value,
          incidencia: inc.value, nota: nota.value.trim(), operario: quien, llegada_at: new Date(llegada.value).toISOString() });
        toast('Llegada registrada');
        await recargar();
      } }] });
    setTimeout(() => prov.focus(), 50);
  }

  function avanzar(r, estado = SIG[r.estado]) {
    const rechazo = estado === 'rechazado';
    const op = campoOperario('rc-av-op', operarios());
    const nota = h('input', { id: 'rc-av-nota', maxlength: 500, placeholder: rechazo ? 'Obligatorio: por qué se rechaza' : 'Opcional' });
    modal({ title: rechazo ? `Rechazar: ${r.proveedor}` : `${r.proveedor}: ${NOMBRE[estado]}`,
      body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, `${r.comprobante || 'Sin comprobante'} · ${r.bultos} bultos · llegó ${fechaHora(r.llegada_at)}`), ...op.el, field('Nota', nota)),
      actions: [{ label: 'Cancelar' }, { label: rechazo ? 'Rechazar' : 'Confirmar', kind: rechazo ? 'danger' : 'primary', onClick: async () => {
        const quien = op.valor();
        if (!quien) { toast('Indicá quién lo hizo', 'bad'); return false; }
        if (rechazo && !nota.value.trim()) { toast('Contá por qué se rechaza', 'bad'); return false; }
        await api.avanzarRecepcion(r.id, estado, quien, nota.value.trim() || null);
        toast(rechazo ? 'Recepción rechazada' : `Pasó a ${NOMBRE[estado]}`);
        await recargar();
      } }] });
  }

  async function ficha(r) {
    const hist = h('p', { class: 'muted' }, 'Cargando…');
    const m = modal({ title: r.proveedor, wide: true,
      body: h('div', { class: 'stack' },
        h('p', {}, `${r.comprobante || 'Sin comprobante'} · ${r.bultos} bultos${r.frio ? ` · cadena de frío ${r.temperatura} °C` : ''} · ${INC[r.incidencia]}`),
        r.nota ? h('p', { class: 'muted' }, r.nota) : null,
        h('h3', {}, 'Recorrido'), hist,
        ['recibido', 'en_control', 'listo_ingreso'].includes(r.estado) ? h('div', {}, h('button', { class: 'btn danger', onclick: () => { m.close(); avanzar(r, 'rechazado'); } }, 'Rechazar la mercadería')) : null) });
    const ev = await api.recepcionEventos(r.id);
    hist.replaceWith(h('ul', { class: 'bacha-hist' }, ev.map(e => h('li', {}, h('strong', {}, e.estado === 'rechazado' ? 'Rechazado' : NOMBRE[e.estado] || e.estado),
      h('span', { class: 'muted' }, ` · ${fechaHora(e.created_at)} · ${e.operario || '—'}${e.usuario_nombre && e.usuario_nombre !== e.operario ? ` (cargó ${e.usuario_nombre})` : ''}`),
      e.nota ? h('small', { class: 'motivo' }, e.nota) : null))));
  }

  function tarjeta(r) {
    const desde = r[DESDE[r.estado]] || r.llegada_at, hs = horas(desde), tarde = hs > META_H[r.estado];
    return h('article', { class: `rc-card${tarde ? ' rc-tarde' : ''}${r.incidencia !== 'ninguna' ? ' rc-inc' : ''}` },
      h('button', { class: 'rc-card-info', type: 'button', onclick: () => ficha(r) },
        h('strong', {}, r.proveedor),
        h('span', { class: 'muted' }, `${r.comprobante || 'Sin comprobante'} · ${r.bultos} bulto${r.bultos === 1 ? '' : 's'}`),
        h('span', { class: 'rc-tags' },
          r.frio ? h('span', { class: `pill ${r.temperatura < 2 || r.temperatura > 8 ? 'pill-bad' : 'pill-info'}` }, `Frío ${r.temperatura} °C`) : null,
          r.incidencia !== 'ninguna' ? h('span', { class: 'pill pill-warn' }, INC[r.incidencia]) : null),
        h('small', { class: tarde ? 'txt-bad' : 'muted' }, `${tarde ? 'Demorada: ' : ''}hace ${fh(hs)} en este paso · llegó ${fechaHora(r.llegada_at)} · ${r.operario}`)),
      h('button', { class: 'btn primary rc-sig', onclick: () => avanzar(r) }, `${ESTADOS.find(e => e[0] === r.estado)[2]} →`));
  }

  function pintar() {
    const abiertas = lista.filter(r => !['disponible', 'rechazado'].includes(r.estado));
    const cerradas = lista.filter(r => r.estado === 'disponible').sort((a, b) => b.disponible_at.localeCompare(a.disponible_at));
    const rechazadas = lista.filter(r => r.estado === 'rechazado');
    const dts = cerradas.map(r => horas(r.llegada_at, r.disponible_at));
    const tarde = abiertas.filter(r => horas(r[DESDE[r.estado]] || r.llegada_at) > META_H[r.estado]).length;
    vista.replaceChildren(
      h('div', { class: 'kpis' },
        ...ESTADOS.slice(0, 4).map(([k, l]) => h('div', { class: 'kpi' }, h('span', { class: 'kpi-val' }, String(abiertas.filter(r => r.estado === k).length)), h('span', { class: 'kpi-label' }, l))),
        h('div', { class: `kpi${tarde ? ' kpi-bad' : ''}` }, h('span', { class: 'kpi-val' }, String(tarde)), h('span', { class: 'kpi-label' }, 'demoradas en algún paso')),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-val' }, dts.length ? fh(mediana(dts)) : '—'), h('span', { class: 'kpi-label' }, 'de la llegada a disponible (mediana 7 días)'),
          h('small', {}, dts.length ? `el 90% en menos de ${fh(dts.sort((a, b) => a - b)[Math.max(0, Math.ceil(dts.length * 0.9) - 1)])}` : 'todavía sin datos'))),
      abiertas.length ? h('div', { class: 'rc-tablero' }, ESTADOS.slice(0, 4).map(([k, l]) => {
        const col = abiertas.filter(r => r.estado === k).sort((a, b) => (a[DESDE[k]] || a.llegada_at).localeCompare(b[DESDE[k]] || b.llegada_at));
        return h('section', { class: 'rc-col' }, h('h2', {}, l, h('span', { class: 'muted' }, ` · ${col.length}`)), col.length ? col.map(tarjeta) : h('p', { class: 'muted rc-vacio' }, 'Nada en este paso.'));
      })) : empty('No hay mercadería pendiente', 'Cuando llegue un proveedor, tocá "Registrar llegada".'),
      cerradas.length || rechazadas.length ? h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Últimos 7 días')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl hover' },
          h('thead', {}, h('tr', {}, ['Proveedor', 'Comprobante', 'Bultos', 'Llegó', 'Disponible', 'Llegada → disponible', 'Recibió'].map((x, i) => h('th', { class: i === 2 || i === 5 ? 'num' : '' }, x)))),
          h('tbody', {}, [...rechazadas, ...cerradas].map(r => h('tr', { onclick: () => ficha(r) },
            h('td', {}, h('strong', {}, r.proveedor)), h('td', {}, r.comprobante || '—'), h('td', { class: 'num' }, String(r.bultos)), h('td', {}, fechaHora(r.llegada_at)),
            h('td', {}, r.estado === 'rechazado' ? h('span', { class: 'pill pill-bad' }, 'Rechazada') : fechaHora(r.disponible_at)),
            h('td', { class: 'num' }, r.disponible_at ? fh(horas(r.llegada_at, r.disponible_at)) : '—'), h('td', {}, r.operario))))))) : null);
  }
  pintar();

  return h('div', { class: 'view drog-rx' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Droguería'), h('h1', {}, 'Recepción de proveedores'),
        h('p', { class: 'muted' }, 'Cada llegada avanza: recibido → en control → listo para ingresar → ingresado en Quantio → guardado y disponible.')),
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: recargar }, 'Actualizar'), h('button', { class: 'btn primary', onclick: registrar }, '+ Registrar llegada'))),
    vista);
}
