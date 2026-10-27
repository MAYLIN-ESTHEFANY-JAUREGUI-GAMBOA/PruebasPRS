import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

import { API_PATHS, buildApiUrl } from '../config/api-config';
import { EstadoMunicipalidad, GuardarMunicipalidadRequest, Municipalidad } from '../models/municipalidad.model';

@Injectable({ providedIn: 'root' })
export class MunicipalidadService {

  private readonly apiUrl = buildApiUrl(API_PATHS.municipalidades);

  constructor(private http: HttpClient) {}

  /** Solo SUPER_ADMIN. */
  listar(): Observable<Municipalidad[]> {
    return this.http.get<Municipalidad[]>(this.apiUrl);
  }

  /** SUPER_ADMIN o MUNICIPALIDAD_ADMIN de esa misma municipalidad. */
  obtener(id: string): Observable<Municipalidad> {
    return this.http.get<Municipalidad>(`${this.apiUrl}/${id}`);
  }

  /** Sin token: nombre y logo de una municipalidad ACTIVA (branding de login y reportes). */
  obtenerPublica(id: string): Observable<Pick<Municipalidad, 'id' | 'businessName' | 'logoUrl'>> {
    return this.http.get<Pick<Municipalidad, 'id' | 'businessName' | 'logoUrl'>>(`${this.apiUrl}/public/${id}`);
  }

  crear(body: GuardarMunicipalidadRequest): Observable<Municipalidad> {
    return this.http.post<Municipalidad>(this.apiUrl, body);
  }

  actualizar(id: string, body: GuardarMunicipalidadRequest): Observable<Municipalidad> {
    return this.http.put<Municipalidad>(`${this.apiUrl}/${id}`, body);
  }

  cambiarEstado(id: string, estado: EstadoMunicipalidad): Observable<Municipalidad> {
    return this.http.patch<Municipalidad>(`${this.apiUrl}/${id}/status`, { status: estado });
  }

  /**
   * Sube el logo directo a Cloudinary con la firma de vg-ms-municipalidades (carpeta de logos)
   * y devuelve su URL https.
   */
  async subirLogo(archivo: File): Promise<string> {
    const firma = await firstValueFrom(this.http.post<FirmaCloudinary>(`${this.apiUrl}/logo/signature`, {}));
    const datos = new FormData();
    datos.append('file', archivo);
    datos.append('api_key', firma.apiKey);
    datos.append('timestamp', String(firma.timestamp));
    datos.append('signature', firma.signature);
    datos.append('folder', firma.folder);
    const res = await firstValueFrom(this.http.post<{ secure_url: string }>(
      `https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, datos));
    return res.secure_url;
  }
}

interface FirmaCloudinary {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
}
