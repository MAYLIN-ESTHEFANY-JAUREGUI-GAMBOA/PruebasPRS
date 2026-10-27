import { CeldaReporte } from './report.model';

type Rgb = [number, number, number];
export interface Tono { fondo: Rgb; texto: Rgb; }

const VERDE: Tono = { fondo: [220, 252, 231], texto: [22, 101, 52] };
const AMBAR: Tono = { fondo: [254, 243, 199], texto: [146, 64, 14] };
const ROJO: Tono = { fondo: [254, 226, 226], texto: [153, 27, 27] };
const NEUTRO: Tono = { fondo: [226, 232, 240], texto: [51, 65, 85] };

// Primera coincidencia gana: "desbloqueado" antes que "bloque", "inactivo" antes que "activ".
const REGLAS: [RegExp, Tono][] = [
  [/desbloq|levant|reactiv|permitid|habilitad/, VERDE],
  [/bloque|inactiv|suspend|cancel|critic|permanent|rechaz|deneg|fuera de servicio|alta/, ROJO],
  [/pendient|aviso|advert|temporal|manten|en curso|en ruta|asignad|ocupad|media|escal|proceso|atencion/, AMBAR],
  [/activ|disponib|complet|resuelt|finaliz|cerrad|normal|baja|aplicad|operativ/, VERDE]
];

/** Color semántico de un estado por palabra clave (sin tildes ni mayúsculas); desconocido = neutro. */
export function tonoEstado(valor: CeldaReporte): Tono {
  const t = String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/_/g, ' ');
  return REGLAS.find(([re]) => re.test(t))?.[1] ?? NEUTRO;
}

/** Conteo por valor de una columna, de mayor a menor. */
export function distribucion(filas: CeldaReporte[][], columna: number): [string, number][] {
  const conteo = new Map<string, number>();
  for (const f of filas) {
    const v = String(f[columna] ?? '').trim() || 'Sin dato';
    conteo.set(v, (conteo.get(v) ?? 0) + 1);
  }
  return [...conteo].sort((a, b) => b[1] - a[1]);
}

export const rgbAArgb = (rgb: readonly number[]) => 'FF' + rgb.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
