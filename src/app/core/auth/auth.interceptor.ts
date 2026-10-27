import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { API_AUTHENTICATED_PREFIXES, gatewayApiPath } from '../config/api-config';
import { AuthService } from './auth.service';

/**
 * Adjunta `Authorization: Bearer <token>` a las peticiones dirigidas al API
 * Gateway que apuntan a rutas protegidas. Las llamadas a `/api/auth/login*`
 * quedan limpias de cabecera para evitar enviar tokens vencidos al login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!shouldAttachToken(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.getToken();

  if (!token) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });

  return next(authReq);
};

function shouldAttachToken(url: string): boolean {
  const path = gatewayApiPath(url);
  if (!path) {
    return false;
  }
  return API_AUTHENTICATED_PREFIXES.some(prefix => path.startsWith(prefix));
}
