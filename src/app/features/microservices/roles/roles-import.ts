/** Fila a importar: mismo cuerpo que espera POST /api/auth/admin/roles/import. */
export interface RolImportado { roleName: string; description?: string; }

// Encabezados aceptados (sin tildes ni mayúsculas) para cada campo.
const NOMBRE = ['rolename', 'rol', 'role', 'nombre_rol', 'nombre', 'name'];
const DESCRIPCION = ['description', 'descripcion', 'detalle'];

const clave = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Lee CSV, JSON o XLSX y devuelve las filas con nombre; el backend valida cada rol. */
export async function leerArchivoRoles(archivo: File): Promise<RolImportado[]> {
  const ext = archivo.name.split('.').pop()?.toLowerCase();
  if (ext === 'json') return desdeObjetos(jsonAFilas(await archivo.text()));
  if (ext === 'csv' || ext === 'txt') return desdeTabla(csvAFilas(await archivo.text()));
  if (ext === 'xlsx') return desdeTabla(await xlsxAFilas(await archivo.arrayBuffer()));
  throw new Error('Formato no soportado: use .csv, .json o .xlsx');
}

/** Acepta un arreglo, `{ "roles": [...] }`, objetos o solo nombres. */
function jsonAFilas(texto: string): unknown[] {
  const datos = JSON.parse(texto);
  const lista = Array.isArray(datos) ? datos : datos?.roles;
  if (!Array.isArray(lista)) throw new Error('El JSON debe ser un arreglo de roles o { "roles": [...] }');
  return lista.map(x => (typeof x === 'string' ? { roleName: x } : x));
}

function desdeObjetos(lista: unknown[]): RolImportado[] {
  return lista.map(o => {
    const campos = Object.entries((o ?? {}) as Record<string, unknown>);
    const buscar = (nombres: string[]) => campos.find(([k]) => nombres.includes(clave(k)))?.[1];
    return fila(buscar(NOMBRE), buscar(DESCRIPCION));
  }).filter((r): r is RolImportado => !!r);
}

/** Primera fila = encabezados; sin encabezado reconocido, columna 1 = rol y 2 = descripción. */
export function desdeTabla(filas: unknown[][]): RolImportado[] {
  if (!filas.length) return [];
  const cab = filas[0].map(clave);
  let iNombre = cab.findIndex(c => NOMBRE.includes(c));
  let iDesc = cab.findIndex(c => DESCRIPCION.includes(c));
  let datos = filas.slice(1);
  if (iNombre < 0) { iNombre = 0; iDesc = 1; datos = filas; }
  return datos.map(f => fila(f[iNombre], iDesc >= 0 ? f[iDesc] : undefined)).filter((r): r is RolImportado => !!r);
}

function fila(nombre: unknown, descripcion: unknown): RolImportado | null {
  const roleName = String(nombre ?? '').trim();
  if (!roleName) return null;
  const description = String(descripcion ?? '').trim();
  return description ? { roleName, description } : { roleName };
}

/** CSV con `,` o `;` (Excel en español) y comillas dobles. */
export function csvAFilas(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0];
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(v => v.trim()));
}

async function xlsxAFilas(buffer: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const filas: unknown[][] = [];
  ws.eachRow((r: any) => filas.push((r.values as unknown[]).slice(1).map(v => (v && typeof v === 'object' && 'text' in v ? (v as { text: unknown }).text : v))));
  return filas;
}
