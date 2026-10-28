// Documento de Orden de Compra: vista HTML y PDF (mismos campos que la planilla
// "ORDEN DE COMPRA ARTICULOS INSUMOS": comprador, proveedor, ítems, forma de pago, entrega, firma).
import { h, money, n, fecha, ocNum, groupBy } from './ui.js';

// Agrupa lo que hay que entregar por dirección: [{ direccion, sucursales, items: [{producto, cantidad}] }]
export function entregas(oc) {
  const porDir = groupBy(oc.distribucion || [], d => d.direccion || 'Dirección a confirmar');
  return Object.entries(porDir).map(([direccion, ds]) => {
    const items = Object.entries(groupBy(ds, d => d.producto)).map(([producto, xs]) => ({ producto, cantidad: xs.reduce((a, x) => a + Number(x.cantidad), 0) }));
    return { direccion, sucursales: [...new Set(ds.map(d => d.sucursal))], items: items.sort((a, b) => a.producto.localeCompare(b.producto)) };
  }).sort((a, b) => a.direccion.localeCompare(b.direccion));
}

export function ocHTML(oc) {
  const e = oc.empresaObj || {}, p = oc.proveedorObj || {};
  return h('article', { class: 'ocdoc' },
    h('header', { class: 'ocdoc-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Orden de compra'), h('h3', {}, e.razon_social || oc.empresa),
        h('p', { class: 'muted' }, [e.direccion, e.cuit && `CUIT ${e.cuit}`].filter(Boolean).join(' · '))),
      h('dl', { class: 'ocdoc-meta' },
        h('dt', {}, 'N°'), h('dd', { class: 'mono' }, ocNum(oc.id)),
        h('dt', {}, 'Fecha'), h('dd', {}, fecha(oc.fecha)),
        h('dt', {}, 'Período'), h('dd', {}, oc.periodo || '—'))),
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
export function ocPDF(oc) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const e = oc.empresaObj || {}, p = oc.proveedorObj || {};
  const W = 210, M = 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('ORDEN DE COMPRA', M, 22);
  doc.setFontSize(11); doc.text(ocNum(oc.id), W - M, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Fecha: ${fecha(oc.fecha)}`, W - M, 22, { align: 'right' });
  if (oc.periodo) doc.text(`Período: ${oc.periodo}`, W - M, 27, { align: 'right' });
  doc.setDrawColor(31, 111, 92); doc.setLineWidth(0.6); doc.line(M, 32, W - M, 32);

  const bloque = (x, titulo, lineas) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(95, 105, 102); doc.text(titulo, x, 40);
    doc.setTextColor(20, 30, 28); doc.setFontSize(10); doc.text(lineas[0] || '—', x, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    lineas.slice(1).filter(Boolean).forEach((l, i) => doc.text(String(l), x, 51 + i * 5));
  };
  bloque(M, 'DATOS DEL PROVEEDOR', [p.nombre, p.cuit && `CUIT ${p.cuit}`, p.direccion, p.telefono, p.email]);
  bloque(W / 2 + 4, 'FACTURAR A', [e.razon_social || oc.empresa, e.cuit ? `CUIT ${e.cuit}` : 'CUIT a completar', e.direccion, e.telefono, e.email_compras]);

  doc.autoTable({
    startY: 78, margin: { left: M, right: M },
    head: [['Cantidad', 'Detalle de artículo', 'Precio unit.', 'Total']],
    body: oc.items.map(i => [n(i.cantidad), `${i.producto} (${i.unidad})`, money(i.precio_unit), money(i.cantidad * i.precio_unit)]),
    foot: [['', 'MONTO TOTAL (sin IVA)', '', money(oc.total)]],
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [31, 111, 92] }, footStyles: { fillColor: [232, 238, 235], textColor: [20, 30, 28], fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 32 } },
    didParseCell: d => { if (d.section !== 'body' && d.column.index !== 1) d.cell.styles.halign = 'right'; },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const ent = entregas(oc);
  if (ent.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('ENTREGAR EN', M, y + 2); doc.setFont('helvetica', 'normal');
    doc.autoTable({
      startY: y + 5, margin: { left: M, right: M },
      head: [['Dirección', 'Sucursal / área', 'Artículo', 'Cant.']],
      body: ent.flatMap(en => en.items.map((i, k) => [k ? '' : en.direccion, k ? '' : en.sucursales.join(', '), i.producto, n(i.cantidad)])),
      styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [232, 238, 235], textColor: [20, 30, 28] },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' }, 1: { cellWidth: 48 }, 3: { halign: 'right', cellWidth: 16 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(9);
  doc.text(`Forma de pago: ${oc.forma_pago || '—'}`, M, y);
  doc.text(`Fecha de entrega: ${fecha(oc.fecha_entrega)}`, M, y + 6);
  if (oc.observaciones) doc.text(doc.splitTextToSize(`Observaciones: ${oc.observaciones}`, W - 2 * M), M, y + 12);
  y = Math.min(Math.max(y + 34, 250), 280);
  doc.line(W - M - 60, y, W - M, y); doc.text('Firma del comprador', W - M - 30, y + 5, { align: 'center' });
  return doc;
}

export const pdfBase64 = oc => ocPDF(oc).output('datauristring').split(',')[1];
