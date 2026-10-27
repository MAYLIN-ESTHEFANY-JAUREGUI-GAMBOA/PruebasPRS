import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/auth/error.interceptor';


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor])
      // withFetch() removido: la Fetch API no pasa por el proxy del Angular CLI
      // dev-server, lo que impide que /api/* sea redirigido a localhost:9000.
      // XHR (default) sí respeta el proxyConfig y funciona igual en producción.
    )
  ]
};
