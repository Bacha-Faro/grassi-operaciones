// Grassi Analytics · Tableros: los tableros de Power BI de gestión, dentro de la app. Los carga IT; los ven IT, gerencia y dirección.
import { h, toast, modal, field, empty, confirmar } from '../ui.js?v=20261113-1924';

const ES_PBI = /^https:\/\/app\.powerbi\.com\//;

export async function render({ api, me, params }) {
  let lista = await api.tableros();
  const esIT = !!me.soporte;
  const cont = h('div', { class: 'tab-cont' });
  const recargar = async () => { lista = await api.tableros(); pintar(); };

  function ficha(t = {}) {
    const nuevo = !t.id;
    const titulo = h('input', { id: 'tb-titulo', maxlength: 100, value: t.titulo || '', placeholder: 'Ej.: Ventas por sucursal' });
    const desc = h('input', { id: 'tb-desc', maxlength: 200, value: t.descripcion || '', placeholder: 'Qué muestra, en una línea' });
    const areas = [...new Set(lista.map(x => x.area).filter(Boolean))];
    const area = h('input', { id: 'tb-area', maxlength: 40, value: t.area || '', placeholder: 'Ej.: Gerencia, Contabilidad, Operaciones', list: 'tb-areas' });
    const url = h('input', { id: 'tb-url', type: 'url', value: t.url || '', placeholder: 'https://app.powerbi.com/view?r=…' });
    const orden = h('input', { id: 'tb-orden', type: 'number', value: t.orden ?? lista.length + 1, min: 0, max: 999 });
    const activo = h('input', { type: 'checkbox', id: 'tb-activo', checked: t.activo !== false });
    modal({ title: nuevo ? 'Agregar tablero' : 'Editar tablero', body: h('div', { class: 'stack' },
      field('Título', titulo), field('Descripción', desc),
      h('div', { class: 'grid2' }, field('Área', area), field('Orden', orden, 'Los de número más bajo aparecen primero.')),
      h('datalist', { id: 'tb-areas' }, areas.map(a => h('option', { value: a }))),
      field('Link de Power BI', url, 'En Power BI: Archivo → Insertar informe → Sitio web o portal. Copiá el link (o el código HTML entero). Quien lo vea tiene que tener acceso al informe en Power BI.'),
      h('label', { class: 'check-mini' }, activo, ' Visible')),
      actions: [
        ...(nuevo ? [] : [{ label: 'Borrar', kind: 'danger-link', onClick: async () => {
          if (!(await confirmar('Borrar tablero', `¿Sacar "${t.titulo}" de la app? (En Power BI no cambia nada.)`, 'Borrar', 'danger'))) return false;
          try { await api.borrarTablero(t.id); toast('Tablero borrado'); recargar(); } catch (e) { toast(e.message, 'bad'); return false; }
        } }]),
        { label: 'Cancelar' }, { label: nuevo ? 'Agregar' : 'Guardar', kind: 'primary', onClick: async () => {
          // si pegan el código <iframe …>, nos quedamos con el link
          const link = (url.value.match(/src="([^"]+)"/)?.[1] || url.value).trim();
          if (titulo.value.trim().length < 2) { toast('Poné un título', 'bad'); return false; }
          if (!ES_PBI.test(link)) { toast('El link tiene que empezar con https://app.powerbi.com/', 'bad'); return false; }
          try { await api.guardarTablero({ id: t.id, titulo: titulo.value, descripcion: desc.value.trim(), area: area.value.trim(), url: link, orden: orden.value, activo: activo.checked });
            toast(nuevo ? 'Tablero agregado' : 'Cambios guardados'); recargar(); }
          catch (e) { toast(e.message, 'bad'); return false; }
        } }] });
  }

  // un tablero abierto ocupa toda la vista
  function abrir(t) {
    const marco = h('div', { class: 'tab-marco' },
      h('iframe', { src: t.url, title: t.titulo, allowfullscreen: true, loading: 'eager', referrerpolicy: 'no-referrer' }));
    const seguro = /reportEmbed/i.test(t.url);
    cont.replaceChildren(
      seguro ? h('p', { class: 'muted tab-ayuda' }, 'Si te pide iniciar sesión, entrá con tu cuenta de Microsoft de la empresa (la de Power BI). Es una sola vez por navegador.') : null,
      h('div', { class: 'toolbar tab-barra' },
        h('div', { class: 'tab-titulo' }, h('button', { class: 'btn', onclick: () => pintar() }, '‹ Tableros'),
          h('div', {}, h('strong', {}, t.titulo), t.area ? h('small', { class: 'muted' }, ` · ${t.area}`) : null)),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn', onclick: () => marco.requestFullscreen?.() }, 'Pantalla completa'),
          h('a', { class: 'btn', href: t.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir en Power BI ↗'))),
      marco);
    document.querySelector('.main')?.scrollTo?.(0, 0);
  }

  function pintar() {
    const vis = lista.filter(t => t.activo || esIT);
    if (!vis.length) return cont.replaceChildren(empty('Todavía no hay tableros', esIT ? 'Agregá el primero con "+ Agregar tablero".' : 'Cuando IT los cargue, aparecen acá.'));
    const porArea = {};
    for (const t of vis) (porArea[t.area || 'Otros'] ||= []).push(t);
    cont.replaceChildren(...Object.entries(porArea).map(([area, ts]) => h('section', { class: 'tab-area' },
      Object.keys(porArea).length > 1 ? h('h2', {}, area) : null,
      h('div', { class: 'tab-grid' }, ts.map(t => h('article', { class: `tab-card${t.activo ? '' : ' inactivo'}` },
        h('button', { class: 'tab-abrir', onclick: () => abrir(t) },
          h('span', { class: 'tab-ico', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/></svg>' }),
          h('strong', {}, t.titulo), t.descripcion ? h('span', { class: 'muted' }, t.descripcion) : null,
          t.activo ? null : h('span', { class: 'pill pill-muted' }, 'Oculto')),
        esIT ? h('button', { class: 'link tab-editar', onclick: () => ficha(t) }, 'Editar') : null))))));
  }
  pintar();
  if (params?.t) { const t = lista.find(x => x.id === +params.t); if (t) abrir(t); }

  return h('div', { class: 'view tableros' },
    h('header', { class: 'view-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Grassi Analytics'), h('h1', {}, 'Tableros'),
        h('p', { class: 'muted' }, 'Los tableros de gestión de Power BI. Tocá uno para abrirlo.')),
      esIT ? h('button', { class: 'btn primary', onclick: () => ficha() }, '+ Agregar tablero') : null),
    cont);
}
