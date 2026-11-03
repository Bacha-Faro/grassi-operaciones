// Documento de Orden de Compra: vista HTML y PDF (mismos campos que la planilla
// "ORDEN DE COMPRA ARTICULOS INSUMOS": comprador, proveedor, ítems, forma de pago, entrega, firma).
import { h, money, n, fecha, ocNum, docNum, groupBy } from './ui.js?v=20261102-1650';

// Agrupa lo que hay que entregar por dirección: [{ direccion, sucursales, items: [{producto, cantidad}] }]
export function entregas(oc) {
  const porDir = groupBy(oc.distribucion || [], d => d.direccion || 'Dirección a confirmar');
  return Object.entries(porDir).map(([direccion, ds]) => {
    const items = Object.entries(groupBy(ds, d => d.producto)).map(([producto, xs]) => ({ producto, cantidad: xs.reduce((a, x) => a + Number(x.cantidad), 0) }));
    return { direccion, sucursales: [...new Set(ds.map(d => d.sucursal))], items: items.sort((a, b) => a.producto.localeCompare(b.producto)) };
  }).sort((a, b) => a.direccion.localeCompare(b.direccion));
}

// Para la orden de preparación (proveedor interno): qué armar para cada sucursal
export function porSucursal(oc) {
  const g = groupBy(oc.distribucion || [], d => d.sucursal);
  return Object.entries(g).map(([sucursal, ds]) => {
    const items = Object.entries(groupBy(ds, d => d.producto)).map(([producto, xs]) => ({ producto, cantidad: xs.reduce((a, x) => a + Number(x.cantidad), 0) }));
    return { sucursal, direccion: ds[0].direccion || '', items: items.sort((a, b) => a.producto.localeCompare(b.producto)) };
  }).sort((a, b) => a.sucursal.localeCompare(b.sucursal, 'es', { numeric: true }));
}

// ---------- marca: logo y colores de Farmacias Grassi ----------
const AZUL = [0, 85, 184], VERDE = [113, 168, 80], TINTA = [20, 27, 43], GRIS = [90, 100, 120], CELESTE = [230, 238, 248];
let LOGO = null;   // dataURL del logo, para el PDF
export const logoListo = fetch('img/logo-grassi.png').then(r => r.ok ? r.blob() : null)
  .then(b => b && new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }))
  .then(d => { LOGO = d; return d; }).catch(() => null);

const logoHTML = () => h('div', { class: 'ocdoc-logo' },
  h('img', { class: 'logo-claro', src: 'img/logo-grassi.png', alt: 'Farmacias Grassi' }),
  h('img', { class: 'logo-oscuro', src: 'img/logo-grassi-claro.png', alt: 'Farmacias Grassi' }));

// Encabezado del PDF: logo a la izquierda, tipo de documento y número a la derecha, filete azul con acento verde
function encabezado(doc, titulo, num, oc) {
  const W = 210, M = 16;
  if (LOGO) doc.addImage(LOGO, 'PNG', M, 11, 44, 44 * 184 / 400);
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...AZUL); doc.text('Farmacias Grassi', M, 22); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...AZUL); doc.text(titulo, W - M, 17, { align: 'right' });
  doc.setFontSize(12); doc.setTextColor(...TINTA); doc.text(num, W - M, 24, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
  doc.text(`Fecha: ${fecha(oc.fecha)}${oc.periodo ? `   ·   Período: ${oc.periodo}` : ''}`, W - M, 30, { align: 'right' });
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.7); doc.line(M, 37, W - M, 37);
  doc.setDrawColor(...VERDE); doc.setLineWidth(1.6); doc.line(M, 37, M + 28, 37);
  doc.setTextColor(...TINTA);
  return 46;
}
function tituloSeccion(doc, texto, y) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...AZUL); doc.text(texto, 16, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...TINTA);
}
// Pie en todas las páginas
function pie(doc, texto) {
  const W = 210, M = 16, n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 226, 236); doc.setLineWidth(0.3); doc.line(M, 284, W - M, 284);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(texto, M, 289); doc.text(`Página ${i} de ${n}`, W - M, 289, { align: 'right' });
  }
  doc.setTextColor(...TINTA);
}
const tablaBase = { styles: { fontSize: 9, cellPadding: 2.2, textColor: TINTA, lineColor: [226, 231, 239] },
  headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold' },
  footStyles: { fillColor: CELESTE, textColor: TINTA, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [247, 249, 252] }, margin: { left: 16, right: 16, bottom: 18 } };
const firma = (doc, x, y, texto) => { doc.setDrawColor(...GRIS); doc.setLineWidth(0.3); doc.line(x, y, x + 60, y);
  doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text(texto, x + 30, y + 5, { align: 'center' }); doc.setTextColor(...TINTA); };

function opHTML(oc) {
  const p = oc.proveedorObj || {};
  const sucs = porSucursal(oc);
  return h('article', { class: 'ocdoc' },
    h('header', { class: 'ocdoc-head' }, logoHTML(),
      h('div', { class: 'ocdoc-titulo' }, h('p', { class: 'ocdoc-tipo' }, 'Orden de preparación'), h('p', { class: 'ocdoc-num mono' }, docNum(oc)),
        h('p', { class: 'muted' }, `${fecha(oc.fecha)}${oc.periodo ? ` · ${oc.periodo}` : ''}`))),
    h('p', { class: 'ocdoc-sub' }, h('strong', {}, p.nombre || oc.proveedor), ` · pedido interno de ${sucs.length} sucursal${sucs.length === 1 ? '' : 'es'} · no se factura`),
    h('p', { class: 'eyebrow' }, 'Total a preparar'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'Cantidad'), h('th', {}, 'Artículo'), h('th', { class: 'num' }, 'Precio unit.'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', {}, oc.items.map(i => h('tr', {},
        h('td', { class: 'num' }, n(i.cantidad)), h('td', {}, i.producto, h('span', { class: 'muted' }, ` · ${i.unidad}`)),
        h('td', { class: 'num' }, money(i.precio_unit)), h('td', { class: 'num' }, money(i.cantidad * i.precio_unit))))),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 3 }, 'Valor total (sin IVA)'), h('td', { class: 'num' }, money(oc.total)))))),
    sucs.length ? h('section', { class: 'ocdoc-entregas' }, h('p', { class: 'eyebrow' }, 'Preparar por sucursal'),
      h('div', { class: 'entregas-grid' }, sucs.map(s => h('div', { class: 'entrega' },
        h('strong', {}, s.sucursal), s.direccion ? h('small', { class: 'muted' }, s.direccion) : null,
        h('ul', {}, s.items.map(i => h('li', {}, h('span', {}, i.producto), h('span', { class: 'mono' }, n(i.cantidad))))))))) : null,
    h('dl', { class: 'ocdoc-foot' },
      h('div', {}, h('dt', {}, 'Fecha de entrega'), h('dd', {}, fecha(oc.fecha_entrega))),
      oc.observaciones ? h('div', {}, h('dt', {}, 'Observaciones'), h('dd', {}, oc.observaciones)) : null));
}

export function ocHTML(oc) {
  if (oc.interno) return opHTML(oc);
  const e = oc.empresaObj || {}, p = oc.proveedorObj || {};
  return h('article', { class: 'ocdoc' },
    h('header', { class: 'ocdoc-head' }, logoHTML(),
      h('div', { class: 'ocdoc-titulo' }, h('p', { class: 'ocdoc-tipo' }, 'Orden de compra'), h('p', { class: 'ocdoc-num mono' }, ocNum(oc.id)),
        h('p', { class: 'muted' }, `${fecha(oc.fecha)}${oc.periodo ? ` · ${oc.periodo}` : ''}`))),
    h('div', { class: 'ocdoc-parties' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Proveedor'), h('strong', {}, p.nombre),
        h('p', {}, [p.cuit && `CUIT ${p.cuit}`, p.direccion, p.telefono, p.email].filter(Boolean).join(' · ') || '—')),
      h('div', { class: 'ocdoc-facturar' }, h('p', { class: 'eyebrow' }, 'Facturar a'), h('strong', {}, e.razon_social || oc.empresa),
        h('p', { class: 'mono' }, e.cuit ? `CUIT ${e.cuit}` : 'CUIT a completar'),
        h('p', {}, [e.telefono, e.email_compras].filter(Boolean).join(' · ') || null))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'Cantidad'), h('th', {}, 'Artículo'), h('th', { class: 'num' }, 'Precio unit.'), h('th', { class: 'num' }, 'Total'))),
      h('tbody', {}, oc.items.map(i => h('tr', {},
        h('td', { class: 'num' }, n(i.cantidad)), h('td', {}, i.producto, h('span', { class: 'muted' }, ` · ${i.unidad}`)),
        h('td', { class: 'num' }, money(i.precio_unit)), h('td', { class: 'num' }, money(i.cantidad * i.precio_unit))))),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 3 }, 'Monto total (sin IVA)'), h('td', { class: 'num' }, money(oc.total)))))),
    entregas(oc).length ? h('section', { class: 'ocdoc-entregas' }, h('p', { class: 'eyebrow' }, 'Entregar en'),
      h('div', { class: 'entregas-grid' }, entregas(oc).map(en => h('div', { class: 'entrega' },
        h('strong', {}, en.direccion), h('small', { class: 'muted' }, en.sucursales.join(' · ')),
        h('ul', {}, en.items.map(i => h('li', {}, h('span', {}, i.producto), h('span', { class: 'mono' }, n(i.cantidad))))))))) : null,
    h('dl', { class: 'ocdoc-foot' },
      h('div', {}, h('dt', {}, 'Forma de pago'), h('dd', {}, oc.forma_pago || '—')),
      h('div', {}, h('dt', {}, 'Fecha de entrega'), h('dd', {}, fecha(oc.fecha_entrega))),
      oc.observaciones ? h('div', {}, h('dt', {}, 'Observaciones'), h('dd', {}, oc.observaciones)) : null));
}

// Devuelve el jsPDF listo; .save() para descargar, .output('datauristring') para adjuntar.
function opPDF(oc) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const p = oc.proveedorObj || {};
  const W = 210, M = 16;
  let y = encabezado(doc, 'ORDEN DE PREPARACIÓN', docNum(oc), oc);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(p.nombre || oc.proveedor || 'Droguería', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text('Pedido interno de las sucursales · no se factura', M, y + 5); doc.setTextColor(...TINTA);
  y += 14;

  tituloSeccion(doc, 'TOTAL A PREPARAR', y);
  doc.autoTable({ ...tablaBase, startY: y + 3,
    head: [['Cantidad', 'Artículo', 'Precio unit.', 'Total']],
    body: oc.items.map(i => [n(i.cantidad), `${i.producto} (${i.unidad})`, money(i.precio_unit), money(i.cantidad * i.precio_unit)]),
    foot: [['', 'VALOR TOTAL (sin IVA)', '', money(oc.total)]],
    columnStyles: { 0: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 32 } },
    didParseCell: d => { if (d.section !== 'body' && d.column.index !== 1) d.cell.styles.halign = 'right'; },
  });
  y = doc.lastAutoTable.finalY + 9;
  const sucs = porSucursal(oc);
  if (sucs.length) {
    if (y > 245) { doc.addPage(); y = 20; }
    tituloSeccion(doc, 'PREPARAR POR SUCURSAL', y);
    doc.autoTable({ ...tablaBase, startY: y + 3,
      head: [['Sucursal / área', 'Artículo', 'Cant.', 'Control']],
      body: sucs.flatMap(s => s.items.map((i, k) => [k ? '' : s.sucursal, i.producto, n(i.cantidad), ''])),
      styles: { ...tablaBase.styles, fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: CELESTE, textColor: TINTA, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 2: { halign: 'right', cellWidth: 16 }, 3: { cellWidth: 18 } },
      didDrawCell: d => { if (d.section === 'body' && d.column.index === 3) { doc.setDrawColor(...GRIS); doc.setLineWidth(0.25); doc.rect(d.cell.x + 6, d.cell.y + 1.2, 3.2, 3.2); } },
    });
    y = doc.lastAutoTable.finalY + 9;
  }
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.text(`Fecha de entrega: ${fecha(oc.fecha_entrega)}`, M, y);
  if (oc.observaciones) doc.text(doc.splitTextToSize(`Observaciones: ${oc.observaciones}`, W - 2 * M), M, y + 6);
  y = Math.min(Math.max(y + 30, 250), 272);
  firma(doc, M, y, 'Preparó'); firma(doc, W - M - 60, y, 'Controló');
  pie(doc, 'Farmacias Grassi · Orden de preparación interna · App Insumos');
  return doc;
}

export function ocPDF(oc) {
  if (oc.interno) return opPDF(oc);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const e = oc.empresaObj || {}, p = oc.proveedorObj || {};
  const W = 210, M = 16;
  const y0 = encabezado(doc, 'ORDEN DE COMPRA', ocNum(oc.id), oc);

  // proveedor (izquierda) y "facturar a" destacado (derecha)
  const xF = W / 2 + 2, wF = W - M - xF;
  doc.setFillColor(...CELESTE); doc.roundedRect(xF, y0 - 5, wF, 31, 2, 2, 'F');
  doc.setFillColor(...AZUL); doc.rect(xF, y0 - 5, 1.2, 31, 'F');
  const bloque = (x, titulo, lineas) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AZUL); doc.text(titulo, x, y0);
    doc.setTextColor(...TINTA); doc.setFontSize(10); doc.text(lineas[0] || '—', x, y0 + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    lineas.slice(1).filter(Boolean).forEach((l, i) => doc.text(String(l), x, y0 + 11 + i * 4.5));
  };
  bloque(M, 'PROVEEDOR', [p.nombre, p.cuit && `CUIT ${p.cuit}`, p.direccion, p.telefono, p.email]);
  bloque(xF + 5, 'FACTURAR A', [e.razon_social || oc.empresa, e.cuit ? `CUIT ${e.cuit}` : 'CUIT a completar', e.direccion, e.telefono, e.email_compras]);

  tituloSeccion(doc, 'DETALLE', y0 + 36);
  doc.autoTable({ ...tablaBase, startY: y0 + 39,
    head: [['Cantidad', 'Detalle de artículo', 'Precio unit.', 'Total']],
    body: oc.items.map(i => [n(i.cantidad), `${i.producto} (${i.unidad})`, money(i.precio_unit), money(i.cantidad * i.precio_unit)]),
    foot: [['', 'MONTO TOTAL (sin IVA)', '', money(oc.total)]],
    columnStyles: { 0: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 32 } },
    didParseCell: d => { if (d.section !== 'body' && d.column.index !== 1) d.cell.styles.halign = 'right'; },
  });
  let y = doc.lastAutoTable.finalY + 9;
  const ent = entregas(oc);
  if (ent.length) {
    if (y > 245) { doc.addPage(); y = 20; }
    tituloSeccion(doc, 'ENTREGAR EN', y);
    doc.autoTable({ ...tablaBase, startY: y + 3,
      head: [['Dirección', 'Sucursal / área', 'Artículo', 'Cant.']],
      body: ent.flatMap(en => en.items.map((i, k) => [k ? '' : en.direccion, k ? '' : en.sucursales.join(', '), i.producto, n(i.cantidad)])),
      styles: { ...tablaBase.styles, fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: CELESTE, textColor: TINTA, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' }, 1: { cellWidth: 48 }, 3: { halign: 'right', cellWidth: 16 } },
    });
    y = doc.lastAutoTable.finalY + 9;
  }
  if (y > 245) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold'); doc.text('Forma de pago:', M, y); doc.setFont('helvetica', 'normal'); doc.text(oc.forma_pago || '—', M + 27, y);
  doc.setFont('helvetica', 'bold'); doc.text('Fecha de entrega:', M, y + 6); doc.setFont('helvetica', 'normal'); doc.text(fecha(oc.fecha_entrega), M + 31, y + 6);
  if (oc.observaciones) doc.text(doc.splitTextToSize(`Observaciones: ${oc.observaciones}`, W - 2 * M), M, y + 12);
  y = Math.min(Math.max(y + 34, 250), 272);
  firma(doc, W - M - 60, y, 'Firma del comprador');
  pie(doc, `${e.razon_social || 'Grupo Grassi'}${e.cuit ? ` · CUIT ${e.cuit}` : ''} · Orden de compra generada desde App Insumos`);
  return doc;
}

export const pdfBase64 = oc => ocPDF(oc).output('datauristring').split(',')[1];
