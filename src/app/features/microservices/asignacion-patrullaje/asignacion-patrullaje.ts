import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, map, of, Subscription } from 'rxjs';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { SubasignacionExcelService } from '../../../core/reports/subasignacion/subasignacion-excel.service';
import { SubasignacionPdfService } from '../../../core/reports/subasignacion/subasignacion-pdf.service';
import { SubasignacionReporteFila, SubasignacionReporteFiltros } from '../../../core/reports/subasignacion/subasignacion-reporte.model';
import { OsmMap, GeoPunto, MapaMarcador, MapaLinea } from '../../../shared/components/osm-map/osm-map';

import { AuthService } from '../../../core/auth/auth.service';
import { Subasignacion } from '../../../core/models/subasignacion.model';
import { Entidad } from '../../../core/models/entidad.model';
import { RecursoOperativo } from '../../../core/models/recurso-operativo.model';
import { LocationHistory } from '../../../core/models/location-history.model';

import { SubasignacionService } from '../../../core/services/subasignacion';
import { EntidadService } from '../../../core/services/entidad';
import { RecursoOperativoService } from '../../../core/services/recurso-operativo';
import { TrackingService } from '../../../core/services/tracking.service';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { GeoPatrolMap } from '../../../shared/components/geo-map-picker/geo-patrol-map';

type ModoModal = 'crear' | 'ver' | 'editar' | 'creado';
type FiltroEstado = 'TODOS' | 'ACTIVA' | 'FINALIZADA' | 'CANCELADA';
type VistaTab = 'lista' | 'mapa';
type CampoForm =
  | 'recursoId'
  | 'entidadDestinoId'
  | 'turno'
  | 'fechaInicio'
  | 'fechaFin'
  | 'asignadoPor';

const TURNOS = ['T_DIA', 'T_TARDE', 'T_NOCHE'] as const;
const REGEX_ASIGNADO_POR = /^[A-Za-záéíóúÁÉÍÓÚñÑ0-9][A-Za-záéíóúÁÉÍÓÚñÑ0-9\s\-_]{1,99}$/;

interface SubasignacionForm {
  recursoId: string;
  entidadDestinoId: string;
  turno: string;
  fechaInicio: string;
  fechaFin: string;
  asignadoPor: string;
  observaciones: string;
  estado: string;
}

@Component({
  selector: 'app-asignacion-patrullaje',
  standalone: true,
  imports: [CommonModule, FormsModule, GeoPatrolMap, OsmMap],
  templateUrl: './asignacion-patrullaje.html',
  styleUrl: './asignacion-patrullaje.css'
})
export class AsignacionPatrullaje implements OnInit, OnDestroy {

  subasignaciones: Subasignacion[] = [];
  subasignacionesFiltradas: Subasignacion[] = [];

  recursos: RecursoOperativo[] = [];
  entidades: Entidad[] = [];

  cargando = false;
  guardando = false;
  errorCarga: string | null = null;

  busqueda = '';
  filtroActivo: FiltroEstado = 'TODOS';

  /** Vista activa: tabla de lista o mapa de patrulleros */
  vistaActiva: VistaTab = 'lista';

  modalAbierto = false;
  modoModal: ModoModal = 'crear';

  seleccionado: Subasignacion | null = null;
  /** Subasignación recién creada — usada en el modo 'creado' para mostrar el enlace de tracking */
  nuevaSubasignacion: Subasignacion | null = null;
  form!: SubasignacionForm;
  errores: Partial<Record<CampoForm, string>> = {};

  toast: { mensaje: string; tipo: 'exito' | 'error' | 'info' } | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Tracking en tiempo real ──────────────────────────────────────────────

  /** Historial de posiciones de la subasignación actualmente vista */
  trackingHistorial: LocationHistory[] = [];

  /** Posición más reciente recibida (historial[0] o push SSE) */
  trackingLatest: LocationHistory | null = null;

  /** Estado de carga inicial del historial */
  trackingCargando = false;

  /** Suscripción al polling de tracking */
  private trackingPoll$: Subscription | null = null;

  /** ID de la subasignación cuyo stream está activo */
  private trackingActiveId: string | null = null;

  // ── Computed: mapa de tracking ───────────────────────────────────────────

  get trackingMapCenter(): GeoPunto {
    if (this.trackingLatest) {
      return { lat: this.trackingLatest.lat, lng: this.trackingLatest.lng };
    }
    return { lat: -13.0767, lng: -76.3896 };
  }

  readonly trackingMapZoom = 15;

  get trackingMarcadores(): MapaMarcador[] {
    return this.trackingLatest
      ? [{ lat: this.trackingLatest.lat, lng: this.trackingLatest.lng, punto: true, color: '#4f46e5', titulo: 'Posición actual' }]
      : [];
  }

  get trackingPolylinePath(): GeoPunto[] {
    return [...this.trackingHistorial]
      .reverse()
      .map(p => ({ lat: p.lat, lng: p.lng }));
  }

  get trackingLineas(): MapaLinea[] {
    return [{ puntos: this.trackingPolylinePath, color: '#6366f1', grosor: 3 }];
  }

  /**
   * Badge de actividad: verde <1 min, amarillo 1-5 min, rojo >5 min o sin datos
   */
  get trackingActivityColor(): 'green' | 'yellow' | 'red' {
    if (!this.trackingLatest) return 'red';
    const diffMs = Date.now() - new Date(this.trackingLatest.recordedAt).getTime();
    const diffMin = diffMs / 60_000;
    if (diffMin < 1)  return 'green';
    if (diffMin < 5)  return 'yellow';
    return 'red';
  }

  get trackingActivityLabel(): string {
    switch (this.trackingActivityColor) {
      case 'green':  return 'Activo';
      case 'yellow': return 'Inactivo reciente';
      case 'red':    return this.trackingLatest ? 'Inactivo' : 'Sin datos';
    }
  }

  readonly turnos = TURNOS;

  private readonly authService = inject(AuthService);
  private readonly civicToast  = inject(CivicToastService);
  private readonly trackingService = inject(TrackingService);
  private readonly branding = inject(ReportBrandingService);
  private readonly subasignacionPdf = inject(SubasignacionPdfService);
  private readonly subasignacionExcel = inject(SubasignacionExcelService);

  readonly esAdmin = this.authService.isAdmin();

  fechaMinimaISO = this.calcularFechaMinima();
  private _fechaMinimaTimer: ReturnType<typeof setInterval> | null = null;

  private calcularFechaMinima(): string {
    const ahora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}T${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
  }

  get entidadIdActual(): string | null { return this.authService.getEntidadId(); }
  get enScopeDeEntidad(): boolean { return !this.authService.isAdmin() && !!this.authService.getEntidadId(); }
  get puedeCrear(): boolean { return this.esAdmin || this.authService.isEntidadAdmin(); }

  /** URL de tracking para la subasignación recién creada */
  get trackingUrlNueva(): string {
    if (!this.nuevaSubasignacion?.id) return '';
    return `${window.location.origin}/tracking/${this.nuevaSubasignacion.id}`;
  }

  /** Solo subasignaciones ACTIVAS con GPS para el mapa */
  get subasignacionesParaMapa(): Subasignacion[] {
    return this.subasignaciones.filter(s => s.status === 'ACTIVA');
  }

  /** Recursos disponibles para nueva subasignación (sin subasignación ACTIVA) */
  get recursosDisponiblesParaAsignar(): RecursoOperativo[] {
    const idsOcupados = new Set(
      this.subasignaciones
        .filter(s => s.status === 'ACTIVA')
        .map(s => this.normId(s.resourceId))
    );
    return this.recursos.filter(r => !idsOcupados.has(this.normId(r.id)));
  }

  /** Cuántas subasignaciones activas tienen GPS registrado */
  get conGpsCount(): number {
    return this.subasignaciones.filter(
      s => s.status === 'ACTIVA' && s.latitude != null && s.longitude != null
    ).length;
  }

  constructor(
    private subasignacionService: SubasignacionService,
    private recursoService: RecursoOperativoService,
    private entidadService: EntidadService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.form = this.crearFormVacio();
    this.cargarDatos();
    this._fechaMinimaTimer = setInterval(() => {
      this.fechaMinimaISO = this.calcularFechaMinima();
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this._fechaMinimaTimer) clearInterval(this._fechaMinimaTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.detenerTrackingStream();
  }

  private refrescar(): void {
    try { this.cdr.detectChanges(); } catch { /* destruido */ }
  }

  // ── Vista tabs ───────────────────────────────────────────────────────────

  cambiarVista(v: VistaTab): void {
    this.vistaActiva = v;
  }

  // ── Carga ────────────────────────────────────────────────────────────────

  cargarDatos(): void {
    this.cargando = true;
    this.errorCarga = null;
    this.refrescar();

    const entidadId = this.entidadIdActual;
    const enScope   = !this.esAdmin && this.enScopeDeEntidad && !!entidadId;

    const handleErr = (label: string) => (err: unknown) => {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      const msg    = err instanceof HttpErrorResponse
        ? (err.error?.message ?? err.error?.error ?? err.message ?? `Error ${err.status}`)
        : 'Error desconocido';
      console.error(`[Patrullaje] ${label} falló (${status}):`, msg, err);
      return of([] as any[]);
    };

    const subs$ = enScope
      ? this.subasignacionService.obtenerPorEntidadDestino(entidadId!).pipe(catchError(handleErr('subasignaciones/entidad')))
      : this.subasignacionService.listar().pipe(catchError(handleErr('subasignaciones/listar')));

    const recursos$ = enScope
      ? this.recursoService.obtenerPorEntidad(entidadId!).pipe(catchError(handleErr('recursos/entidad')))
      : this.recursoService.listar().pipe(catchError(handleErr('recursos/listar')));

    const entidades$ = enScope
      ? this.entidadService.obtenerPorId(entidadId!).pipe(
          map((e: Entidad) => [e] as Entidad[]),
          catchError(handleErr('entidad/id'))
        )
      : this.entidadService.listar().pipe(catchError(handleErr('entidades/listar')));

    forkJoin({ subs: subs$, recursos: recursos$, entidades: entidades$ }).subscribe({
      next: ({ subs, recursos, entidades }) => {
        this.ngZone.run(() => {
          this.subasignaciones = subs || [];
          this.recursos        = recursos || [];
          this.entidades       = Array.isArray(entidades)
            ? entidades
            : (entidades ? [entidades as Entidad] : []);
          this.aplicarFiltros();
          this.cargando  = false;
          this.refrescar();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          this.errorCarga = status === 401
            ? 'Sin autorización (401). Tu sesión puede haber expirado — intenta cerrar sesión y volver a entrar.'
            : `Error al cargar los datos (${status || 'red'}).`;
          this.subasignaciones        = [];
          this.subasignacionesFiltradas = [];
          this.cargando = false;
          this.refrescar();
        });
      }
    });
  }

  // ── Formulario ───────────────────────────────────────────────────────────

  crearFormVacio(): SubasignacionForm {
    return {
      recursoId: '',
      entidadDestinoId: this.entidadIdActual || '',
      turno: '',
      fechaInicio: '',
      fechaFin: '',
      asignadoPor: '',
      observaciones: '',
      estado: 'ACTIVA'
    };
  }

  normalizarAForm(s: Subasignacion): SubasignacionForm {
    return {
      recursoId:        this.normId(s.resourceId),
      entidadDestinoId: this.normId(s.targetEntityId),
      turno:            s.shift || '',
      fechaInicio:      this.isoADatetimeLocal(s.startDate),
      fechaFin:         this.isoADatetimeLocal(s.endDate),
      asignadoPor:      (s.assignedBy) || '',
      observaciones:    s.notes || '',
      estado:           s.status || 'ACTIVA'
    };
  }

  prepararPayload(): Subasignacion {
    return {
      resourceId:        this.form.recursoId.trim(),
      targetEntityId: this.form.entidadDestinoId.trim(),
      shift:            this.form.turno,
      startDate:      this.datetimeLocalAIso(this.form.fechaInicio),
      endDate:         this.datetimeLocalAIso(this.form.fechaFin),
      assignedBy:      this.form.asignadoPor.trim(),
      notes:    this.form.observaciones?.trim() || null,
      status:           this.form.estado || 'ACTIVA'
    };
  }

  // ── Filtros ──────────────────────────────────────────────────────────────

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLowerCase();
    this.subasignacionesFiltradas = this.subasignaciones.filter(s => {
      const coincideEstado  = this.filtroActivo === 'TODOS' || s.status === this.filtroActivo;
      const recursoId       = this.normId(s.resourceId);
      const entidadId       = this.normId(s.targetEntityId);
      const asignadoPor     = (s.assignedBy ?? '').toLowerCase();
      const contenido = [
        s.id, recursoId, entidadId, s.shift, asignadoPor, s.status,
        this.obtenerIdentificadorRecurso(recursoId),
        this.obtenerRazonSocialEntidad(entidadId)
      ].join(' ').toLowerCase();
      return coincideEstado && (!texto || contenido.includes(texto));
    });
  }

  seleccionarFiltro(filtro: FiltroEstado): void {
    this.filtroActivo = filtro;
    this.aplicarFiltros();
  }

  contarPorEstado(estado: string): number {
    return this.subasignaciones.filter(s => s.status === estado).length;
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  abrirCrear(): void {
    if (!this.puedeCrear) return;
    this.modoModal = 'crear';
    this.seleccionado = null;
    this.form = this.crearFormVacio();
    const nombreUsuario = this.authService.getDisplayName();
    if (nombreUsuario && nombreUsuario !== 'Invitado' && nombreUsuario !== 'Usuario') {
      this.form.asignadoPor = nombreUsuario;
    }
    this.errores = {};
    this.modalAbierto = true;
  }

  abrirVer(s: Subasignacion): void {
    this.modoModal   = 'ver';
    this.seleccionado = s;
    this.form = this.normalizarAForm(s);
    this.modalAbierto = true;
    // Iniciar tracking en tiempo real si la subasignación está activa
    if (s.status === 'ACTIVA' && s.id) {
      this.iniciarTrackingParaSubasignacion(s.id);
    }
  }

  abrirEditar(s: Subasignacion): void {
    this.modoModal   = 'editar';
    this.seleccionado = s;
    this.form = this.normalizarAForm(s);
    this.errores = {};
    this.modalAbierto = true;
  }

  abrirEditarDesdeDetalle(): void {
    if (!this.seleccionado) return;
    this.modoModal = 'editar';
    this.errores   = {};
  }

  cerrarModal(): void {
    this.modalAbierto       = false;
    this.guardando          = false;
    this.seleccionado       = null;
    this.nuevaSubasignacion = null;
    this.form               = this.crearFormVacio();
    this.errores            = {};
    this.detenerTrackingStream();
  }

  // ── Guardar ──────────────────────────────────────────────────────────────

  guardar(): void {
    if (this.modoModal === 'ver') return;
    if (!this.validarFormulario()) return;

    const payload  = this.prepararPayload();
    this.guardando = true;

    if (this.modoModal === 'crear') {
      this.subasignacionService.crear(payload).subscribe({
        next: (creada) => {
          const recursoId = this.form.recursoId.trim();
          if (recursoId) {
            this.recursoService.cambiarEstado(recursoId, 'OCUPADO').subscribe({
              next: (r) => {
                const idx = this.recursos.findIndex(x => x.id === recursoId);
                if (idx !== -1) this.recursos[idx] = r;
              },
              error: () => {}
            });
          }
          this.guardando         = false;
          this.nuevaSubasignacion = creada;   // guarda la respuesta con el ID real
          this.modoModal          = 'creado'; // muestra pantalla de enlace de tracking
          this.cargarDatos();
          this.refrescar();
        },
        error: (err) => {
          this.guardando = false;
          const msg = err?.error?.message || err?.error?.error || 'Error al guardar.';
          this.mostrarToast(msg, 'error');
        }
      });
    }

    if (this.modoModal === 'editar' && this.seleccionado?.id) {
      this.subasignacionService.actualizar(this.seleccionado.id, payload).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.cargarDatos();
          this.mostrarToast('Asignación actualizada con éxito.');
        },
        error: (err) => {
          this.guardando = false;
          const msg = err?.error?.message || err?.error?.error || 'Error al actualizar.';
          this.mostrarToast(msg, 'error');
        }
      });
    }
  }

  cambiarEstado(s: Subasignacion, estado: string): void {
    if (!s.id) return;
    this.subasignacionService.cambiarEstado(s.id, estado).subscribe({
      next: (actualizada) => {
        const idx = this.subasignaciones.findIndex(x => x.id === s.id);
        if (idx !== -1) this.subasignaciones[idx] = actualizada;
        this.aplicarFiltros();
        this.mostrarToast(`Estado cambiado a ${this.formatear(estado)}.`);
        if (this.seleccionado?.id === s.id) this.seleccionado = actualizada;
      },
      error: () => this.mostrarToast('No se pudo cambiar el estado.', 'error')
    });
  }

  // ── Exportar (PDF / Excel con la plantilla común) ───────────────────────

  readonly puedeExportar = this.branding.puedeExportar();
  exportando = false;

  /** Mismas filas filtradas que la tabla, con nombres ya resueltos. */
  private filasReporte(): SubasignacionReporteFila[] {
    return this.subasignacionesFiltradas.map(s => ({
      recurso: this.obtenerIdentificadorRecurso(s.resourceId),
      entidadDestino: this.obtenerRazonSocialEntidad(s.targetEntityId),
      turno: this.formatear(s.shift),
      estado: this.formatear(s.status),
      inicio: s.startDate,
      fin: s.endDate,
      asignadoPor: s.assignedBy,
      observaciones: s.notes
    }));
  }

  private filtrosReporte(): SubasignacionReporteFiltros {
    return { estado: this.filtroActivo === 'TODOS' ? 'Todos' : this.formatear(this.filtroActivo) };
  }

  exportarExcel(): Promise<void> {
    return this.exportar(() => this.subasignacionExcel.generarExcel(this.filasReporte(), this.filtrosReporte()), 'Excel');
  }

  exportarPdf(): Promise<void> {
    return this.exportar(() => this.subasignacionPdf.generarPdf(this.filasReporte(), this.filtrosReporte()), 'PDF');
  }

  private async exportar(generar: () => Promise<void>, formato: string): Promise<void> {
    if (this.exportando || !this.subasignacionesFiltradas.length) return;
    this.exportando = true;
    try {
      await generar();
      this.mostrarToast(`${formato} exportado con éxito.`);
    } catch {
      this.mostrarToast(`No se pudo generar el ${formato}.`, 'error');
    } finally {
      this.exportando = false;
    }
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────

  eliminar(s: Subasignacion): void {
    if (!s.id) return;
    if (!confirm('¿Eliminar esta asignación? Esta acción no se puede deshacer.')) return;
    this.subasignacionService.eliminar(s.id).subscribe({
      next: () => {
        this.subasignaciones = this.subasignaciones.filter(x => x.id !== s.id);
        this.aplicarFiltros();
        this.mostrarToast('Asignación eliminada.');
        if (this.seleccionado?.id === s.id) this.cerrarModal();
      },
      error: () => this.mostrarToast('Error al eliminar.', 'error')
    });
  }

  // ── Validación ───────────────────────────────────────────────────────────

  private revisarCampo(campo: CampoForm): string {
    switch (campo) {
      case 'recursoId': {
        if (!this.form.recursoId.trim()) return 'Debes seleccionar un recurso.';
        const yaAsignado = this.subasignaciones.some(s =>
          this.normId(s.resourceId) === this.form.recursoId.trim() &&
          s.status === 'ACTIVA' &&
          s.id !== this.seleccionado?.id
        );
        if (yaAsignado) return 'Este recurso ya tiene una subasignación activa.';
        return '';
      }
      case 'entidadDestinoId':
        return !this.form.entidadDestinoId.trim() ? 'Debes seleccionar la entidad destino.' : '';
      case 'turno':
        return !this.form.turno ? 'Selecciona un turno.' : '';
      case 'fechaInicio': {
        if (!this.form.fechaInicio) return 'La fecha de inicio es obligatoria.';
        const inicio = new Date(this.form.fechaInicio);
        if (isNaN(inicio.getTime())) return 'Fecha de inicio inválida.';
        if (this.modoModal === 'crear') {
          const ahora = new Date(); ahora.setSeconds(0, 0);
          if (inicio < ahora) return 'La fecha de inicio no puede ser anterior al momento actual.';
        }
        return '';
      }
      case 'fechaFin': {
        if (!this.form.fechaFin) return 'La fecha fin es obligatoria.';
        const fin = new Date(this.form.fechaFin);
        if (isNaN(fin.getTime())) return 'Fecha fin inválida.';
        if (this.form.fechaInicio) {
          const inicio = new Date(this.form.fechaInicio);
          if (fin <= inicio) return 'La fecha fin debe ser posterior a la de inicio.';
          if ((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24) > 30)
            return 'La asignación no puede durar más de 30 días.';
        }
        return '';
      }
      case 'asignadoPor': {
        const v = this.form.asignadoPor.trim();
        if (!v) return 'Indica quién asigna el patrullaje.';
        if (v.length < 2) return 'Mínimo 2 caracteres.';
        if (v.length > 100) return 'Máximo 100 caracteres.';
        if (!REGEX_ASIGNADO_POR.test(v)) return 'Solo letras, números, espacios, guion y guion bajo.';
        return '';
      }
    }
  }

  validarCampo(campo: CampoForm): void {
    const msg = this.revisarCampo(campo);
    if (msg) this.errores[campo] = msg;
    else delete this.errores[campo];
  }

  tieneError(campo: CampoForm): boolean { return !!this.errores[campo]; }

  get formValido(): boolean {
    const campos: CampoForm[] = ['recursoId', 'entidadDestinoId', 'turno', 'fechaInicio', 'fechaFin', 'asignadoPor'];
    return campos.every(c => !this.revisarCampo(c));
  }

  validarFormulario(): boolean {
    const campos: CampoForm[] = ['recursoId', 'entidadDestinoId', 'turno', 'fechaInicio', 'fechaFin', 'asignadoPor'];
    campos.forEach(c => this.validarCampo(c));
    const primer = campos.find(c => this.errores[c]);
    if (primer) { this.civicToast.error(this.errores[primer] ?? 'Revise los datos.'); return false; }
    return true;
  }

  // ── Helpers de presentación ──────────────────────────────────────────────

  obtenerRecurso(recursoId: string | null | undefined): RecursoOperativo | undefined {
    const id = this.normId(recursoId);
    return this.recursos.find(r => r.id === id);
  }

  obtenerIdentificadorRecurso(recursoId: string | null | undefined): string {
    return this.obtenerRecurso(recursoId)?.identificador || recursoId || '-';
  }

  obtenerEntidad(entidadId: string | null | undefined): Entidad | undefined {
    const id = this.normId(entidadId);
    return this.entidades.find(e => this.normId(e.id) === id);
  }

  obtenerRazonSocialEntidad(entidadId: string | null | undefined): string {
    return this.obtenerEntidad(entidadId)?.businessName || entidadId || '-';
  }

  formatear(valor: string | null | undefined): string {
    if (!valor) return '-';
    return valor.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatearFecha(fecha: string | null | undefined): string {
    if (!fecha) return '-';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return fecha;
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  obtenerClaseEstado(estado: string | null | undefined): string {
    switch (estado) {
      case 'ACTIVA':     return 'civic-badge civic-badge--success';
      case 'FINALIZADA': return 'civic-badge civic-badge--primary';
      case 'CANCELADA':  return 'civic-badge civic-badge--alert';
      default:           return 'civic-badge civic-badge--muted';
    }
  }

  obtenerClaseTurno(turno: string | null | undefined): string {
    switch (turno) {
      case 'T_DIA':   return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'T_TARDE': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'T_NOCHE': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  }

  normId(valor: unknown): string {
    if (!valor) return '';
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'object') {
      const o = valor as Record<string, unknown>;
      if (typeof o['$oid'] === 'string') return o['$oid'];
      if (typeof o['id']   === 'string') return o['id'];
    }
    return String(valor);
  }

  private isoADatetimeLocal(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private datetimeLocalAIso(dt: string | null | undefined): string | null {
    if (!dt) return null;
    const d = new Date(dt);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // ── Tracking en tiempo real ──────────────────────────────────────────────

  private iniciarTrackingParaSubasignacion(id: string): void {
    if (this.trackingActiveId === id && this.trackingPoll$) return;

    this.detenerTrackingStream();
    this.trackingActiveId  = id;
    this.trackingCargando  = true;
    this.trackingHistorial = [];
    this.trackingLatest    = null;
    this.refrescar();

    // 1. Carga inicial: historial + última posición en paralelo
    forkJoin({
      hist:   this.trackingService.getHistory(id).pipe(catchError(() => of([] as LocationHistory[]))),
      latest: this.trackingService.getLatest(id).pipe(catchError(() => of(null as LocationHistory | null)))
    }).subscribe(({ hist, latest }) => {
      this.ngZone.run(() => {
        this.trackingHistorial = hist ?? [];
        this.trackingLatest    = latest ?? this.trackingHistorial[0] ?? null;
        this.trackingCargando  = false;
        this.refrescar();
      });
    });

    // 2. Polling cada 5s para la posición más reciente
    this.trackingPoll$ = this.trackingService.pollLatest(id, 5000).subscribe({
      next: (pos) => {
        this.ngZone.run(() => {
          this.trackingLatest    = pos;
          // Prepend si es más nueva que la primera del historial
          const yaExiste = this.trackingHistorial[0]?.recordedAt === pos.recordedAt;
          if (!yaExiste) {
            this.trackingHistorial = [pos, ...this.trackingHistorial].slice(0, 50);
          }
          this.refrescar();
        });
      }
    });
  }

  private detenerTrackingStream(): void {
    this.trackingPoll$?.unsubscribe();
    this.trackingPoll$    = null;
    this.trackingActiveId = null;
  }

  copiarEnlaceTracking(): void {
    if (!this.seleccionado?.id) return;
    const url = `${window.location.origin}/tracking/${this.seleccionado.id}`;
    navigator.clipboard.writeText(url).then(
      () => this.mostrarToast('Enlace copiado al portapapeles.', 'info'),
      () => this.mostrarToast('No se pudo copiar. Copia manualmente: ' + url, 'error')
    );
  }

  copiarEnlaceNueva(): void {
    if (!this.trackingUrlNueva) return;
    navigator.clipboard.writeText(this.trackingUrlNueva).then(
      () => this.mostrarToast('¡Enlace copiado! Envíalo al operario por WhatsApp.', 'info'),
      () => this.mostrarToast('No se pudo copiar. URL: ' + this.trackingUrlNueva, 'error')
    );
  }

  // ── Toast ────────────────────────────────────────────────────────────────

  cerrarToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = null;
  }

  mostrarToast(mensaje: string, tipo: 'exito' | 'error' | 'info' = 'exito'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast      = { mensaje, tipo };
    this.toastTimer = setTimeout(() => { this.toast = null; }, 3500);
  }

  // ── trackBy ──────────────────────────────────────────────────────────────

  trackById(_index: number, item: Subasignacion): string {
    return item.id || String(_index);
  }

  trackByEntidadId(_index: number, e: Entidad): string {
    return e.id || e.ruc || String(_index);
  }

  trackByRecursoId(_index: number, r: RecursoOperativo): string {
    return r.id || r.identificador || String(_index);
  }
}
