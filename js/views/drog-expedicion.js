// Droguería · Expedición a farmacias: por cada salida del cronograma (reparto propio en Río Cuarto y comisionistas de zona)
// se registra qué salió para cada farmacia; la farmacia confirma desde la app que lo recibió (así se mide la entrega real).
import { h, toast, modal, field, empty, confirmar, fechaHora } from '../ui.js?v=20261119-1503';
import { hoyAR, horaAR, sumarDias, fechaLarga, codigoBacha } from './drog-comun.js?v=20261119-1503';
import { salidasDelDia, salidaPorId, EXTRA } from '../olas.js?v=20261119-1503';
import { campoOperario } from './drog-recepcion.js?v=20261119-1503';

const hhmm = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

export async function render({ api, cat }) {
  const farmacias = cat.sucursales.filter(s => s.activo !== false && /^Suc \d+/.test(s.nombre));
  const nombreSuc = id => cat.sucursales.find(s => s.id === id)?.nombre || `Sucursal ${id}`;
  let fecha = hoyAR(), salidas = [], bachas = [];
  const vista = h('div');
  const selFecha = h('input', { type: 'date', value: fecha, max: sumarDias(hoyAR(), 7), onchange: e => { fecha = e.target.value || hoyAR(); cargar(); } });

  async function cargar() {
    [salidas, bachas] = await Promise.all([api.salidasDrog(fecha), api.bachas().catch(() => [])]);
    pintar();
  }
  const operarios = () => [...new Set(salidas.map(s => s.operario))].sort();

  function registrar(ola, sucursal_id) {
    const extra = ola.id === 'extra';
    const suc = extra ? h('select', { id: 'ex-suc' }, h('option', { value: '' }, 'Elegí la farmacia…'), farmacias.map(s => h('option', { value: s.id }, s.nombre))) : null;
    const bultos = h('input', { id: 'ex-bultos', type: 'number', min: 0, max: 999, inputmode: 'numeric', placeholder: '0' });
    const libres = bachas.filter(b => b.estado === 'disponible');
    const elegidas = new Set();
    const lector = h('input', { id: 'ex-bacha', placeholder: 'Escaneá o escribí el código', autocomplete: 'off' });
    const chips = h('div', { class: 'ex-chips' });
    const pintarChips = () => chips.replaceChildren(...[...elegidas].map(id => { const b = libres.find(x => x.id === id);
      return h('button', { type: 'button', class: 'pill pill-info', title: 'Quitar', onclick: () => { elegidas.delete(id); pintarChips(); } }, `${b.codigo} ✕`); }));
    const agregar = () => {
      const cod = codigoBacha(lector.value);
      const b = libres.find(x => x.codigo === cod);
      if (!b) { toast(lector.value.trim() ? 'Esa bacha no está disponible en Droguería' : 'Escribí un código', 'bad'); return; }
      elegidas.add(b.id); lector.value = ''; pintarChips();
    };
    lector.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    const nota = h('input', { id: 'ex-nota', maxlength: 500, placeholder: extra ? 'Motivo del envío extra' : 'Opcional' });
    const op = campoOperario('ex-op', operarios(), 'Despachó');
    modal({ title: extra ? 'Envío extra' : `${ola.nombre} → ${nombreSuc(sucursal_id)}`,
      body: h('div', { class: 'stack' },
        extra ? field('Farmacia', suc) : h('p', { class: 'muted' }, `${fechaLarga(fecha)} · sale ${ola.hora} h · ${ola.reparto}`),
        field('Bultos', bultos, 'Cajas o paquetes sueltos, sin contar las bachas.'),
        libres.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, `Bachas (${libres.length} en Droguería)`),
          h('div', { class: 'ex-bacha-row' }, lector, h('button', { type: 'button', class: 'btn', onclick: agregar }, 'Agregar')), chips,
          h('small', { class: 'hint' }, 'Quedan registradas como salida a esta farmacia, con retorno esperado en 7 días.')) : null,
        field('Nota', nota), ...op.el),
      actions: [{ label: 'Cancelar' }, { label: 'Registrar salida', kind: 'primary', onClick: async () => {
        const sid = extra ? +suc.value : sucursal_id;
        if (!sid) { toast('Elegí la farmacia', 'bad'); return false; }
        if (bultos.value === '' || +bultos.value < 0) { toast('Indicá la cantidad de bultos', 'bad'); return false; }
        if (!+bultos.value && !elegidas.size) { toast('No sale nada: cargá bultos o bachas', 'bad'); return false; }
        if (extra && !nota.value.trim()) { toast('Contá el motivo del envío extra', 'bad'); return false; }
        const quien = op.valor();
        if (!quien) { toast('Indicá quién despachó', 'bad'); return false; }
        // los envíos extra pueden ser varios en el día: se numeran
        const id = extra ? `extra-${salidas.filter(s => s.ola.startsWith('extra') && s.sucursal_id === sid).length + 1}` : ola.id;
        await api.registrarSalida({ fecha, ola: id, ola_nombre: extra ? EXTRA.nombre : ola.nombre, sucursal_id: sid, bultos: +bultos.value, bachas: elegidas.size, operario: quien, nota: nota.value.trim() });
        let fallas = 0;
        for (const bid of elegidas) {
          try { await api.bachaMovimiento({ bacha_id: bid, tipo: 'salida', sucursal_id: sid, retorno_esperado: sumarDias(fecha, 7), observacion: `${extra ? 'Envío extra' : ola.nombre} ${fecha}` }); }
          catch { fallas++; }
        }
        toast(fallas ? `Salida registrada, pero ${fallas} bacha(s) no se pudieron mover: revisalas en Bachas` : 'Salida registrada', fallas ? 'bad' : undefined);
        await cargar();
      } }] });
    setTimeout(() => (suc || bultos).focus(), 50);
  }

  async function deshacer(s) {
    if (!await confirmar('Deshacer salida', `Se borra la salida a ${nombreSuc(s.sucursal_id)} (${s.bultos} bultos). Las bachas, si las hubo, se corrigen aparte en Bachas.`, 'Deshacer', 'danger')) return;
    try { await api.borrarSalida(s.id); toast('Salida borrada'); await cargar(); } catch (e) { toast(e.message, 'bad'); }
  }

  function estadoDe(s, ola) {
    if (s?.recibido_at) return s.recibido_ok ? ['ok', `Recibido ${hhmm(s.recibido_at)}`] : ['bad', 'Recibido con problemas'];
    if (s) return ['info', `Salió ${hhmm(s.salio_at)} · falta que la farmacia confirme`];
    if (fecha < hoyAR() || (fecha === hoyAR() && ola.hora && horaAR() > ola.hora)) return ['warn', 'Atrasada: no se registró la salida'];
    return ['muted', 'Pendiente'];
  }

  function filaSuc(ola, sid) {
    const s = salidas.find(x => x.ola === ola.id && x.sucursal_id === sid);
    const [tono, txt] = estadoDe(s, ola);
    return h('li', { class: `ex-suc ex-${tono}` },
      h('div', {}, h('strong', {}, nombreSuc(sid)), h('small', { class: 'muted' }, ' ', txt),
        s ? h('small', { class: 'ex-det' }, `${s.bultos} bulto${s.bultos === 1 ? '' : 's'}${s.bachas ? ` + ${s.bachas} bacha${s.bachas === 1 ? '' : 's'}` : ''} · ${s.operario}${s.nota ? ` · ${s.nota}` : ''}`) : null,
        s?.recibido_at && !s.recibido_ok ? h('small', { class: 'txt-bad ex-det' }, `Recibió ${s.bultos_recibidos ?? '?'} de ${s.bultos}: ${s.nota_recepcion || ''} (${s.recibido_por || ''})`) : null),
      s ? (!s.recibido_at ? h('button', { class: 'btn ghost-bad ex-sm', onclick: () => deshacer(s) }, 'Deshacer') : null)
        : h('button', { class: 'btn primary ex-sm', onclick: () => registrar(ola, sid) }, 'Registrar salida'));
  }

  function pintar() {
    const olas = salidasDelDia(fecha);
    const extras = salidas.filter(s => !salidaPorId(s.ola) || s.ola.startsWith('extra'));
    const esperadas = olas.reduce((n, o) => n + o.sucursales.length, 0);
    const salieron = salidas.filter(s => olas.some(o => o.id === s.ola)).length;
    const conf = salidas.filter(s => s.recibido_at), prob = conf.filter(s => !s.recibido_ok);
    vista.replaceChildren(
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-val' }, `${salieron}/${esperadas}`), h('span', { class: 'kpi-label' }, 'salidas del cronograma registradas')),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-val' }, String(salidas.reduce((n, s) => n + s.bultos, 0))), h('span', { class: 'kpi-label' }, 'bultos despachados')),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-val' }, `${conf.length}/${salidas.length}`), h('span', { class: 'kpi-label' }, 'confirmadas por la farmacia')),
        h('div', { class: `kpi${prob.length ? ' kpi-bad' : ''}` }, h('span', { class: 'kpi-val' }, String(prob.length)), h('span', { class: 'kpi-label' }, 'llegaron con problemas'))),
      olas.length ? h('div', { class: 'ex-olas' }, olas.map(o => h('section', { class: 'ex-ola' },
        h('header', {}, h('h2', {}, o.nombre), h('span', { class: 'muted' }, `Sale ${o.hora} h · ${o.cortes} · ${o.reparto}`)),
        h('ul', { class: 'ex-lista' }, o.sucursales.map(sid => filaSuc(o, sid))))))
        : empty('No hay salidas programadas este día', 'Domingos y días sin cronograma. Si sale algo igual, registralo como envío extra.'),
      h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Envíos extra'),
        h('button', { class: 'btn', onclick: () => registrar(EXTRA) }, '+ Envío extra')),
        extras.length ? h('ul', { class: 'ex-lista' }, extras.map(s => { const [tono, txt] = estadoDe(s, {});
          return h('li', { class: `ex-suc ex-${tono}` }, h('div', {}, h('strong', {}, nombreSuc(s.sucursal_id)), h('small', { class: 'muted' }, ' ', txt),
            h('small', { class: 'ex-det' }, `${s.bultos} bultos${s.bachas ? ` + ${s.bachas} bachas` : ''} · ${s.operario} · ${s.nota || ''}`)),
            !s.recibido_at ? h('button', { class: 'btn ghost-bad ex-sm', onclick: () => deshacer(s) }, 'Deshacer') : null); }))
          : h('p', { class: 'muted' }, 'Ninguno este día.')));
  }
  await cargar();

  return h('div', { class: 'view drog-rx' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Droguería'), h('h1', {}, 'Expedición a farmacias'),
        h('p', { class: 'muted' }, 'Registrá cada salida al cargar el reparto o entregar al comisionista. La farmacia confirma desde su inicio que lo recibió.')),
      h('div', { class: 'toolbar' }, field('Día', selFecha), h('button', { class: 'btn', onclick: cargar }, 'Actualizar'))),
    vista);
}

