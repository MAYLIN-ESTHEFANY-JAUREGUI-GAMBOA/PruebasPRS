import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { API_PATHS, gatewayApiPath } from '../config/api-config';
import { AuthService } from './auth.service';

const LOGIN_PATHS: readonly string[] = [API_PATHS.authLogin, API_PATHS.authLoginEntidad];

/**
 * Rutas cuyo 401 indica que la sesión expiró de verdad y hay que hacer logout.
 * Son las únicas que llevan el token y cuyo rechazo garantiza que el JWT es inválido.
 */
const SESSION_INVALIDATING_PATHS: readonly string[] = [
  API_PATHS.authProfile,
  API_PATHS.authEntidadPerfil,
];

/** Flag para evitar múltiples logouts/redirecciones simultáneas ante varios 401 en paralelo. */
let redirectingToLogin = false;

/**
 * Captura errores HTTP 401 del gateway.
 *
 * Comportamiento:
 * - Si el 401 viene de una ruta "bootstrap" (login, castigo) → propaga el error
 *   sin tocar la sesión; el componente lo maneja.
 * - Si el 401 viene de /auth/profile → la sesión es definitivamente inválida:
 *   logout completo + redirect a /login.
 * - Para cualquier otro 401 (recursos, subasignaciones, etc.) → solo propaga el
 *   error al componente que hizo la llamada. El componente mostrará su propio
 *   mensaje. NO se destruye la sesión, porque el 401 puede ser de permisos de
 *   rol, no de token inválido (el usuario aún puede navegar a otras secciones).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthBootstrapRequest(req.url)
      ) {
        const path = gatewayApiPath(req.url) ?? '';
        const sessionInvalid = SESSION_INVALIDATING_PATHS.some(p =>
          path === p || path.startsWith(`${p}/`)
        );

        if (sessionInvalid && !redirectingToLogin) {
          // El token fue rechazado en /profile → sesión definitivamente muerta.
          redirectingToLogin = true;
          auth.logout();

          const returnUrl = router.url;
          const target = returnUrl.startsWith('/login') ? '/login' : returnUrl;

          router
            .navigate(['/login'], {
              queryParams: target && target !== '/login' ? { returnUrl: target } : undefined,
              replaceUrl: true
            })
            .finally(() => { redirectingToLogin = false; });
        }
        // En todos los demás casos solo propagamos el error.
        // El componente (p.ej. catchError en forkJoin de patrullaje) lo maneja.
      }
      return throwError(() => error);
    })
  );
};

/**
 * Rutas de autenticación que NO deben disparar ninguna lógica de sesión aunque
 * devuelvan 401. El componente de login maneja sus propios errores.
 */
function isAuthBootstrapRequest(url: string): boolean {
  const path = gatewayApiPath(url);
  if (!path) return false;
  if (LOGIN_PATHS.some(loginPath => path.startsWith(loginPath))) return true;
  if (path === API_PATHS.authCastigo || path.startsWith(`${API_PATHS.authCastigo}/`)) return true;
  return false;
}
