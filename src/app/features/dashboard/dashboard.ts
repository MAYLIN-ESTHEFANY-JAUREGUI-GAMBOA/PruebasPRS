import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../../core/auth/auth.service';
import { API_PATHS, buildApiUrl } from '../../core/config/api-config';
import { EntidadService } from '../../core/services/entidad';
import { RecursoOperativoService } from '../../core/services/recurso-operativo';
import { MunicipalidadService } from '../../core/services/municipalidad';
import { UsuarioAdminService } from '../../core/services/usuario-admin';
import { CastigoHistorialEntry } from '../../core/models/usuario.model';
import { GeneralPdfService } from '../../core/reports/general/general-pdf.service';
import { GeneralExcelService } from '../../core/reports/general/general-excel.service';
import { IndicadorGeneral, conteoPor } from '../../core/reports/general/general-reporte.model';
import { CivicToastService } from '../../shared/services/civic-toast.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {

  totalEntidades = 0;
  totalRecursos = 0;

  totalEntidadesActivas = 0;
  totalEntidadesInactivas = 0;

  recursosDisponibles = 0;
  recursosOcupados = 0;
  recursosMantenimiento = 0;
  recursosFueraServicio = 0;

  totalTiposEntidad = 0;
  totalCategoriasRecursos = 0;

  porcentajeRecursosDisponibles = 0;
  porcentajeEntidadesActivas = 0;

  /** Conteos de `/api/incidents/estadisticas`: el backend ya los acota a la entidad o municipalidad. */
  incidentesTotal = 0;
  incidentesPorEstado: { clave: string; total: number }[] = [];
  incidentesPorTipo: { clave: string; total: number }[] = [];
  incidentesPorGravedad: { clave: string; total: number }[] = [];

  cargando = true;
  errorCarga = false;
  generandoReporte = false;

  fechaActual = new Date().toLocaleDateString('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  private readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly municipalidadService = inject(MunicipalidadService);
  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly generalPdf = inject(GeneralPdfService);
  private readonly generalExcel = inject(GeneralExcelService);
  private readonly toast = inject(CivicToastService);
  /** Reporte general: SUPER_ADMIN (todo PRS) o MUNICIPALIDAD_ADMIN (solo su municipalidad). */
  readonly puedeExportarGeneral = this.authService.isAdmin() || this.authService.isMunicipalidadAdmin();
  /** Personal municipal: ve todas las entidades de su municipalidad, sin atender. */
  readonly esMunicipal = this.authService.isMunicipalScope();

  /** True solo si la sesión actual es ADMIN del sistema. */
  readonly esAdmin = this.authService.isAdmin();
  /** ID de la entidad del usuario (null para ADMIN). */
  readonly entidadIdActual = this.authService.getEntidadId();
  /** True si la vista debe mostrar solo datos de la entidad del usuario. */
  readonly enScopeDeEntidad = !this.esAdmin && !!this.entidadIdActual;

  constructor(
    private entidadService: EntidadService,
    private recursoService: RecursoOperativoService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.cargarResumen();
  }

  /** Fuerza CD aunque el callback resuelva fuera de zona. */
  private refrescarVista(): void {
    try {
      this.cdr.detectChanges();
    } catch {
      // Componente posiblemente destruido; ignoramos.
    }
  }

  cargarResumen(): void {
    this.cargando = true;
    this.errorCarga = false;
    this.refrescarVista();

    // Para un usuario atado a una entidad, mostramos KPIs acotados a su entidad:
    //   - entidades: solo la suya
    //   - recursos: solo los suyos
    //   - catálogos: globales (los catálogos son de sistema)
    // Cada llamada cae a [] / null si falla para no tumbar el dashboard.
    const enScope = this.enScopeDeEntidad && !!this.entidadIdActual;

    const entidades$ = enScope
      ? this.entidadService.obtenerPorId(this.entidadIdActual!).pipe(
          map((e) => (e ? [e] : [])),
          catchError((err) => { console.error('Dashboard: entidad propia', err); return of([] as any[]); })
        )
      : this.entidadService.listar().pipe(
          catchError((err) => { console.error('Dashboard: entidades', err); return of([] as any[]); })
        );

    const recursos$ = enScope
      ? this.recursoService.obtenerPorEntidad(this.entidadIdActual!).pipe(
          catchError((err) => { console.error('Dashboard: recursos entidad', err); return of([] as any[]); })
        )
      : this.recursoService.listar().pipe(
          catchError((err) => { console.error('Dashboard: recursos', err); return of([] as any[]); })
        );

    const incidentes$ = this.http
      .get<IncidenteEstadisticas>(buildApiUrl(`${API_PATHS.incident}/stats`))
      .pipe(catchError((err) => { console.error('Dashboard: incidentes', err); return of(null); }));

    forkJoin({
      entidades: entidades$,
      recursos: recursos$,
      incidentes: incidentes$
    }).subscribe({
      next: ({ entidades, recursos, incidentes }) => {
        this.ngZone.run(() => {
        this.incidentesTotal = incidentes?.total ?? 0;
        this.incidentesPorEstado = this.aLista(incidentes?.byStatus);
        this.incidentesPorTipo = this.aLista(incidentes?.byType);
        this.incidentesPorGravedad = this.aLista(incidentes?.bySeverity);
        this.totalEntidades = entidades.length;
        this.totalRecursos = recursos.length;

        this.totalEntidadesActivas = entidades.filter((entidad: any) =>
          this.normalizarTexto(entidad.estado) === 'ACTIVO'
        ).length;

        this.totalEntidadesInactivas = entidades.filter((entidad: any) =>
          this.normalizarTexto(entidad.estado) !== 'ACTIVO'
        ).length;

        this.recursosDisponibles = recursos.filter((recurso: any) =>
          this.normalizarTexto(recurso.estadoDisponibilidad) === 'DISPONIBLE'
        ).length;

        this.recursosOcupados = recursos.filter((recurso: any) =>
          this.normalizarTexto(recurso.estadoDisponibilidad) === 'OCUPADO'
        ).length;

        this.recursosMantenimiento = recursos.filter((recurso: any) =>
          this.normalizarTexto(recurso.estadoDisponibilidad) === 'MANTENIMIENTO'
        ).length;

        this.recursosFueraServicio = recursos.filter((recurso: any) =>
          this.normalizarTexto(recurso.estadoDisponibilidad) === 'FUERA_DE_SERVICIO'
        ).length;

        this.totalTiposEntidad = new Set(
          entidades
            .map((entidad: any) => entidad.entityType)
            .filter((tipo: any) => !!tipo)
        ).size;

        this.totalCategoriasRecursos = new Set(
          recursos
            .map((recurso: any) => recurso.categoria)
            .filter((categoria: any) => !!categoria)
        ).size;

        this.porcentajeRecursosDisponibles = this.calcularPorcentaje(
          this.recursosDisponibles,
          this.totalRecursos
        );

        this.porcentajeEntidadesActivas = this.calcularPorcentaje(
          this.totalEntidadesActivas,
          this.totalEntidades
        );

        this.cargando = false;
        this.refrescarVista();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error cargando dashboard:', error);
          this.errorCarga = true;
          this.cargando = false;
          this.refrescarVista();
        });
      }
    });
  }

  /** Reporte general: consulta cada módulo al exportar; la municipalidad recibe solo lo de su alcance (lo acota el backend). */
  async exportarGeneral(formato: 'pdf' | 'xlsx'): Promise<void> {
    if (this.generandoReporte) return;
    this.generandoReporte = true;
    this.refrescarVista();
    try {
      const global = this.authService.isAdmin();
      const mid = this.authService.getMunicipalidadId();
      const d = await firstValueFrom(forkJoin({
        municipalidades: global ? this.municipalidadService.listar() : this.municipalidadService.obtener(mid!).pipe(map(m => [m])),
        entidades: this.entidadService.listar(),
        usuarios: global ? this.usuarioAdminService.listarUsuarios() : this.usuarioAdminService.listarPersonalEntidad(),
        castigos: this.usuarioAdminService.listarHistorialCastigos(),
        incidentes: this.http.get<IncidenteEstadisticas>(buildApiUrl(`${API_PATHS.incident}/stats`))
      }));
      // Nivel vigente = el del último movimiento de cada usuario.
      const ultimo = new Map<string, CastigoHistorialEntry>();
      d.castigos.forEach(c => {
        const prev = ultimo.get(c.userId);
        if (!prev || c.recordedAt > prev.recordedAt) ultimo.set(c.userId, c);
      });
      const deConteo = (modulo: string, prefijo: string, conteo: Record<string, number> | undefined): IndicadorGeneral[] =>
        this.aLista(conteo).map(c => ({ modulo, indicador: `${prefijo}: ${c.clave}`, total: c.total }));
      const indicadores: IndicadorGeneral[] = [
        { modulo: 'Municipalidades', indicador: 'Total registradas', total: d.municipalidades.length },
        ...conteoPor('Municipalidades', d.municipalidades, m => m.status),
        { modulo: 'Entidades', indicador: 'Total registradas', total: d.entidades.length },
        ...conteoPor('Entidades', d.entidades, (e: any) => e.estado),
        { modulo: 'Usuarios', indicador: global ? 'Total registrados' : 'Personal municipal registrado', total: d.usuarios.length },
        ...conteoPor('Usuarios', d.usuarios, u => u.estado),
        { modulo: 'Castigos', indicador: 'Movimientos registrados', total: d.castigos.length },
        { modulo: 'Castigos', indicador: 'Usuarios con castigo vigente', total: [...ultimo.values()].filter(c => c.newLevel > 0).length },
        { modulo: 'Incidentes', indicador: 'Total registrados', total: d.incidentes?.total ?? 0 },
        ...deConteo('Incidentes', 'Estado', d.incidentes?.byStatus),
        ...deConteo('Incidentes', 'Gravedad', d.incidentes?.bySeverity)
      ];
      const alcance = global ? 'Todas las municipalidades' : (d.municipalidades[0]?.businessName ?? 'Su municipalidad');
      await (formato === 'pdf' ? this.generalPdf.generar(indicadores, alcance) : this.generalExcel.generar(indicadores, alcance));
      this.toast.success(`Reporte ${formato === 'pdf' ? 'PDF' : 'Excel'} generado.`);
    } catch (err) {
      console.error('Dashboard: reporte general', err);
      this.toast.error('No se pudo generar el reporte general.');
    } finally {
      this.generandoReporte = false;
      this.refrescarVista();
    }
  }

  normalizarTexto(valor: string | null | undefined): string {
    return String(valor || '')
      .trim()
      .toUpperCase()
      .replaceAll(' ', '_')
      .replaceAll('-', '_');
  }

  calcularPorcentaje(valor: number, total: number): number {
    if (!total || total === 0) return 0;
    return Math.round((valor * 100) / total);
  }

  get metricasPrincipales() {
    const base: Array<{
      titulo: string;
      valor: number;
      descripcion: string;
      icono: 'catalog' | 'building' | 'truck';
      tone: 'primary' | 'teal' | 'accent';
      ruta: string | null;
    }> = [
      {
        titulo: this.enScopeDeEntidad ? 'Mi entidad' : 'Entidades',
        valor: this.totalEntidades,
        descripcion: this.enScopeDeEntidad
          ? (this.totalEntidadesActivas === 1 ? 'Estado: ACTIVA' : 'Estado: INACTIVA')
          : `${this.totalEntidadesActivas} activas`,
        icono: 'building',
        tone: 'teal',
        ruta: this.esAdmin ? '/entidades' : null
      },
      {
        titulo: 'Recursos operativos',
        valor: this.totalRecursos,
        descripcion: `${this.recursosDisponibles} disponibles`,
        icono: 'truck',
        tone: 'accent',
        ruta: '/recursos-operativos'
      }
    ];

    return base;
  }

  get estadosRecursos() {
    return [
      {
        nombre: 'Disponibles',
        valor: this.recursosDisponibles,
        tone: 'success'
      },
      {
        nombre: 'En operación',
        valor: this.recursosOcupados,
        tone: 'accent'
      },
      {
        nombre: 'Mantenimiento',
        valor: this.recursosMantenimiento,
        tone: 'danger'
      },
      {
        nombre: 'Fuera de servicio',
        valor: this.recursosFueraServicio,
        tone: 'muted'
      }
    ];
  }

  get accionesRapidas() {
    const acciones: Array<{
      titulo: string;
      descripcion: string;
      ruta: string;
      icono: 'catalog' | 'building' | 'truck' | 'map' | 'alert';
      tone: 'primary' | 'teal' | 'accent' | 'danger';
    }> = [];

    if (this.esAdmin) {
      acciones.push({
        titulo: 'Gestionar entidades',
        descripcion: 'Instituciones aliadas del distrito',
        ruta: '/entidades',
        icono: 'building',
        tone: 'teal'
      });
    }

    acciones.push(
      {
        titulo: 'Gestionar recursos',
        descripcion: 'Unidades y equipos operativos',
        ruta: '/recursos-operativos',
        icono: 'truck',
        tone: 'accent'
      },
      {
        titulo: 'Gestionar patrullajes',
        descripcion: 'Áreas de patrullaje asignadas',
        ruta: '/asignacion-patrullaje',
        icono: 'map',
        tone: 'primary'
      },
      {
        titulo: 'Centro de emergencias',
        descripcion: this.enScopeDeEntidad
          ? 'Incidentes asignados a tu entidad'
          : 'Monitoreo global de alertas',
        ruta: '/emergencias',
        icono: 'alert',
        tone: 'danger'
      }
    );

    return acciones;
  }

  /** Mayor primero, con la clave legible (ACCIDENTE_TRANSITO -> Accidente transito). */
  private aLista(conteos: Record<string, number> | undefined): { clave: string; total: number }[] {
    return Object.entries(conteos ?? {})
      .map(([clave, total]) => ({ clave: this.formatearClave(clave), total }))
      .sort((a, b) => b.total - a.total);
  }

  private formatearClave(clave: string): string {
    const texto = clave.replace(/_/g, ' ').toLowerCase();
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}

interface IncidenteEstadisticas {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}
