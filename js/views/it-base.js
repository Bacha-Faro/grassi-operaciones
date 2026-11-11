// Soporte IT · Guías y respuestas: la base de soluciones que ve la sucursal antes de cargar un ticket,
// y las respuestas rápidas que usa IT al contestar. Solo IT.
import { h, toast, modal, field, empty, tabs, confirmar } from '../ui.js?v=20261111-1654';
import { pasosLista } from './ticket.js?v=20261111-1654';

export async function render({ api }) {
  let [guias, respuestas, cats, usos] = await Promise.all([api.itSoluciones(), api.itRespuestas(), api.itCategorias(), api.itSolucionesUsos().catch(() => [])]);
  let pestaña = 'guias';
  const cont = h('div', { class: 'stack' });
  const catNom = id => cats.find(c => c.id === id)?.nombre || 'Cualquier categoría';
  const recargar = async () => { [guias, respuestas, usos] = await Promise.all([api.itSoluciones(), api.itRespuestas(), api.itSolucionesUsos().catch(() => [])]); pintarTabs(); pintar(); };
  const hace30 = new Date(Date.now() - 30 * 86400e3).toISOString();
  const usosDe = id => { const u = usos.filter(x => x.solucion_id === id); return { total: u.length, mes: u.filter(x => x.created_at >= hace30).length }; };
  const selCat = (v, vacio) => h('select', {}, h('option', { value: '' }, vacio), cats.map(c => h('option', { value: c.id, selected: c.id === v }, c.nombre)));

  function fichaGuia(g = {}) {
    const nuevo = !g.id;
    const titulo = h('input', { maxlength: 100, value: g.titulo || '', placeholder: 'Ej.: La impresora no imprime' });
    const categoria = selCat(g.categoria_id, 'Elegí la categoría…');
    const pasos = h('textarea', { rows: 7, maxlength: 4000, value: g.pasos || '', placeholder: 'Un paso por línea, cortos y en orden.\nEj.: Apagá la impresora y esperá 30 segundos.' });
    const activo = h('input', { type: 'checkbox', checked: g.activo !== false });
    const vista = h('div', { class: 'guia-vista' });
    const prev = () => vista.replaceChildren(h('small', { class: 'muted' }, 'Así la ve la sucursal:'), pasosLista(pasos.value));
    pasos.addEventListener('input', prev); prev();
    modal({ title: nuevo ? 'Nueva guía' : 'Editar guía', wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, field('Título (el problema, como lo diría la sucursal)', titulo), field('Categoría', categoria, 'Aparece cuando eligen esta categoría al cargar el ticket.')),
        field('Pasos', pasos, 'Un paso por línea. Lo último puede ser: "Si sigue igual, cargá el ticket".'), vista,
        h('label', { class: 'check-mini' }, activo, ' Visible para las sucursales')),
      actions: [
        ...(nuevo ? [] : [{ label: 'Borrar', kind: 'danger-link', onClick: async () => {
          if (!(await confirmar('Borrar guía', `¿Borrar "${g.titulo}"? Si solo querés esconderla, destildá "Visible".`, 'Borrar', 'danger'))) return false;
          try { await api.borrarSolucion(g.id); toast('Guía borrada'); recargar(); } catch (e) { toast(e.message, 'bad'); return false; }
        } }]),
        { label: 'Cancelar' }, { label: nuevo ? 'Agregar' : 'Guardar', kind: 'primary', onClick: async () => {
          if (titulo.value.trim().length < 3) { toast('Poné un título', 'bad'); return false; }
          if (!categoria.value) { toast('Elegí la categoría', 'bad'); return false; }
          if (pasos.value.trim().length < 3) { toast('Escribí los pasos', 'bad'); return false; }
          try { await api.guardarSolucion({ id: g.id, titulo: titulo.value.trim(), categoria_id: categoria.value, pasos: pasos.value.trim(), activo: activo.checked, orden: g.orden ?? 1 });
            toast(nuevo ? 'Guía agregada' : 'Cambios guardados'); recargar(); }
          catch (e) { toast(e.message, 'bad'); return false; }
        } }] });
  }

  function fichaRespuesta(r = {}) {
    const nuevo = !r.id;
    const titulo = h('input', { maxlength: 60, value: r.titulo || '', placeholder: 'Ej.: Conexión remota' });
    const categoria = selCat(r.categoria_id, 'Cualquier categoría');
    const texto = h('textarea', { rows: 4, maxlength: 2000, value: r.texto || '', placeholder: 'El mensaje tal como le llega a la sucursal' });
    const orden = h('input', { type: 'number', min: 0, max: 999, value: r.orden ?? respuestas.length + 1 });
    const activo = h('input', { type: 'checkbox', checked: r.activo !== false });
    modal({ title: nuevo ? 'Nueva respuesta rápida' : 'Editar respuesta rápida',
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, field('Nombre corto', titulo, 'El que ves en la lista'), field('Mostrar en', categoria)),
        field('Texto', texto, 'Al elegirla se copia en la respuesta y la podés retocar antes de enviar.'),
        h('div', { class: 'grid2' }, field('Orden', orden), h('label', { class: 'check-mini', style: 'align-self:end' }, activo, ' Activa'))),
      actions: [
        ...(nuevo ? [] : [{ label: 'Borrar', kind: 'danger-link', onClick: async () => {
          if (!(await confirmar('Borrar respuesta', `¿Borrar "${r.titulo}"?`, 'Borrar', 'danger'))) return false;
          try { await api.borrarRespuesta(r.id); toast('Respuesta borrada'); recargar(); } catch (e) { toast(e.message, 'bad'); return false; }
        } }]),
        { label: 'Cancelar' }, { label: nuevo ? 'Agregar' : 'Guardar', kind: 'primary', onClick: async () => {
          if (titulo.value.trim().length < 2) { toast('Poné un nombre', 'bad'); return false; }
          if (texto.value.trim().length < 2) { toast('Escribí el texto', 'bad'); return false; }
          try { await api.guardarRespuesta({ id: r.id, titulo: titulo.value.trim(), categoria_id: categoria.value, texto: texto.value.trim(), orden: +orden.value || 0, activo: activo.checked });
            toast(nuevo ? 'Respuesta agregada' : 'Cambios guardados'); recargar(); }
          catch (e) { toast(e.message, 'bad'); return false; }
        } }] });
  }

  function pintar() {
    if (pestaña === 'guias') {
      if (!guias.length) return cont.replaceChildren(empty('Todavía no hay guías', 'Escribí la primera con "+ Nueva guía".'));
      const porCat = cats.map(c => [c, guias.filter(g => g.categoria_id === c.id)]).filter(([, gs]) => gs.length);
      const sinCat = guias.filter(g => !cats.some(c => c.id === g.categoria_id));
      cont.replaceChildren(
        h('p', { class: 'muted' }, 'Cuando una sucursal elige la categoría al cargar un ticket, ve estas guías. Si alguna le soluciona el problema, toca "Listo, se solucionó" y no carga el ticket.'),
        ...[...porCat, ...(sinCat.length ? [[{ nombre: 'Sin categoría' }, sinCat]] : [])].map(([c, gs]) => h('section', { class: 'base-grupo' },
          h('h2', {}, c.nombre),
          h('ul', { class: 'cards' }, gs.map(g => { const u = usosDe(g.id); return h('li', { class: `card${g.activo ? '' : ' inactivo'}` },
            h('button', { class: 'card-row', onclick: () => fichaGuia(g) },
              h('span', { class: 'card-main' }, h('strong', {}, g.titulo),
                h('small', { class: 'muted' }, `${String(g.pasos).split('\n').filter(x => x.trim()).length} pasos${u.total ? ` · resolvió ${u.total} ${u.total > 1 ? 'veces' : 'vez'}${u.mes ? ` (${u.mes} en los últimos 30 días)` : ''}` : ''}`)),
              g.activo ? null : h('span', { class: 'pill pill-muted' }, 'Oculta'))); })))));
    } else {
      if (!respuestas.length) return cont.replaceChildren(empty('Todavía no hay respuestas rápidas', 'Agregá la primera con "+ Nueva respuesta".'));
      cont.replaceChildren(
        h('p', { class: 'muted' }, 'En cada ticket, arriba de la caja de respuesta, elegís "⚡ Respuesta rápida" y el texto se copia para que lo retoques.'),
        h('ul', { class: 'cards' }, [...respuestas].sort((a, b) => a.orden - b.orden).map(r => h('li', { class: `card${r.activo ? '' : ' inactivo'}` },
          h('button', { class: 'card-row', onclick: () => fichaRespuesta(r) },
            h('span', { class: 'card-main' }, h('strong', {}, r.titulo), h('small', { class: 'muted' }, `${catNom(r.categoria_id)} · ${r.texto.length > 110 ? `${r.texto.slice(0, 110)}…` : r.texto}`)),
            r.activo ? null : h('span', { class: 'pill pill-muted' }, 'Inactiva'))))));
    }
  }
  const tabBar = h('div');
  const boton = h('button', { class: 'btn primary', onclick: () => (pestaña === 'guias' ? fichaGuia() : fichaRespuesta()) });
  const pintarTabs = () => {
    tabBar.replaceChildren(tabs([['guias', 'Guías para las sucursales', guias.length], ['respuestas', 'Respuestas rápidas', respuestas.length]], pestaña, p => { pestaña = p; pintarTabs(); pintar(); }));
    boton.textContent = pestaña === 'guias' ? '+ Nueva guía' : '+ Nueva respuesta';
  };
  pintarTabs(); pintar();

  return h('div', { class: 'view it-base' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Soporte IT'), h('h1', {}, 'Guías y respuestas'),
        h('p', { class: 'muted' }, 'Lo simple, que lo resuelva la sucursal sola. Lo repetido, que IT lo conteste con un toque.')),
      boton),
    h('div', { class: 'toolbar' }, tabBar),
    cont);
}
