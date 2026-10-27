import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { Catalogo } from '../models/catalogo.model';
import { RecursoOperativo } from '../models/recurso-operativo.model';
import { CatalogoService } from './catalogo';

/** Contrato real de vg-ms-recursos (JSON en inglés) - Actualizado con todos los campos */
interface RecursoApi {
  id?: string;
  entityId?: string;
  municipalityId?: string;
  
  // Campos maestros (catálogo)
  key?: string;
  name?: string;
  type?: string;
  category?: string;
  icon?: string | null;
  
  // Campos transaccionales (operativos)
  internalCode?: string;
  responsible?: string | null;
  location?: { zone?: string | null; code?: string | null; district?: string | null } | null;
  availability?: string | null;
  statusDetail?: string | null;
  
  // Estado y auditoría
  active?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** Detalle, alta y edición vienen envueltos en `{ success, data, message }`; los listados no. */
type Envuelto<T> = T | { data: T };

/**
 * Adapta la API de recursos al modelo que usan las pantallas (identificador, catalogoId, encargadoNombre…).
 * El recurso guarda la `key` del catálogo, no su id: se resuelve con la lista de catálogos.
 */
@Injectable({
  providedIn: 'root'
})
export class RecursoOperativoService {

  private readonly apiUrl = buildApiUrl(API_PATHS.recursosOperativos);

  constructor(private http: HttpClient, private catalogoService: CatalogoService) {}

  listar(): Observable<RecursoOperativo[]> {
    return this.lista(this.http.get<RecursoApi[]>(this.apiUrl));
  }

  obtenerPorId(id: string): Observable<RecursoOperativo> {
    return this.uno(this.http.get<Envuelto<RecursoApi>>(`${this.apiUrl}/${id}`));
  }

  obtenerPorEntidad(entityId: string): Observable<RecursoOperativo[]> {
    return this.lista(this.http.get<RecursoApi[]>(`${this.apiUrl}/entity/${entityId}`));
  }

  obtenerPorZonaCodigo(codigo: string): Observable<RecursoOperativo[]> {
    return this.lista(this.http.get<RecursoApi[]>(`${this.apiUrl}/location/zone/${codigo}`));
  }

  obtenerPorEstado(availability: string): Observable<RecursoOperativo[]> {
    return this.lista(this.http.get<RecursoApi[]>(`${this.apiUrl}/availability/${availability}`));
  }

  crear(recurso: RecursoOperativo): Observable<RecursoOperativo> {
    return this.conCatalogo(recurso).pipe(
      switchMap(body => this.uno(this.http.post<Envuelto<RecursoApi>>(this.apiUrl, body)))
    );
  }

  actualizar(id: string, recurso: RecursoOperativo): Observable<RecursoOperativo> {
    return this.conCatalogo(recurso).pipe(
      switchMap(body => this.uno(this.http.put<Envuelto<RecursoApi>>(`${this.apiUrl}/${id}`, body)))
    );
  }

  /** PATCH /{id}/availability?availability=DISPONIBLE */
  cambiarEstado(id: string, availability: string): Observable<RecursoOperativo> {
    const params = new HttpParams().set('availability', availability);
    return this.uno(this.http.patch<Envuelto<RecursoApi>>(`${this.apiUrl}/${id}/availability`, {}, { params }));
  }

  // ── Adaptación API <-> pantalla ────────────────────────────────────────────

  private catalogos(): Observable<Catalogo[]> {
    // Sin catálogos el recurso se muestra igual, solo sin enlazar su catálogo.
    return this.catalogoService.listar().pipe(catchError(() => of([] as Catalogo[])));
  }

  private lista(fuente: Observable<RecursoApi[]>): Observable<RecursoOperativo[]> {
    return forkJoin([fuente, this.catalogos()]).pipe(
      map(([recursos, catalogos]) => (recursos ?? []).map(r => desdeApi(r, catalogos)))
    );
  }

  private uno(fuente: Observable<Envuelto<RecursoApi>>): Observable<RecursoOperativo> {
    return forkJoin([fuente, this.catalogos()]).pipe(
      map(([respuesta, catalogos]) => desdeApi(desenvolver(respuesta), catalogos))
    );
  }

  /** Los datos maestros (clave, nombre, tipo, categoría, ícono) se copian del catálogo elegido. */
  private conCatalogo(recurso: RecursoOperativo): Observable<RecursoApi> {
    const catalogoId = recurso.catalogoId ?? '';
    const catalogo$: Observable<Catalogo | null> = catalogoId ? this.catalogoService.obtenerPorId(catalogoId) : of(null);
    return catalogo$.pipe(map(catalogo => haciaApi(recurso, catalogo)));
  }
}

function desenvolver(respuesta: Envuelto<RecursoApi>): RecursoApi {
  return respuesta && typeof respuesta === 'object' && 'data' in respuesta ? respuesta.data : respuesta;
}

function desdeApi(r: RecursoApi, catalogos: Catalogo[]): RecursoOperativo {
  const catalogo = catalogos.find(c => c.key === r.key);
  const location = r.location;
  
  return {
    // Campos principales del API
    id: r.id,
    entityId: r.entityId,
    municipalityId: r.municipalityId,
    
    // Campos maestros (catálogo)
    key: r.key,
    name: r.name,
    type: r.type,
    category: r.category,
    icon: r.icon,
    
    // Campos transaccionales (operativos)
    internalCode: r.internalCode,
    responsible: r.responsible,
    location: location,
    availability: r.availability,
    statusDetail: r.statusDetail,
    
    // Estado y auditoría
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    
    // ══════════════════════════════════════════════════════════════════
    // MAPEO DE COMPATIBILIDAD CON FRONTEND LEGACY
    // ══════════════════════════════════════════════════════════════════
    
    entidadId: r.entityId,
    catalogoId: catalogo?.id,
    identificador: r.internalCode ?? '',
    encargadoNombre: r.responsible ?? null,
    zonaOperativa: location
      ? { 
          zone: location.zone ?? null, 
          code: location.code ?? null, 
          district: location.district ?? null 
        }
      : null,
    estadoDisponibilidad: r.availability ?? null,
    subestadoOperativo: r.statusDetail ?? null,
    estado: r.active === false ? 'INACTIVO' : 'ACTIVO',
    creadoEn: r.createdAt ?? null,
    actualizadoEn: r.updatedAt ?? null
  };
}

function haciaApi(r: RecursoOperativo, catalogo: Catalogo | null): RecursoApi {
  // Resolver zona operativa (puede venir como location o zonaOperativa por compatibilidad)
  const zona = r.location ?? r.zonaOperativa;
  
  // vg-ms-recursos exige zona, código y distrito juntos; si falta alguno no se envía la ubicación
  const tieneZona = zona && (zona.zone || zona.code || zona.district);
  const ubicacionCompleta = tieneZona 
    ? {
        zone: zona.zone ?? (zona as any).nombre ?? null,
        code: zona.code ?? (zona as any).codigo ?? null,
        district: zona.district ?? (zona as any).distrito ?? null
      }
    : null;
  
  return {
    entityId: r.entityId ?? r.entidadId,
    key: catalogo?.key ?? r.key,
    name: catalogo?.displayLabel ?? r.name,
    type: catalogo?.resourceType ?? r.type,
    category: catalogo?.parentCategory ?? r.category,
    icon: catalogo?.mapIcon ?? r.icon ?? null,
    internalCode: r.internalCode ?? r.identificador,
    responsible: r.responsible ?? r.encargadoNombre ?? null,
    location: ubicacionCompleta,  // ✅ USA LOCATION (no zonaOperativa)
    availability: r.availability ?? r.estadoDisponibilidad ?? null,
    statusDetail: r.statusDetail ?? r.subestadoOperativo ?? null,
    active: r.active !== undefined ? r.active : (r.estado !== 'INACTIVO')
  };
}
