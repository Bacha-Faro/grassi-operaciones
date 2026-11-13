// Droguería · Temperatura y humedad: carga de las lecturas del día por turno y planilla del mes (para ANMAT).
import { h, toast, empty, tabs } from '../ui.js?v=20261113-1822';
import { hoyAR, sumarDias, fechaLarga, fechaCorta, turnosDe, estadoTurno, fmt, rangoTxt, fuera, TODOS_TURNOS, cargarFeriados, feriadoDe } from './drog-comun.js?v=20261113-1822';

const ESTADO_TXT = { hecho: ['Cargado', 'ok'], ahora: ['Toca ahora', 'warn'], atrasado: ['Pendiente', 'bad'], proximo: ['Más tarde', 'muted'] };

export async function render({ api, refresh }) {
  const hoy = hoyAR();
  let fecha = hoy, pestaña = 'cargar', mes = hoy.slice(0, 7);
  const puntos = await api.tempPuntos();
  await cargarFeriados(api);
  if (!puntos.length) return empty('Sin acceso', 'Este módulo es de la Droguería.');
  const cont = h('div', { class: 'stack' });

  // ---------- cargar las lecturas de un día ----------
  async function pintarCarga() {
    const lect = await api.tempLecturas(fecha, fecha);
    const turnos = turnosDe(fecha);
    const de = (p, t) => lect.find(l => l.punto_id === p.id && l.turno === t);
    const selector = h('div', { class: 'toolbar filters' },
      h('button', { class: 'btn', onclick: () => { fecha = sumarDias(fecha, -1); pintarCarga(); } }, '‹ Día anterior'),
      h('input', { type: 'date', value: fecha, max: hoy, 'aria-label': 'Fecha', onchange: e => { fecha = e.target.value || hoy; pintarCarga(); } }),
      fecha < hoy ? h('button', { class: 'btn', onclick: () => { fecha = sumarDias(fecha, 1); pintarCarga(); } }, 'Día siguiente ›') : null,
      fecha !== hoy ? h('button', { class: 'link', onclick: () => { fecha = hoy; pintarCarga(); } }, 'Volver a hoy') : null);
    if (!turnos.length) return cont.replaceChildren(selector, feriadoDe(fecha)
      ? empty(`${fechaLarga(fecha)}: feriado`, `${feriadoDe(fecha).nombre}. Los feriados no hay lecturas.`)
      : empty(`${fechaLarga(fecha)}: domingo`, 'Los domingos no hay lecturas.'));

    const bloques = turnos.map(turno => {
      const hechas = puntos.filter(p => de(p, turno)).length;
      const est = estadoTurno(fecha, turno, hechas, puntos.length);
      const editable = fecha === hoy || false;
      const filas = puntos.map(p => {
        const l = de(p, turno);
        const t = h('input', { type: 'number', step: '0.1', inputmode: 'decimal', value: l ? l.temperatura : '', 'aria-label': `Temperatura ${p.nombre} ${turno}`, placeholder: '°C', disabled: !editable && !!l });
        const hu = p.mide_humedad ? h('input', { type: 'number', step: '1', inputmode: 'decimal', value: l?.humedad ?? '', 'aria-label': `Humedad ${p.nombre} ${turno}`, placeholder: '% HR', disabled: !editable && !!l }) : null;
        const acc = h('input', { type: 'text', maxlength: 500, value: l?.accion || '', placeholder: 'Fuera de rango: ¿qué se hizo?', 'aria-label': `Acción correctiva ${p.nombre}`, disabled: !editable && !!l });
        const accBox = h('div', { class: 'temp-accion', hidden: !l?.fuera_rango }, acc);
        const marca = h('span', { class: 'temp-marca' });
        const chequear = () => {
          const tv = t.value === '' ? null : +t.value, hv = hu ? (hu.value === '' ? null : +hu.value) : null;
          const mal = tv !== null && fuera(p, tv, hv);
          accBox.hidden = !mal; marca.textContent = tv === null ? '' : mal ? 'Fuera de rango' : 'OK';
          marca.className = `temp-marca ${tv === null ? '' : mal ? 'mal' : 'bien'}`;
          fila.classList.toggle('temp-fuera', mal);
        };
        t.addEventListener('input', chequear); hu?.addEventListener('input', chequear);
        const fila = h('div', { class: 'temp-fila' },
          h('div', { class: 'temp-punto' }, h('strong', {}, p.nombre), h('small', { class: 'muted' }, rangoTxt(p))),
          h('label', { class: 'temp-in' }, t, h('span', {}, '°C')),
          hu ? h('label', { class: 'temp-in' }, hu, h('span', {}, '%')) : h('span', { class: 'temp-in vacio' }, 'sin humedad'),
          marca, accBox);
        fila._leer = () => ({ punto_id: p.id, fecha, turno, temperatura: t.value === '' ? null : +t.value, humedad: hu ? (hu.value === '' ? null : +hu.value) : null, accion: acc.value.trim() });
        chequear();
        return fila;
      });
      const guardar = async () => {
        const datos = filas.map(f => f._leer());
        if (datos.some(d => d.temperatura === null)) return toast('Completá la temperatura de los tres equipos', 'bad');
        try { await api.tempGuardar(datos); toast(`Lecturas de las ${turno} guardadas`); pintarCarga(); }
        catch (e) { toast(e.message, 'bad'); }
      };
      const [txt, tono] = ESTADO_TXT[est];
      return h('section', { class: `temp-turno est-${est}` },
        h('header', {}, h('strong', { class: 'temp-hora' }, turno), h('span', { class: `pill pill-${tono}` }, txt),
          hechas && lect.some(l => l.turno === turno && l.usuario_nombre) ? h('small', { class: 'muted' }, `por ${lect.find(l => l.turno === turno).usuario_nombre}`) : null),
        filas,
        editable ? h('div', { class: 'temp-pie' }, h('button', { class: 'btn primary', onclick: guardar }, hechas ? 'Guardar corrección' : `Guardar lecturas de las ${turno}`))
          : hechas < puntos.length ? h('p', { class: 'muted temp-pie' }, 'Lecturas de días anteriores: solo IT puede cargarlas o corregirlas.') : null);
    });
    cont.replaceChildren(selector, h('p', { class: 'muted' }, fechaLarga(fecha)), h('div', { class: 'temp-turnos' }, bloques));
  }

  // ---------- planilla del mes ----------
  async function pintarPlanilla() {
    const desde = `${mes}-01`, fin = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate(), hasta = `${mes}-${String(fin).padStart(2, '0')}`;
    const lect = await api.tempLecturas(desde, hasta);
    const dias = Array.from({ length: fin }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`).filter(d => d <= hoy && turnosDe(d).length);
    const idx = new Map(lect.map(l => [`${l.punto_id}|${l.fecha}|${l.turno}`, l]));
    const celda = (p, d, t) => {
      if (!turnosDe(d).includes(t)) return h('td', { class: 'num muted' }, '');
      const l = idx.get(`${p.id}|${d}|${t}`);
      if (!l) return h('td', { class: 'num falta', title: 'Sin lectura' }, '—');
      return h('td', { class: `num${l.fuera_rango ? ' fuera' : ''}`, title: l.accion || '' }, fmt(l.temperatura), p.mide_humedad ? h('small', {}, ` ${fmt(l.humedad)}%`) : null);
    };
    const faltan = dias.reduce((a, d) => a + turnosDe(d).filter(t => !(d === hoy && estadoTurno(d, t, 0, 1) === 'proximo')).length * puntos.length, 0) - lect.filter(l => dias.includes(l.fecha)).length;
    const fueras = lect.filter(l => l.fuera_rango);
    const csv = () => {
      const filas = [['Fecha', 'Hora', 'Equipo', 'Temperatura (°C)', 'Humedad (%)', 'Fuera de rango', 'Acción correctiva', 'Cargó']];
      for (const l of [...lect].sort((a, b) => (a.fecha + a.turno).localeCompare(b.fecha + b.turno)))
        filas.push([l.fecha, l.turno, puntos.find(p => p.id === l.punto_id)?.nombre, fmt(l.temperatura), l.humedad === null ? '' : fmt(l.humedad), l.fuera_rango ? 'Sí' : 'No', l.accion || '', l.usuario_nombre || '']);
      const txt = '﻿' + filas.map(f => f.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = h('a', { href: URL.createObjectURL(new Blob([txt], { type: 'text/csv' })), download: `Temperatura y humedad ${mes}.csv` }); document.body.append(a); a.click(); a.remove();
    };
    cont.replaceChildren(
      h('div', { class: 'toolbar filters' },
        h('input', { type: 'month', value: mes, max: hoy.slice(0, 7), 'aria-label': 'Mes', onchange: e => { mes = e.target.value || hoy.slice(0, 7); pintarPlanilla(); } }),
        h('button', { class: 'btn', onclick: csv }, 'Descargar planilla (Excel/CSV)'),
        h('button', { class: 'btn', onclick: () => window.print() }, 'Imprimir')),
      h('div', { class: 'temp-resumen' },
        h('span', {}, h('strong', {}, String(lect.length)), ' lecturas'),
        h('span', { class: faltan > 0 ? 'mal' : '' }, h('strong', {}, String(Math.max(0, faltan))), ' sin cargar'),
        h('span', { class: fueras.length ? 'mal' : '' }, h('strong', {}, String(fueras.length)), ' fuera de rango')),
      ...puntos.map(p => h('section', { class: 'block temp-planilla' },
        h('div', { class: 'block-head' }, h('h2', {}, p.nombre), h('small', { class: 'muted' }, `Rango: ${rangoTxt(p)}`)),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Día'), TODOS_TURNOS.map(t => h('th', { class: 'num' }, t)))),
          h('tbody', {}, dias.map(d => h('tr', {}, h('td', {}, fechaCorta(d)), TODOS_TURNOS.map(t => celda(p, d, t))))))))),
      fueras.length ? h('section', { class: 'block' }, h('div', { class: 'block-head' }, h('h2', {}, 'Fuera de rango y acciones')),
        h('ul', { class: 'temp-acciones' }, fueras.map(l => h('li', {}, h('strong', {}, `${fechaCorta(l.fecha)} ${l.turno} · ${puntos.find(p => p.id === l.punto_id)?.nombre}: ${fmt(l.temperatura)} °C${l.humedad !== null ? ` · ${fmt(l.humedad)} %` : ''}`), h('span', {}, l.accion || 'Sin acción anotada'))))) : null);
  }

  const tabBar = h('div');
  const pintarTabs = () => tabBar.replaceChildren(tabs([['cargar', 'Cargar lecturas'], ['planilla', 'Planilla del mes']], pestaña, id => { pestaña = id; pintarTabs(); (id === 'cargar' ? pintarCarga : pintarPlanilla)(); }));
  pintarTabs(); await pintarCarga();

  return h('div', { class: 'view temperatura' },
    h('header', { class: 'view-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'Droguería Grassi'), h('h1', {}, 'Temperatura y humedad'),
      h('p', { class: 'muted' }, 'Lunes a viernes: 8:10, 12:00, 15:30 y 18:50. Sábados: 8:10 y 12:00. Rangos según ANMAT. Si un valor está fuera de rango, hay que anotar qué se hizo.'))),
    h('div', { class: 'toolbar no-print' }, tabBar),
    cont);
}
