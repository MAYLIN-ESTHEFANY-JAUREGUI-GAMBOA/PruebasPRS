import { CommonModule } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { AuthService, ROLES } from '../../core/auth/auth.service';
import { CivicToastHost } from '../../shared/components/civic-toast-host/civic-toast-host';

type NavGroupKey = 'respuesta' | 'gestion' | 'municipalidad' | 'admin';

interface MenuItem {
  label: string;
  /** Título en la barra superior. Si falta, se usa `label`. */
  pageTitle?: string;
  route: string;
  icon: string;
  exact: boolean;
  group: NavGroupKey;
  /** Roles autorizados. `undefined` = visible para cualquier sesión. */
  roles?: readonly string[];
}

interface NavGroup {
  key: NavGroupKey;
  label: string;
  items: MenuItem[];
}

const NAV_GROUP_LABELS: Record<NavGroupKey, string> = {
  respuesta: 'Respuesta',
  gestion: 'Gestión',
  municipalidad: 'Municipalidad',
  admin: 'Administración'
};

const HORA_LIMA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const ROLE_LABELS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super administrador',
  [ROLES.MUNICIPALIDAD_ADMIN]: 'Administrador municipal',
  [ROLES.ENTIDAD_ADMIN]: 'Administrador de entidad',
  [ROLES.OPERADOR_ENTIDAD]: 'Operador',
  [ROLES.ANALISTA]: 'Analista',
  [ROLES.CIUDADANO]: 'Ciudadano'
};

/** Mismas líneas y colores que el panel del login. */
const LINEAS = [
  { numero: '105', nombre: 'Policía', color: 'oklch(0.42 0.1 262)' },
  { numero: '116', nombre: 'Bomberos', color: 'oklch(0.56 0.17 30)' },
  { numero: '106', nombre: 'SAMU', color: 'oklch(0.56 0.1 175)' }
] as const;

const NAV_GROUP_ORDER: readonly NavGroupKey[] = ['respuesta', 'gestion', 'municipalidad', 'admin'];

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CivicToastHost
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css'
})
export class MainLayout {

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly sidebarOpen = signal(false);
  readonly session = this.authService.session;
  readonly horaLima = signal<string | null>(null);
  readonly lineas = LINEAS;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // El perfil solo se pide al iniciar sesión; si falló o la sesión es anterior, se recupera aquí.
      if (!this.authService.session()?.profile) {
        this.authService.refreshProfile().subscribe();
      }
      const tick = () => this.horaLima.set(HORA_LIMA.format(new Date()));
      tick();
      const intervalo = setInterval(tick, 30_000);
      destroyRef.onDestroy(() => clearInterval(intervalo));
    });
  }

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** Sin nombre en el perfil, AuthService devuelve el código del rol (p. ej. "CIUDADANO"). */
  readonly tieneNombre = computed(() => !(this.authService.getDisplayName() in ROLE_LABELS));
  readonly displayName = computed(() => {
    const nombre = this.authService.getDisplayName();
    return ROLE_LABELS[nombre] ?? nombre;
  });
  readonly initials = computed(() => this.authService.getInitials());
  /** Segunda línea de la sesión: rol y documento (DNI o RUC). */
  readonly datosSesion = computed(() => {
    const session = this.authService.session();
    const doc = session?.profile?.dni ? `DNI ${session.profile.dni}`
      : session?.entidad?.ruc ? `RUC ${session.entidad.ruc}` : '';
    return [this.tieneNombre() ? this.roleLabel() : '', doc].filter(Boolean).join(' · ') || 'Sesión activa';
  });
  readonly roleLabel = computed(() => {
    const session = this.authService.session();
    if (!session) return 'Invitado';
    const tipoEntidad = this.authService.getTipoEntidad();
    if (tipoEntidad) return tipoEntidad;
    const rol = this.authService.primaryRole();
    return rol ? ROLE_LABELS[rol] ?? rol : 'Usuario';
  });

  readonly menuItems: readonly MenuItem[] = [
    {
      label: 'Dashboard',
      route: '/dashboard',
      icon: 'space_dashboard',
      exact: true,
      group: 'respuesta'
    },
    {
      label: 'Emergencias',
      route: '/emergencias',
      icon: 'e911_emergency',
      exact: false,
      group: 'respuesta'
    },
    {
      label: 'Recursos',
      route: '/recursos-operativos',
      icon: 'local_shipping',
      exact: false,
      group: 'gestion'
    },
    {
      label: 'Patrullaje',
      route: '/asignacion-patrullaje',
      icon: 'route',
      exact: false,
      group: 'gestion'
    },
    {
      label: 'Mantenimiento Flota',
      route: '/mantenimiento-flota',
      icon: 'build_circle',
      exact: false,
      group: 'gestion',
      roles: [ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD]
    },
    {
      label: 'Personal',
      pageTitle: 'Personal',
      route: '/personal',
      icon: 'group_add',
      exact: false,
      group: 'gestion',
      roles: [ROLES.ENTIDAD_ADMIN, ROLES.MUNICIPALIDAD_ADMIN]
    },
    {
      label: 'Chat de Entidades',
      pageTitle: 'Chat de Coordinación',
      route: '/chat-entidades',
      icon: 'forum',
      exact: false,
      group: 'gestion',
      roles: [ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD, ROLES.ANALISTA]
    },
    {
      label: 'Entidades',
      route: '/entidades',
      icon: 'apartment',
      exact: false,
      group: 'municipalidad',
      roles: [ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN]
    },
    {
      label: 'Municipalidades',
      route: '/municipalidades',
      icon: 'account_balance',
      exact: false,
      group: 'municipalidad',
      roles: [ROLES.SUPER_ADMIN]
    },
    {
      label: 'Mi municipalidad',
      route: '/municipalidades',
      icon: 'account_balance',
      exact: false,
      group: 'municipalidad',
      roles: [ROLES.MUNICIPALIDAD_ADMIN]
    },
    {
      label: 'Usuarios',
      route: '/usuarios',
      icon: 'group',
      exact: false,
      group: 'admin',
      roles: [ROLES.SUPER_ADMIN]
    },
    {
      label: 'Roles',
      route: '/roles',
      icon: 'admin_panel_settings',
      exact: false,
      group: 'admin',
      roles: [ROLES.SUPER_ADMIN]
    },
    {
      label: 'Solicitudes',
      pageTitle: 'Solicitudes de registro',
      route: '/solicitudes-registro',
      icon: 'badge',
      exact: false,
      group: 'admin',
      roles: [ROLES.SUPER_ADMIN]
    },
    {
      label: 'Castigos',
      route: '/castigos',
      icon: 'gavel',
      exact: false,
      group: 'admin',
      roles: [ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD, ROLES.ANALISTA]
    }
  ];

  readonly visibleMenu = computed<MenuItem[]>(() => {
    if (!this.authService.isAuthenticated()) return [];
    return this.menuItems.filter(item =>
      !item.roles || this.authService.hasRole(...item.roles)
    );
  });

  readonly navGroups = computed<NavGroup[]>(() => {
    const items = this.visibleMenu();
    return NAV_GROUP_ORDER
      .map((key) => ({
        key,
        label: NAV_GROUP_LABELS[key],
        items: items.filter((item) => item.group === key)
      }))
      .filter((group) => group.items.length > 0);
  });

  readonly activePage = computed(() => {
    const url = (this.currentUrl() ?? '').split('?')[0];
    const match = [...this.menuItems]
      .sort((a, b) => b.route.length - a.route.length)
      .find(item => url === item.route || (item.route !== '/dashboard' && url.startsWith(item.route)));
    return match ?? this.menuItems[0];
  });

  readonly scopeLabel = computed(() => {
    if (this.authService.isAdmin()) return 'Vista global · Todas las municipalidades';
    if (this.authService.isMunicipalScope()) return 'Vista municipal · Solo lectura de emergencias';
    const tipo = this.authService.getTipoEntidad();
    if (tipo) return `Vista de entidad · ${tipo}`;
    if (this.authService.getEntidadId()) return 'Vista de entidad';
    return '';
  });

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
