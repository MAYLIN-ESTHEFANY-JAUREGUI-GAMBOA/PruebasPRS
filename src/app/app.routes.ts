import { Routes } from '@angular/router';

import { authGuard, loginGuard, roleGuard } from './core/auth/auth.guards';
import { ROLES } from './core/auth/auth.service';
import { MainLayout } from './layout/main-layout/main-layout';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.Login),
    canActivate: [loginGuard]
  },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'emergencias',
        loadComponent: () => import('./features/microservices/incidents/incidents').then(m => m.IncidentsComponent)
      },
      {
        path: 'incidents',
        redirectTo: 'emergencias',
        pathMatch: 'full'
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./features/microservices/usuarios/usuarios').then(m => m.Usuarios),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN])]
      },
      {
        path: 'roles',
        loadComponent: () => import('./features/microservices/roles/roles').then(m => m.Roles),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN])]
      },
      {
        path: 'personal',
        loadComponent: () => import('./features/microservices/personal-entidad/personal-entidad').then(m => m.PersonalEntidad),
        canActivate: [roleGuard([ROLES.ENTIDAD_ADMIN, ROLES.MUNICIPALIDAD_ADMIN])]
      },
      {
        path: 'solicitudes-registro',
        loadComponent: () => import('./features/microservices/solicitudes-registro/solicitudes-registro').then(m => m.SolicitudesRegistro),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN])]
      },
      {
        path: 'castigos',
        loadComponent: () => import('./features/microservices/castigos/castigos').then(m => m.Castigos),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD, ROLES.ANALISTA])]
      },
      {
        path: 'usuarios-castigos',
        redirectTo: 'usuarios',
        pathMatch: 'full'
      },
      {
        path: 'entidades',
        loadComponent: () => import('./features/microservices/entidades/entidades').then(m => m.Entidades),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN])]
      },
      {
        path: 'municipalidades',
        loadComponent: () => import('./features/microservices/municipalidades/municipalidades').then(m => m.Municipalidades),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN])]
      },
      {
        path: 'recursos-operativos',
        loadComponent: () => import('./features/microservices/recursos-operativos/recursos-operativos').then(m => m.RecursosOperativos)
      },
      {
        path: 'asignacion-patrullaje',
        loadComponent: () => import('./features/microservices/asignacion-patrullaje/asignacion-patrullaje').then(m => m.AsignacionPatrullaje)
      },
      {
        path: 'mantenimiento-flota',
        loadComponent: () => import('./features/microservices/flota-mantenimiento/flota-mantenimiento').then(m => m.FlotaMantenimientoComponent),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD])]
      },
      {
        path: 'chat-entidades',
        loadComponent: () => import('./features/microservices/chat-entidades/chat-entidades').then(m => m.ChatEntidades),
        canActivate: [roleGuard([ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD, ROLES.ANALISTA])]
      }
    ]
  },
  {
    path: 'tracking/:id',
    loadComponent: () => import('./features/microservices/tracking-operario/tracking-operario').then(m => m.TrackingOperario)
    // Sin authGuard ni MainLayout — página pública para el operario en campo
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
