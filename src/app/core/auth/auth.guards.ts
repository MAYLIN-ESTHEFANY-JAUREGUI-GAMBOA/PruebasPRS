import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { AuthService } from './auth.service';

/**
 * Guard factory que restringe una ruta a uno o varios roles.
 *
 * - En SSR/prerender deja pasar para no romper el build (el browser revalidará).
 * - Si no hay sesión, redirige a `/login` preservando `returnUrl`.
 * - Si el rol no aplica, muestra advertencia y redirige a `/dashboard`.
 *
 * Uso: `canActivate: [authGuard, roleGuard([ROLES.SUPER_ADMIN])]`
 */
export function roleGuard(allowedRoles: readonly string[]): CanActivateFn {
  return (_route, state) => {
    const platformId = inject(PLATFORM_ID);
    if (!isPlatformBrowser(platformId)) {
      return true;
    }

    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], {
        queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : undefined
      });
    }

    if (auth.hasRole(...allowedRoles)) {
      return true;
    }

    void Swal.fire({
      icon: 'warning',
      title: 'Acceso denegado',
      text: 'No tienes el rol necesario para entrar a esta sección.',
      confirmButtonText: 'Entendido'
    });

    return router.createUrlTree(['/dashboard']);
  };
}

/**
 * Bloquea rutas que requieren sesión activa.
 *
 * En SSR (server) deja pasar la pre-renderización para no romper el build;
 * el navegador re-evalúa al hidratar y, si no hay token, redirige a /login.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const auth = inject(AuthService);
  if (auth.isAuthenticated()) {
    return true;
  }

  const router = inject(Router);
  return router.createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : undefined
  });
};

/**
 * Evita que un usuario ya autenticado regrese al login.
 */
export const loginGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) {
    return true;
  }

  const router = inject(Router);
  return router.createUrlTree(['/dashboard']);
};
