import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Estrategia de renderizado en el servidor.
 *
 * Es un panel administrativo cuyas vistas dependen del token JWT del usuario,
 * por lo que la prerenderización en build-time generaba HTML vacío y la hidratación
 * posterior no reevaluaba los bindings tras la carga HTTP (los listados aparecían
 * solo después de cambiar un filtro). `RenderMode.Client` evita el problema
 * delegando todo el render al navegador.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'login',
    renderMode: RenderMode.Prerender
  },
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
