import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { MunicipalidadService } from '../../core/services/municipalidad';
import { Membrete } from './report.model';
import { PermissionConstants, ReportConstants } from './report.constants';

/**
 * Membrete del reporte según el tenant del JWT (claim mid): logo y nombre de la municipalidad del usuario
 * (también para el personal de sus entidades). SUPER_ADMIN o sin mid resuelve la municipalidad activa.
 */
@Injectable({ providedIn: 'root' })
export class ReportBrandingService {
  private readonly auth = inject(AuthService);
  private readonly municipalidades = inject(MunicipalidadService);
  private cache = new Map<string, Promise<Omit<Membrete, 'generadoPor'>>>();

  puedeExportar(): boolean {
    return this.auth.hasRole(...PermissionConstants.REPORTS_EXPORT);
  }

  async membrete(overrideMid?: string | null): Promise<Membrete> {
    const mid = await this.resolverMid(overrideMid);
    const key = mid || '__plataforma__';
    if (!this.cache.has(key)) {
      this.cache.set(key, this.resolver(mid));
    }
    const membreteBase = await this.cache.get(key)!;
    return { ...membreteBase, generadoPor: this.auth.getDisplayName() };
  }

  private async resolverMid(overrideMid?: string | null): Promise<string | null> {
    if (overrideMid) return overrideMid;
    const tokenMid = this.auth.getMunicipalidadId();
    if (tokenMid) return tokenMid;

    // Si el usuario es SUPER_ADMIN o el token no trae claim mid, buscamos la municipalidad activa registrada
    try {
      const lista = await firstValueFrom(this.municipalidades.listar());
      if (lista && lista.length > 0) {
        const activa = lista.find(m => m.status === 'ACTIVA') || lista[0];
        if (activa?.id) return activa.id;
      }
    } catch {
      // Si no es superadmin o falla listar(), intentamos con el ID principal de Cañete
    }
    return '6ad9a3d4d13ee6da325e1fcd';
  }

  private async resolver(mid: string | null): Promise<Omit<Membrete, 'generadoPor'>> {
    const plataforma = async () => ({
      institucion: ReportConstants.PLATAFORMA,
      logoDataUrl: await logoPlataforma()
    });

    if (!mid) return plataforma();

    try {
      const m = await firstValueFrom(this.municipalidades.obtenerPublica(mid));
      let logo: string | null = null;
      if (m.logoUrl) {
        logo = await urlADataUrl(m.logoUrl).catch((err) => {
          console.warn('[ReportBranding] urlADataUrl fallo:', err);
          return null;
        });
      }
      return {
        institucion: m.businessName || ReportConstants.PLATAFORMA,
        logoDataUrl: logo ?? (await plataforma()).logoDataUrl
      };
    } catch (err) {
      console.warn('[ReportBranding] Error al obtener datos de municipalidad:', err);
      return plataforma();
    }
  }
}

/** REPORT_LOGO_URL si está definido y carga; si no, el escudo embebido. */
async function logoPlataforma(): Promise<string> {
  const url = ReportConstants.LOGO_PLATAFORMA_URL;
  const remoto = url ? await urlADataUrl(url).catch(() => null) : null;
  return remoto ?? svgAPng(ReportConstants.LOGO_PLATAFORMA_SVG);
}

/** jsPDF no dibuja SVG: se rasteriza en un canvas. */
function svgAPng(svg: string, px = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: px, height: px });
      canvas.getContext('2d')!.drawImage(img, 0, 0, px, px);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** Logo remoto (Cloudinary, con CORS) a data-URI; se pide en PNG para que jsPDF lo acepte siempre. */
async function urlADataUrl(url: string): Promise<string> {
  const pngUrl = url.includes('/upload/') ? url.replace('/upload/', '/upload/f_png,w_256/') : url;

  // 1. Intentar con fetch directo
  try {
    const res = await fetch(pngUrl, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    // Si fetch falla por CORS o red, intentar con elemento Image + canvas
  }

  // 2. Fallback: cargar vía Image y renderizar en Canvas a data:image/png
  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 192;
        canvas.height = img.naturalHeight || 192;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('Canvas 2D context no disponible'));
        }
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('No se pudo cargar imagen: ' + pngUrl));
    img.src = pngUrl;
  });
}