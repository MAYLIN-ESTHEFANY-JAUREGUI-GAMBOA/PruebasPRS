import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

/** Código UBIGEO INEI → nombre. Claves de 2 (departamento), 4 (provincia) y 6 dígitos (distrito). */
export type UbigeoMapa = Record<string, string>;
export interface UbigeoOpcion { codigo: string; nombre: string; }

/**
 * Catálogo UBIGEO INEI (public/assets/ubigeo.json, fuente: github.com/jmcastagnetto/ubigeo-peru-aumentado).
 * Se descarga una vez por sesión, al primer uso.
 */
@Injectable({ providedIn: 'root' })
export class UbigeoService {
  private readonly http = inject(HttpClient);
  readonly mapa$: Observable<UbigeoMapa> = this.http.get<UbigeoMapa>('/assets/ubigeo.json').pipe(shareReplay(1));

  /** Hijos directos de `padre` ('' = departamentos), ordenados por nombre. */
  static hijos(mapa: UbigeoMapa, padre: string): UbigeoOpcion[] {
    const largo = padre.length + 2;
    return Object.keys(mapa)
      .filter(c => c.length === largo && c.startsWith(padre))
      .map(codigo => ({ codigo, nombre: mapa[codigo] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  /** Prefijo que cubre una municipalidad: igual que Municipality.jurisdiction() del backend. */
  static jurisdiccion(m: { ubigeo?: string | null; type?: string | null } | null | undefined): string {
    if (!m?.ubigeo) return '';
    return m.type === 'PROVINCIAL' ? m.ubigeo.slice(0, 4) : m.ubigeo;
  }
}
