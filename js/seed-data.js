// Datos base tomados del form "Solicitud de Compra de Insumos" y de la planilla
// "PRUEBA DE ESTADISTICAS DICIEMBRE INSUMOS" (precios sin IVA, último valor conocido).
// Los proveedores son genéricos: completar nombre, CUIT y mail reales en Catálogo.

export const EMPRESAS = [
  { codigo: 'SSG', razon_social: 'SSG (completar razón social)', cuit: '', direccion: 'Río Cuarto, Córdoba', telefono: '', email_compras: '' },
  { codigo: 'FG',  razon_social: 'FG (completar razón social)',  cuit: '', direccion: 'Río Cuarto, Córdoba', telefono: '', email_compras: '' },
];

export const SUCURSALES = [
  { id: 1,  nombre: 'Suc 1',                     empresa: 'SSG', tipo: 'sucursal' },
  { id: 2,  nombre: 'Suc 2',                     empresa: 'SSG', tipo: 'sucursal' },
  { id: 3,  nombre: 'Suc 3',                     empresa: 'SSG', tipo: 'sucursal' },
  { id: 4,  nombre: 'Suc 4',                     empresa: 'FG',  tipo: 'sucursal' },
  { id: 5,  nombre: 'Suc 5',                     empresa: 'FG',  tipo: 'sucursal' },
  { id: 6,  nombre: 'Suc 6',                     empresa: 'FG',  tipo: 'sucursal' },
  { id: 7,  nombre: 'Droguería',                 empresa: 'SSG', tipo: 'area' },
  { id: 8,  nombre: 'Banda Norte (Planta Alta)', empresa: 'FG',  tipo: 'area' },
  { id: 9,  nombre: 'Centro (Planta Alta)',      empresa: 'SSG', tipo: 'area' },
  { id: 10, nombre: 'Centro (Virtual)',          empresa: 'SSG', tipo: 'area' },
];

export const CATEGORIAS = [
  { id: 1, nombre: 'Refrigerio', orden: 1 },
  { id: 2, nombre: 'Limpieza y baño', orden: 2 },
  { id: 3, nombre: 'Librería', orden: 3 },
];

export const PROVEEDORES = [
  { id: 1, nombre: 'Proveedor Refrigerio (a definir)', email: '', condicion_pago: 'Contado' },
  { id: 2, nombre: 'Proveedor Limpieza (a definir)',   email: '', condicion_pago: 'Contado' },
  { id: 3, nombre: 'Proveedor Librería (a definir)',   email: '', condicion_pago: 'Contado' },
];

// [nombre, categoria_id, proveedor_id, precio_ref, unidad]
const P = [
  ['Yerba x 1 kg', 1, 1, 3480, 'paquete'],
  ['Leche en polvo x 750 g', 1, 1, 4681, 'lata'],
  ['Café molido x 1 kg', 1, 1, 18172, 'paquete'],
  ['Café instantáneo x 170 g', 1, 1, 6700, 'frasco'],
  ['Azúcar x 1 kg', 1, 1, 813, 'paquete'],
  ['Edulcorante x 100 sobres', 1, 1, 2054, 'caja'],
  ['Edulcorante líquido x 250 ml', 1, 1, 1718, 'frasco'],
  ['Té x 100 saquitos', 1, 1, 3131, 'caja'],
  ['Mate cocido x 50 saquitos', 1, 1, 1200, 'caja'],
  ['Aceite x 900 ml', 1, 1, 2227, 'botella'],
  ['Sal x 500 g', 1, 1, 1281, 'paquete'],

  ['Jabón para manos x 5 L', 2, 2, 13140, 'bidón'],
  ['Guantes', 2, 2, 5206, 'par'],
  ['Esponja de cocina', 2, 2, 537, 'unidad'],
  ['Rejilla', 2, 2, 454, 'unidad'],
  ['Trapo de piso', 2, 2, 785, 'unidad'],
  ['Trapo de piso sintético', 2, 2, 2148, 'unidad'],
  ['Paño amarillo', 2, 2, 735, 'unidad'],
  ['Franela', 2, 2, 991, 'unidad'],
  ['Repuesto aerosol x 3', 2, 2, 14876, 'pack'],
  ['Desodorante de ambiente', 2, 2, 2882, 'unidad'],
  ['Blem aerosol', 2, 2, 4545, 'unidad'],
  ['Lustramuebles', 2, 2, 2396, 'unidad'],
  ['Lavandina en gel', 2, 2, 1536, 'unidad'],
  ['Detergente x 750 ml', 2, 2, 1157, 'unidad'],
  ['Cif crema', 2, 2, 3719, 'unidad'],
  ['Desengrasante', 2, 2, 2066, 'unidad'],
  ['Pastilla de inodoro', 2, 2, 1570, 'unidad'],
  ['Insecticida aerosol', 2, 2, 4876, 'unidad'],
  ['Bolsas 60x90 x 10', 2, 2, 1148, 'paquete'],
  ['Bolsas 90x120 x 10', 2, 2, 1975, 'paquete'],
  ['Escobillón', 2, 2, 2396, 'unidad'],
  ['Cabo de madera', 2, 2, 1239, 'unidad'],
  ['Mopa', 2, 2, 3223, 'unidad'],
  ['Desodorante de piso x 5 L', 2, 2, 4876, 'bidón'],
  ['Toalla en rollo x 4 (dispenser)', 2, 2, 15495, 'pack'],
  ['Rollo higiénico x 8 (dispenser)', 2, 2, 12768, 'pack'],
  ['Rollo de cocina x 3', 2, 2, 1524, 'pack'],

  ['Resma A4', 3, 3, 5821, 'resma'],
  ['Cuaderno chico', 3, 3, 2467, 'unidad'],
  ['Cuaderno grande', 3, 3, 2768, 'unidad'],
  ['Nota adhesiva 75x75', 3, 3, 708, 'block'],
  ['Nota adhesiva 38x50', 3, 3, 392, 'block'],
  ['Bolígrafo Bic', 3, 3, 490, 'unidad'],
  ['Resaltador Tratto', 3, 3, 1077, 'unidad'],
  ['Cinta correctora', 3, 3, 1875, 'unidad'],
  ['Cinta adhesiva 12x60', 3, 3, 819, 'unidad'],
  ['Cinta de embalar 48x40', 3, 3, 909, 'unidad'],
  ['Voligoma', 3, 3, 631, 'unidad'],
  ['Broches 10/50', 3, 3, 846, 'caja'],
  ['Broches 21/6', 3, 3, 1030, 'caja'],
  ['Broches 24/6', 3, 3, 1357, 'caja'],
  ['Clips N° 4', 3, 3, 413, 'caja'],
  ['Clips N° 5', 3, 3, 697, 'caja'],
  ['Clips N° 7', 3, 3, 1830, 'caja'],
  ['Abrochadora pinza 24/6', 3, 3, 20418, 'unidad'],
  ['Cúter plástico', 3, 3, 414, 'unidad'],
  ['Regla plástica', 3, 3, 406, 'unidad'],
  ['Folios A4 x 10', 3, 3, 1693, 'paquete'],
  ['Sobre bolsa', 3, 3, 1812, 'unidad'],
  ['Microfibra liner', 3, 3, 6051, 'unidad'],
  ['Rollo turnero', 3, 3, 2317, 'rollo'],
  ['Rollos térmicos 80x60 x 5', 3, 3, 6469, 'pack'],
  ['Moño N° 25 x 100', 3, 3, 2446, 'bolsa'],
  ['Moño liso N° 50 x 100', 3, 3, 2926, 'bolsa'],
  ['Moño blanco grande x 50', 3, 3, 2926, 'bolsa'],
  ['Moño chico x 50', 3, 3, 2616, 'bolsa'],
  ['Papel para regalo', 3, 3, 555, 'pliego'],
  ['Tarjetas blancas x 100', 3, 3, 2249, 'paquete'],
  ['Tóner impresora', 3, 3, 0, 'unidad'],
];

export const PRODUCTOS = P.map(([nombre, categoria_id, proveedor_id, precio_ref, unidad], i) => ({
  id: i + 1, nombre, categoria_id, proveedor_id, precio_ref, unidad, tope_mensual: null, activo: true,
}));
