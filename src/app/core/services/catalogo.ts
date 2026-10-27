import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { Catalogo } from '../models/catalogo.model';

const JSON_HEADERS = new HttpHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' });

export function normalizarCatalogo(c: any): Catalogo {
  if (!c) return c;
  const key = c.key ?? c.clave ?? null;
  const displayLabel = c.displayLabel ?? c.etiquetaVisual ?? c.etiqueta_visual ?? null;
  const parentCategory = c.parentCategory ?? c.categoriaPadre ?? c.categoria_padre ?? null;
  const resourceType = c.resourceType ?? c.tipoRecurso ?? c.tipo_recurso ?? null;
  const mapIcon = c.mapIcon ?? c.iconoMapa ?? c.Icono_mapa ?? null;
  const status = c.status ?? c.estado ?? null;
  const group = c.group ?? c.grupo ?? null;
  const createdAt = c.createdAt ?? c.creadoEn ?? c.creado_en ?? null;

  return {
    id: c.id ?? c._id,
    group,
    key,
    displayLabel,
    parentCategory,
    resourceType,
    mapIcon,
    status,
    createdAt,
    // Compatibilidad dual
    grupo: group,
    clave: key,
    etiquetaVisual: displayLabel,
    categoriaPadre: parentCategory,
    tipoRecurso: resourceType,
    iconoMapa: mapIcon,
    estado: status,
    creadoEn: createdAt
  };
}

@Injectable({
  providedIn: 'root'
})
export class CatalogoService {

  private readonly apiUrl = buildApiUrl(API_PATHS.catalogos);

  constructor(private http: HttpClient) {}

  listar(): Observable<Catalogo[]> {
    return this.http.get<Catalogo[]>(this.apiUrl, { headers: JSON_HEADERS }).pipe(
      map(list => (list ?? []).map(c => normalizarCatalogo(c)))
    );
  }

  obtenerPorId(id: string): Observable<Catalogo> {
    return this.http.get<Catalogo>(`${this.apiUrl}/${id}`, { headers: JSON_HEADERS }).pipe(
      map(c => normalizarCatalogo(c))
    );
  }

  obtenerPorGrupo(grupo: string): Observable<Catalogo[]> {
    return this.http.get<Catalogo[]>(`${this.apiUrl}/group/${grupo}`, { headers: JSON_HEADERS }).pipe(
      map(list => (list ?? []).map(c => normalizarCatalogo(c)))
    );
  }

  crear(catalogo: Catalogo): Observable<Catalogo> {
    const payload = {
      ...catalogo,
      grupo: catalogo.group ?? catalogo.grupo,
      clave: catalogo.key ?? catalogo.clave,
      etiquetaVisual: catalogo.displayLabel ?? catalogo.etiquetaVisual,
      categoriaPadre: catalogo.parentCategory ?? catalogo.categoriaPadre,
      tipoRecurso: catalogo.resourceType ?? catalogo.tipoRecurso,
      iconoMapa: catalogo.mapIcon ?? catalogo.iconoMapa,
      estado: catalogo.status ?? catalogo.estado ?? 'ACTIVO'
    };
    return this.http.post<Catalogo>(this.apiUrl, payload, { headers: JSON_HEADERS }).pipe(
      map(c => normalizarCatalogo(c))
    );
  }

  actualizar(id: string, catalogo: Catalogo): Observable<Catalogo> {
    const payload = {
      ...catalogo,
      grupo: catalogo.group ?? catalogo.grupo,
      clave: catalogo.key ?? catalogo.clave,
      etiquetaVisual: catalogo.displayLabel ?? catalogo.etiquetaVisual,
      categoriaPadre: catalogo.parentCategory ?? catalogo.categoriaPadre,
      tipoRecurso: catalogo.resourceType ?? catalogo.tipoRecurso,
      iconoMapa: catalogo.mapIcon ?? catalogo.iconoMapa,
      estado: catalogo.status ?? catalogo.estado
    };
    return this.http.put<Catalogo>(`${this.apiUrl}/${id}`, payload, { headers: JSON_HEADERS }).pipe(
      map(c => normalizarCatalogo(c))
    );
  }

  desactivar(id: string): Observable<Catalogo> {
    return this.http.patch<Catalogo>(`${this.apiUrl}/${id}/deactivate`, {}, { headers: JSON_HEADERS }).pipe(
      map(c => normalizarCatalogo(c))
    );
  }

  activar(id: string): Observable<Catalogo> {
    return this.http.patch<Catalogo>(`${this.apiUrl}/${id}/activate`, {}, { headers: JSON_HEADERS }).pipe(
      map(c => normalizarCatalogo(c))
    );
  }
}
