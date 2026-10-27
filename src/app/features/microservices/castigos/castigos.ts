import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, firstValueFrom, forkJoin, interval, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import {
  CastigoHistorialEntry,
  CastigoResponse,
  NIVEL_CASTIGO,
  UsuarioAdmin,
  etiquetaNivelCastigo,
  nombreCompletoUsuario, AplicarCastigoRequest
} from '../../../core/models/usuario.model';
import { UsuarioAdminService } from '../../../core/services/usuario-admin';
import { IncidentService as EmergenciaService } from '../../../core/services/incident';
import { AlertaVinculadaDTO, IncidenteConEntidades } from '../../../core/models/incident';
import { AuthService, ROLES } from '../../../core/auth/auth.service';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';
import { CivicToastService } from '../../../shared/services/civic-toast.service';

type SubSeccionSanciones = 'vigentes' | 'auditoria';

interface ConfirmacionModal {
  titulo: string;
  mensaje: string;
  confirmarLabel: string;
  /** Estilo del CTA: ok = restaurar (verde), danger = alerta, primary = navy. */
  variante?: 'primary' | 'ok' | 'danger';
  accion: () => void | Promise<void>;
}

interface NivelEscalera {
  codigo: number;
  titulo: string;
  descripcion: string;
  consecuencia: string;
}

interface HistorialDiaGrupo {
  clave: string;
  etiqueta: string;
  entradas: CastigoHistorialEntry[];
}

import { CastigosReportes } from './castigos-reportes';

@Component({
  selector: 'app-castigos',
  standalone: true,
  imports: [CommonModule, FormsModule, CastigosReportes],
  templateUrl: './castigos.html',
  styleUrl: './castigos.css'
})
export class Castigos implements OnInit, OnDestroy {

  private static readonly INTERVALO_AUTO_REFRESH_MS = 30_000;

  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly toast = inject(CivicToastService);
  private readonly auth = inject(AuthService);
  /** Castigo manual (sin alerta): solo SUPER_ADMIN. El resto castiga desde la alerta en Emergencias. */
  readonly esSuperAdmin = this.auth.hasRole(ROLES.SUPER_ADMIN);
  /** Levantar: SUPER_ADMIN, o la municipalidad sobre castigos originados en ella (lo valida el backend). */
  readonly puedeLevantarCastigos = this.auth.hasRole(ROLES.SUPER_ADMIN, ROLES.MUNICIPALIDAD_ADMIN);
  /** El personal castiga siempre por una alerta concreta: el backend valida que el incidente sea de su alcance. */
  readonly castigaPorAlerta = !this.esSuperAdmin
    && this.auth.hasRole(ROLES.MUNICIPALIDAD_ADMIN, ROLES.ENTIDAD_ADMIN, ROLES.OPERADOR_ENTIDAD);
  private readonly emergenciaService = inject(EmergenciaService);

  modalAlertaAbierto = false;
  cargandoAlertas = false;
  errorAlerta = '';
  incidentesConAlertas: IncidenteConEntidades[] = [];
  incidenteElegido: IncidenteConEntidades | null = null;
  alertasDelIncidente: AlertaVinculadaDTO[] = [];
  alertaElegida: AlertaVinculadaDTO | null = null;
  motivoAlerta = '';

  private autoRefreshSub?: Subscription;

  subSeccionSanciones: SubSeccionSanciones = 'vigentes';

  usuarios: UsuarioAdmin[] = [];
  castigosPorUsuario: Record<string, CastigoResponse> = {};
  sancionesActivas: UsuarioAdmin[] = [];
  sancionesActivasFiltradas: UsuarioAdmin[] = [];
  /** Vigentes agrupadas por peldaño de la escalera, del más grave al más leve. */
  gruposVigentes: { nivel: NivelEscalera; usuarios: UsuarioAdmin[] }[] = [];
  historial: CastigoHistorialEntry[] = [];
  historialFiltrado: CastigoHistorialEntry[] = [];
  /** Últimos movimientos por ciudadano: la hoja que sale de cada carpeta. */
  historialPorUsuario: Record<string, CastigoHistorialEntry[]> = {};
  ciudadanosParaSeleccion: UsuarioAdmin[] = [];
  ciudadanosVisibles: UsuarioAdmin[] = [];
  pickerMostrarHasta = 8;
  readonly pickerPageSize = 8;
  readonly pickerSkeletons = [1, 2, 3, 4, 5];

  cargando = false;
  actualizandoEnFondo = false;
  guardando = false;
  errorCarga = '';

  busqueda = '';
  busquedaSeleccionUsuario = '';
  filtroNivel: 'TODOS' | '0' | '1' | '2' | '3' = 'TODOS';
  filtroAccion: 'TODOS' | 'APLICAR' | 'LEVANTAR' | 'ACTUALIZAR' = 'TODOS';

  modalSeleccionUsuarioAbierto = false;
  modalCastigoAbierto = false;
  modalConfirmacion: ConfirmacionModal | null = null;
  historialModalAbierto = false;

  usuarioSeleccionado: UsuarioAdmin | null = null;
  castigoActual: CastigoResponse | null = null;
  historialUsuario: CastigoHistorialEntry[] = [];
  avisoHistorialModal = '';
  cargandoHistorial = false;

  formMotivo = '';
  formHorasBloqueo = 24;
  errorModal = '';
  mensajeExito = '';
  /** Comprobante tras aplicar: reemplaza el formulario hasta cerrar o ver el historial. */
  sancionAplicada: { nivel: number; etiqueta: string; fin: string | null; motivo: string; horas: number | null } | null = null;

  readonly nivelesEscalera: NivelEscalera[] = [
    { codigo: 1, titulo: 'Aviso', descripcion: 'Primera falta', consecuencia: 'Conserva acceso a la app' },
    { codigo: 2, titulo: 'Bloqueo temporal', descripcion: 'Segunda falta', consecuencia: 'Sin acceso hasta vencimiento' },
    { codigo: 3, titulo: 'Bloqueo permanente', descripcion: 'Tercera falta', consecuencia: 'Acceso revocado' }
  ];

  readonly horasPresets = [
    { horas: 24, etiqueta: '24 h' },
    { horas: 48, etiqueta: '48 h' },
    { horas: 72, etiqueta: '72 h' },
    { horas: 168, etiqueta: '7 días' }
  ];

  /** Motivos que el operador escribe a menudo; un clic los deja en el campo para completarlos. */
  readonly motivosFrecuentes = [
    'Reporte de emergencia falso',
    'Uso indebido del botón de pánico',
    'Insultos o amenazas al operador',
    'Reportes duplicados de un mismo hecho'
  ];

  usarMotivo(texto: string): void {
    this.formMotivo = this.formMotivo.trim() ? `${this.formMotivo.trim()} ${texto}.` : `${texto}. `;
  }

  readonly filtrosNivel = [
    { label: 'Todos', value: 'TODOS' as const },
    { label: 'Sin sanción', value: '0' as const },
    { label: 'Aviso', value: '1' as const },
    { label: 'Bloqueo temporal', value: '2' as const },
    { label: 'Bloqueo permanente', value: '3' as const }
  ];

  readonly filtrosAccion = [
    { label: 'Todas', value: 'TODOS' as const },
    { label: 'Sanción aplicada', value: 'APLICAR' as const },
    { label: 'Sanción levantada', value: 'LEVANTAR' as const },
    { label: 'Sanción actualizada', value: 'ACTUALIZAR' as const }
  ];

  ngOnInit(): void {
    this.cargarDatos();
    this.iniciarAutoRefresh();
  }

  ngOnDestroy(): void {
    this.detenerAutoRefresh();
    this.guardando = false;
    this.bloquearScroll(false);
  }

  cargarDatos(): void {
    this.sincronizarDesdeServidor({ silencioso: false });
  }

  estaActualizando(): boolean {
    return this.cargando || this.actualizandoEnFondo;
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (this.document.visibilityState === 'visible' && !this.debePausarAutoRefresh()) {
      this.sincronizarDesdeServidor({ silencioso: true });
    }
  }

  cambiarSubSeccionSanciones(sub: SubSeccionSanciones): void {
    this.subSeccionSanciones = sub;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroNivel = 'TODOS';
    this.filtroAccion = 'TODOS';
    this.aplicarFiltros();
  }

  hayFiltrosActivos(): boolean {
    return !!this.busqueda.trim()
      || this.filtroNivel !== 'TODOS'
      || (this.subSeccionSanciones === 'auditoria' && this.filtroAccion !== 'TODOS');
  }

  aplicarFiltros(): void {
    const q = this.busqueda.trim().toLowerCase();
    const ciudadanos = this.usuarios.filter(u => this.esCiudadano(u));

    this.sancionesActivas = ciudadanos.filter(u => this.nivelUsuario(u) > 0);
    this.sancionesActivasFiltradas = this.sancionesActivas.filter(u => {
      if (q && !this.coincideBusquedaUsuario(u, q)) return false;
      if (this.filtroNivel !== 'TODOS' && this.nivelUsuario(u) !== Number(this.filtroNivel)) return false;
      return true;
    });
    this.gruposVigentes = [...this.nivelesEscalera].reverse()
      .map(nivel => ({ nivel, usuarios: this.sancionesActivasFiltradas.filter(u => this.nivelUsuario(u) === nivel.codigo) }))
      .filter(g => g.usuarios.length > 0);
    this.historialPorUsuario = {};
    for (const h of [...this.historial].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))) {
      (this.historialPorUsuario[h.userId] ??= []).push(h);
    }

    this.historialFiltrado = this.historial.filter(h => {
      if (this.filtroAccion !== 'TODOS' && h.action !== this.filtroAccion) return false;
      if (this.filtroNivel !== 'TODOS' && h.newLevel !== Number(this.filtroNivel)) return false;
      if (!q) return true;
      return (
        h.dni.includes(q) ||
        h.fullName.toLowerCase().includes(q) ||
        (h.reason ?? '').toLowerCase().includes(q) ||
        h.action.toLowerCase().includes(q)
      );
    });

    this.aplicarFiltroSeleccionUsuario();
  }

  aplicarFiltroSeleccionUsuario(): void {
    const q = this.busquedaSeleccionUsuario.trim().toLowerCase();
    const ciudadanos = this.usuarios.filter(u => this.esCiudadano(u));
    this.ciudadanosParaSeleccion = q
      ? ciudadanos.filter(u => this.coincideBusquedaUsuario(u, q))
      : ciudadanos;
    this.pickerMostrarHasta = this.pickerPageSize;
    this.actualizarCiudadanosVisibles();
  }

  cargarMasCiudadanos(): void {
    this.pickerMostrarHasta = Math.min(
      this.pickerMostrarHasta + this.pickerPageSize,
      this.ciudadanosParaSeleccion.length
    );
    this.actualizarCiudadanosVisibles();
    this.refrescarVista();
  }

  hayMasCiudadanos(): boolean {
    return this.pickerMostrarHasta < this.ciudadanosParaSeleccion.length;
  }

  restantesCiudadanos(): number {
    return Math.max(0, this.ciudadanosParaSeleccion.length - this.pickerMostrarHasta);
  }

  mostrarSkeletonPicker(): boolean {
    return this.cargando && this.ciudadanosParaSeleccion.length === 0 && !this.busquedaSeleccionUsuario.trim();
  }

  private actualizarCiudadanosVisibles(): void {
    this.ciudadanosVisibles = this.ciudadanosParaSeleccion.slice(0, this.pickerMostrarHasta);
  }

  esCiudadano(u: UsuarioAdmin): boolean {
    return !u.entidadId;
  }

  conteoVigentes(): number {
    return this.sancionesActivas.length;
  }

  conteoNivel(nivel: number): number {
    return this.sancionesActivas.filter(u => this.nivelUsuario(u) === nivel).length;
  }

  conteoBloqueados(): number {
    return this.sancionesActivas.filter(u => !this.accesoPermitidoUsuario(u)).length;
  }

  abrirNuevoCastigo(): void {
    if (this.castigaPorAlerta) {
      this.abrirCastigoPorAlerta();
      return;
    }
    this.busquedaSeleccionUsuario = '';
    this.pickerMostrarHasta = this.pickerPageSize;
    this.aplicarFiltroSeleccionUsuario();
    this.modalSeleccionUsuarioAbierto = true;
    this.bloquearScroll(true);
  }

  cerrarSeleccionUsuario(): void {
    this.modalSeleccionUsuarioAbierto = false;
    if (!this.modalCastigoAbierto && !this.modalConfirmacion) {
      this.bloquearScroll(false);
    }
    this.refrescarVista();
  }

  seleccionarUsuarioParaCastigo(usuario: UsuarioAdmin): void {
    this.modalSeleccionUsuarioAbierto = false;
    this.abrirModalCastigo(usuario);
  }

  abrirModalCastigo(usuario: UsuarioAdmin): void {
    this.usuarioSeleccionado = usuario;
    this.modalCastigoAbierto = true;
    this.historialModalAbierto = false;
    this.castigoActual = this.castigoDe(usuario);
    // Se muestra al instante lo ya cargado; la API lo reemplaza al responder.
    this.historialUsuario = [...(this.historialPorUsuario[usuario.id] ?? [])];
    this.cargandoHistorial = true;
    this.formMotivo = '';
    this.formHorasBloqueo = 24;
    this.errorModal = '';
    this.mensajeExito = '';
    this.sancionAplicada = null;
    this.avisoHistorialModal = '';
    this.guardando = false;
    this.bloquearScroll(true);

    this.usuarioAdminService.obtenerCastigo(usuario.id).pipe(
      catchError(() => of(null))
    ).subscribe(castigo => {
      if (castigo) {
        this.castigoActual = castigo;
        this.castigosPorUsuario[usuario.id] = castigo;
      }
      this.refrescarVista();
    });

    this.usuarioAdminService.listarHistorialUsuario(usuario.id).pipe(
      catchError(() => {
        this.avisoHistorialModal = 'No se pudo cargar el historial.';
        return of([] as CastigoHistorialEntry[]);
      })
    ).subscribe(historial => {
      if (historial.length || !this.historialUsuario.length) this.historialUsuario = historial;
      this.cargandoHistorial = false;
      this.refrescarVista();
    });
  }

  confirmarQuitarSancion(usuario: UsuarioAdmin): void {
    if (this.guardando || !this.tieneSancionActiva(usuario)) return;
    this.abrirConfirmacion({
      titulo: 'Quitar sanción',
      mensaje: `Se eliminará «${this.etiquetaNivel(this.nivelUsuario(usuario))}» de ${this.nombreUsuario(usuario)}. Volverá a poder usar la app con normalidad.`,
      confirmarLabel: 'Quitar sanción',
      variante: 'ok',
      accion: () => this.levantarCastigoDeUsuario(usuario)
    });
  }

  abrirConfirmacion(config: ConfirmacionModal): void {
    this.modalConfirmacion = config;
    this.bloquearScroll(true);
  }

  cerrarConfirmacion(): void {
    this.modalConfirmacion = null;
    if (!this.modalCastigoAbierto && !this.modalSeleccionUsuarioAbierto) {
      this.bloquearScroll(false);
    }
  }

  async confirmarAccion(): Promise<void> {
    const accion = this.modalConfirmacion?.accion;
    if (!accion) return;
    this.cerrarConfirmacion();
    await accion();
  }

  /** Desde el historial general: abre la hoja de expediente del ciudadano. */
  verExpediente(entry: CastigoHistorialEntry): void {
    const usuario = this.usuarios.find(u => u.id === entry.userId || u.dni === entry.dni);
    if (!usuario) {
      this.toast.info(`No se encontró al ciudadano DNI ${entry.dni} en el directorio actual.`);
      return;
    }
    this.abrirHistorialCiudadano(usuario);
  }

  /** Comprobante → historial del mismo ciudadano, ya actualizado. */
  verHistorialTrasAplicar(): void {
    this.sancionAplicada = null;
    this.historialModalAbierto = true;
    const id = this.usuarioSeleccionado?.id;
    if (!id) return;
    this.usuarioAdminService.listarHistorialUsuario(id).pipe(catchError(() => of(null))).subscribe(h => {
      if (h) this.historialUsuario = h;
      this.refrescarVista();
    });
  }

  gestionarDesdeHistorial(entry: CastigoHistorialEntry): void {
    const usuario = this.usuarios.find(u => u.id === entry.userId || u.dni === entry.dni);
    if (!usuario) {
      this.toast.info(`No se encontró al ciudadano DNI ${entry.dni} en el directorio actual.`);
      this.refrescarVista();
      return;
    }
    if (this.puedeEscalarDesde(usuario)) {
      this.abrirModalCastigo(usuario);
      return;
    }
    if (this.tieneSancionActiva(usuario)) {
      this.confirmarQuitarSancion(usuario);
      return;
    }
    this.toast.info('Este ciudadano no tiene sanción activa en este momento.');
    this.refrescarVista();
  }

  /** La hoja de la carpeta abre el expediente con el historial desplegado. */
  abrirHistorialCiudadano(usuario: UsuarioAdmin): void {
    this.abrirModalCastigo(usuario);
    this.historialModalAbierto = true;
  }

  cerrarModalCastigo(): void {
    this.guardando = false;
    this.modalCastigoAbierto = false;
    this.usuarioSeleccionado = null;
    this.castigoActual = null;
    if (!this.modalSeleccionUsuarioAbierto && !this.modalConfirmacion) {
      this.bloquearScroll(false);
    }
    this.refrescarVista();
  }

  abrirCastigoPorAlerta(): void {
    this.modalAlertaAbierto = true;
    this.volverAIncidentes();
    this.cargandoAlertas = true;
    this.bloquearScroll(true);
    this.emergenciaService.listar().pipe(catchError(() => {
      this.errorAlerta = 'No se pudieron cargar las emergencias.';
      return of([] as IncidenteConEntidades[]);
    })).subscribe(lista => {
      this.incidentesConAlertas = lista
        .filter(i => i.alertIds?.length)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      this.cargandoAlertas = false;
      this.refrescarVista();
    });
  }

  elegirIncidente(inc: IncidenteConEntidades): void {
    this.incidenteElegido = inc;
    this.alertasDelIncidente = [];
    this.alertaElegida = null;
    this.errorAlerta = '';
    this.cargandoAlertas = true;
    this.emergenciaService.obtenerAlertasVinculadas(inc.id).pipe(catchError(() => {
      this.errorAlerta = 'No se pudieron cargar las alertas de esta emergencia.';
      return of([] as AlertaVinculadaDTO[]);
    })).subscribe(alertas => {
      // Solo alertas con ciudadano emisor: sin él no hay a quién sancionar.
      this.alertasDelIncidente = alertas.filter(a => a.reporter);
      this.cargandoAlertas = false;
      this.refrescarVista();
    });
  }

  volverAIncidentes(): void {
    this.incidenteElegido = null;
    this.alertasDelIncidente = [];
    this.alertaElegida = null;
    this.motivoAlerta = '';
    this.errorAlerta = '';
  }

  atras(): void {
    if (this.alertaElegida) {
      this.alertaElegida = null;
      this.errorAlerta = '';
    } else {
      this.volverAIncidentes();
    }
  }

  cerrarCastigoPorAlerta(): void {
    if (this.guardando) return;
    this.modalAlertaAbierto = false;
    this.volverAIncidentes();
    this.bloquearScroll(false);
    this.refrescarVista();
  }

  confirmarCastigoPorAlerta(): void {
    const inc = this.incidenteElegido;
    const alerta = this.alertaElegida;
    const motivo = this.motivoAlerta.trim();
    if (!inc || !alerta || this.guardando) return;
    if (motivo.length < 10) {
      this.errorAlerta = 'El motivo debe tener al menos 10 caracteres.';
      return;
    }
    this.guardando = true;
    this.errorAlerta = '';
    this.usuarioAdminService.castigarAlerta(inc.id, alerta.alertId, motivo).subscribe({
      next: castigo => {
        this.guardando = false;
        this.toast.success(`Castigo aplicado: ${castigo.nivelEtiqueta}.`);
        this.cerrarCastigoPorAlerta();
        this.cargarDatos();
      },
      error: (err: unknown) => {
        this.guardando = false;
        this.errorAlerta = err instanceof Error ? err.message : 'No se pudo aplicar el castigo.';
        this.refrescarVista();
      }
    });
  }

  /** INCENDIO_FORESTAL → "Incendio forestal". */
  etiquetaTipo(tipo?: string | null): string {
    const t = (tipo ?? '').replace(/_/g, ' ').toLowerCase();
    return t ? t[0].toUpperCase() + t.slice(1) : 'Emergencia';
  }

  nombreAlertante(a: AlertaVinculadaDTO): string {
    const r = a.reporter;
    return r ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Ciudadano' : 'Ciudadano';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalAlertaAbierto) this.cerrarCastigoPorAlerta();
    else if (this.modalConfirmacion) this.cerrarConfirmacion();
    else if (this.modalCastigoAbierto) this.cerrarModalCastigo();
    else if (this.modalSeleccionUsuarioAbierto) this.cerrarSeleccionUsuario();
  }

  seleccionarHorasPreset(horas: number): void {
    this.formHorasBloqueo = horas;
  }

  puedeConfirmarEscalar(): boolean {
    return this.formMotivo.trim().length >= 10;
  }

  textoBotonConfirmar(): string {
    const proximo = this.nivelProximoInfo();
    if (proximo) return `Confirmar ${proximo.titulo.toLowerCase()}`;
    return 'Confirmar';
  }

  ejecutarAccionModal(): void {
    if (this.guardando) return;
    if (!this.puedeConfirmarEscalar()) {
      this.errorModal = this.formMotivo.trim()
        ? 'El motivo debe tener al menos 10 caracteres.'
        : 'Indique el motivo del castigo.';
      this.refrescarVista();
      return;
    }
    void this.escalarCastigo();
  }

  toggleHistorialModal(): void {
    this.historialModalAbierto = !this.historialModalAbierto;
  }

  nivelProximoInfo(): NivelEscalera | null {
    const codigo = this.castigoActual?.proximoNivel;
    if (!codigo) return null;
    return this.nivelesEscalera.find(n => n.codigo === codigo) ?? null;
  }

  fechaFinBloqueoEstimada(): string {
    const fin = new Date();
    fin.setHours(fin.getHours() + (this.formHorasBloqueo || 24));
    return this.formatearFecha(fin.toISOString());
  }

  async escalarCastigo(): Promise<void> {
    if (!this.usuarioSeleccionado || !this.formMotivo.trim()) return;
    const body: AplicarCastigoRequest = { reason: this.formMotivo.trim() };
    if (this.castigoActual?.proximoNivel === 2) {
      body.blockHours = this.formHorasBloqueo;
    }
    await this.ejecutarAccionCastigo(
      this.usuarioAdminService.aplicarCastigo(this.usuarioSeleccionado.id, body),
      (castigo) => {
        this.sancionAplicada = {
          nivel: castigo.nivelCastigo,
          etiqueta: castigo.nivelEtiqueta,
          fin: castigo.fechaFinBloqueoTemporal ?? null,
          motivo: body.reason,
          horas: body.blockHours ?? null
        };
        this.castigoActual = castigo;
        this.formMotivo = '';
        this.mensajeExito = `Sanción aplicada: ${castigo.nivelEtiqueta}.`;
        this.toast.success(this.mensajeExito);
        this.refrescarTrasAccion(castigo);
      }
    );
  }

  async levantarCastigoDeUsuario(usuario: UsuarioAdmin): Promise<void> {
    await this.ejecutarAccionCastigo(
      this.usuarioAdminService.levantarCastigo(usuario.id),
      () => {
        this.toast.success('Sanción quitada.');
        if (this.modalCastigoAbierto && this.usuarioSeleccionado?.id === usuario.id) {
          this.cerrarModalCastigo();
        }
        this.refrescarTrasAccion();
      }
    );
  }

  nivelUsuario(u: UsuarioAdmin): number {
    return this.castigoDe(u)?.nivelCastigo ?? 0;
  }

  castigoDe(u: UsuarioAdmin): CastigoResponse | null {
    return this.castigosPorUsuario[u.id] ?? null;
  }

  motivoCastigo(u: UsuarioAdmin): string | null {
    return this.castigoDe(u)?.motivoUltimoCastigo ?? null;
  }

  fechaFinCastigo(u: UsuarioAdmin): string | null {
    return this.castigoDe(u)?.fechaFinBloqueoTemporal ?? null;
  }

  etiquetaNivel(nivel: number): string {
    return etiquetaNivelCastigo(nivel);
  }

  infoNivel(nivel: number): { titulo: string; descripcion: string; consecuencia: string } {
    const found = this.nivelesEscalera.find(n => n.codigo === nivel);
    if (found) return found;
    return {
      titulo: etiquetaNivelCastigo(nivel),
      descripcion: 'Sin sanción activa',
      consecuencia: 'Acceso normal a la aplicación'
    };
  }

  resumenNivel(u: UsuarioAdmin): string {
    const info = this.infoNivel(this.nivelUsuario(u));
    return `${info.descripcion}. ${info.consecuencia}.`;
  }

  textoAcceso(u: UsuarioAdmin): { titulo: string; detalle: string } {
    if (this.accesoPermitidoUsuario(u)) {
      return {
        titulo: 'Puede usar la aplicación',
        detalle: 'El ciudadano conserva acceso a la app'
      };
    }
    return {
      titulo: 'Acceso bloqueado',
      detalle: 'No puede iniciar sesión ni usar la app'
    };
  }

  nombreUsuario(u: UsuarioAdmin): string {
    return nombreCompletoUsuario(u);
  }

  fotosRotas = new Set<string>();
  motivosExpandidos = new Set<string>();

  tieneFoto(u: UsuarioAdmin): boolean {
    return !!u.fotoPerfilUrl && !this.fotosRotas.has(u.id);
  }

  onFotoError(id: string): void {
    this.fotosRotas.add(id);
    this.cdr.markForCheck();
  }

  motivoLargo(motivo: string): boolean {
    const t = (motivo ?? '').trim();
    if (!t) return false;
    if (t.length > 72) return true;
    return t.split(/\s+/).some(token => token.length > 28);
  }

  isMotivoExpandido(id: string): boolean {
    return this.motivosExpandidos.has(id);
  }

  toggleMotivo(id: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.motivosExpandidos.has(id)) this.motivosExpandidos.delete(id);
    else this.motivosExpandidos.add(id);
    this.refrescarVista();
  }

  iniciales(nombre?: string | null): string {
    return (nombre ?? '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  }

  inicialesUsuario(u: UsuarioAdmin): string {
    const nombre = this.nombreUsuario(u);
    return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  }

  claseBadgeNivel(nivel: number): string {
    return `civic-chip civic-chip--sancion civic-chip--sancion-${Math.min(Math.max(nivel, 0), 3)}`;
  }

  claseBadgeAccion(accion: string): string {
    switch (accion) {
      case 'APLICAR': return 'civic-chip civic-chip--accion civic-chip--accion-aplicar';
      case 'LEVANTAR': return 'civic-chip civic-chip--accion civic-chip--accion-levantar';
      case 'ACTUALIZAR': return 'civic-chip civic-chip--accion civic-chip--accion-actualizar';
      default: return 'civic-chip civic-chip--accion civic-chip--accion-default';
    }
  }

  accionEtiqueta(accion: string): string {
    switch (accion) {
      case 'APLICAR': return 'Aplicada';
      case 'LEVANTAR': return 'Levantada';
      case 'ACTUALIZAR': return 'Actualizada';
      default: return accion;
    }
  }

  /** Partes de fecha para el sello de cada movimiento del expediente. */
  parteFecha(valor: string, parte: 'dia' | 'mes' | 'hora'): string {
    const opciones: Record<typeof parte, Intl.DateTimeFormatOptions> = {
      dia: { day: '2-digit' },
      mes: { month: 'short', year: 'numeric' },
      hora: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    };
    try {
      return new Intl.DateTimeFormat('es-PE', opciones[parte]).format(new Date(valor)).replace('.', '');
    } catch {
      return '';
    }
  }

  contarAccion(accion: string): number {
    return this.historialUsuario.filter(h => h.action === accion).length;
  }

  accionDetalle(accion: string): string {
    switch (accion) {
      case 'APLICAR': return 'Se impuso una sanción';
      case 'LEVANTAR': return 'Se retiró la sanción';
      case 'ACTUALIZAR': return 'Se modificó el nivel';
      default: return '';
    }
  }

  historialPorDia(): HistorialDiaGrupo[] {
    const grupos = new Map<string, HistorialDiaGrupo>();
    for (const entry of this.historialFiltrado) {
      const d = entry.recordedAt ? new Date(entry.recordedAt) : null;
      const clave = d && !Number.isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : 'sin-fecha';
      let grupo = grupos.get(clave);
      if (!grupo) {
        grupo = { clave, etiqueta: this.etiquetaGrupoDia(d), entradas: [] };
        grupos.set(clave, grupo);
      }
      grupo.entradas.push(entry);
    }
    return Array.from(grupos.values());
  }

  private etiquetaGrupoDia(d: Date | null): string {
    if (!d || Number.isNaN(d.getTime())) return 'Sin fecha';
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    const mismaFecha = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const corto = new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
    if (mismaFecha(d, hoy)) return `Hoy · ${corto}`;
    if (mismaFecha(d, ayer)) return `Ayer · ${corto}`;
    const semana = new Intl.DateTimeFormat('es-PE', { weekday: 'short' }).format(d);
    return `${semana} · ${corto}`;
  }

  nivelEtiquetaHistorial(nivel: number, fallback?: string): string {
    return fallback?.trim() || this.etiquetaNivel(nivel);
  }

  accesoPermitidoUsuario(u: UsuarioAdmin): boolean {
    return this.castigoDe(u)?.accesoPermitido ?? true;
  }

  nivelEscaleraEstado(codigo: number): 'done' | 'current' | 'pending' {
    const actual = this.castigoActual?.nivelCastigo ?? 0;
    if (codigo < actual) return 'done';
    if (codigo === actual) return 'current';
    if (codigo === actual + 1 && this.castigoActual?.proximoNivel === codigo) return 'pending';
    return codigo <= actual ? 'done' : 'pending';
  }

  puedeEscalar(): boolean {
    if (!this.esSuperAdmin) return false;
    const c = this.castigoActual;
    if (!c?.proximoNivel || this.guardando) return false;
    if (c.nivelCastigo === NIVEL_CASTIGO.BLOQUEO_TEMPORAL && c.bloqueoActivo) return false;
    return true;
  }

  puedeEscalarDesde(u: UsuarioAdmin): boolean {
    if (!this.esSuperAdmin) return false;
    const c = this.castigoDe(u);
    if (!c?.proximoNivel) return false;
    if (c.nivelCastigo === NIVEL_CASTIGO.BLOQUEO_TEMPORAL && c.bloqueoActivo) return false;
    return true;
  }

  tieneSancionActiva(u: UsuarioAdmin): boolean {
    return this.nivelUsuario(u) > 0;
  }

  puedeLevantarDesde(u: UsuarioAdmin): boolean {
    return this.puedeLevantarCastigos && this.tieneSancionActiva(u);
  }

  puedeLevantar(): boolean {
    return this.puedeLevantarCastigos && (this.castigoActual?.nivelCastigo ?? 0) > 0;
  }

  formatearFecha(valor?: string | null): string {
    if (!valor) return '—';
    try {
      // Año completo y 24 h: «17 oct 2026, 14:43» no se confunde con el día.
      return new Intl.DateTimeFormat('es-PE', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).format(new Date(valor)).replace('.', '');
    } catch {
      return valor;
    }
  }

  tiempoRestante(fin: string): string {
    const horas = Math.ceil((new Date(fin).getTime() - Date.now()) / 36e5);
    if (!(horas > 0)) return 'Vence ahora';
    if (horas < 48) return `Quedan ${horas} h`;
    return `Quedan ${Math.round(horas / 24)} días`;
  }

  formatearFechaCompleta(valor?: string | null): string {
    if (!valor) return '—';
    try {
      return new Intl.DateTimeFormat('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).format(new Date(valor));
    } catch {
      return valor;
    }
  }

  resumenTransicion(entry: CastigoHistorialEntry): string {
    return `${entry.previousLevelLabel} → ${entry.newLevelLabel}`;
  }

  claseAccionAuditoria(accion: string): string {
    switch (accion) {
      case 'APLICAR': return 'cas-audit__tag cas-audit__tag--aplicar';
      case 'LEVANTAR': return 'cas-audit__tag cas-audit__tag--levantar';
      case 'ACTUALIZAR': return 'cas-audit__tag cas-audit__tag--actualizar';
      default: return 'cas-audit__tag';
    }
  }

  textoEstadoActual(): string {
    const c = this.castigoActual;
    if (!c) return '';
    const acceso = c.accesoPermitido ? 'Puede usar la app' : 'No puede usar la app';
    return `${c.nivelEtiqueta}. ${acceso}.`;
  }

  textoResultadoAccion(): string {
    const proximo = this.nivelProximoInfo();
    if (!proximo || !this.puedeEscalar()) return '';
    return `Se aplicará «${proximo.titulo}»: ${proximo.consecuencia.toLowerCase()}.`;
  }

  etiquetaSancionCorta(nivel: number): string {
    return this.etiquetaNivel(nivel);
  }

  formatearFechaAuditoria(valor?: string | null): { fecha: string; hora: string } {
    if (!valor) return { fecha: '—', hora: '' };
    try {
      const d = new Date(valor);
      return {
        fecha: new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(d),
        hora: new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
      };
    } catch {
      return { fecha: valor, hora: '' };
    }
  }

  trackByUsuarioId(_: number, u: UsuarioAdmin): string {
    return u.id;
  }

  trackByNivel(_: number, g: { nivel: NivelEscalera }): number {
    return g.nivel.codigo;
  }

  trackByHistorialId(_: number, h: CastigoHistorialEntry): string {
    return h.id;
  }

  private bloquearScroll(bloquear: boolean): void {
    if (bloquear) lockPageScroll(this.document);
    else unlockPageScroll(this.document);
  }

  private async ejecutarAccionCastigo(
    source: Observable<CastigoResponse>,
    onSuccess: (castigo: CastigoResponse) => void
  ): Promise<void> {
    this.ngZone.run(() => {
      this.guardando = true;
      this.errorModal = '';
      this.mensajeExito = '';
      this.refrescarVista();
    });
    try {
      const castigo = await firstValueFrom(source.pipe(timeout(30000)));
      this.ngZone.run(() => {
        onSuccess(castigo);
        this.refrescarVista();
      });
    } catch (err) {
      this.ngZone.run(() => {
        this.errorModal = this.extraerError(err);
        this.toast.error(this.errorModal);
        this.refrescarVista();
      });
    } finally {
      this.ngZone.run(() => {
        this.guardando = false;
        this.refrescarVista();
      });
    }
  }

  advertenciasCastigo(u: UsuarioAdmin): number {
    return this.castigoDe(u)?.advertenciasAcumuladas ?? 0;
  }

  private resolverIdsCastigoACargar(
    usuarios: UsuarioAdmin[],
    historial: CastigoHistorialEntry[]
  ): string[] {
    const ciudadanoIds = usuarios.filter(u => this.esCiudadano(u)).map(u => u.id);
    const historialIds = historial.map(h => h.userId).filter(Boolean);
    const activosPrevios = Object.entries(this.castigosPorUsuario)
      .filter(([, castigo]) => (castigo?.nivelCastigo ?? 0) > 0)
      .map(([id]) => id);

    return [...new Set([...ciudadanoIds, ...historialIds, ...activosPrevios])];
  }

  private refrescarVista(): void {
    this.cdr.markForCheck();
    try { this.cdr.detectChanges(); } catch { /* noop */ }
  }

  private refrescarTrasAccion(castigo?: CastigoResponse): void {
    const id = castigo?.usuarioId ?? this.usuarioSeleccionado?.id;
    if (castigo && id) {
      this.castigoActual = castigo;
      this.castigosPorUsuario[id] = castigo;
    }
    this.sincronizarDesdeServidor({
      silencioso: true,
      historialUsuarioId: id && this.modalCastigoAbierto ? id : undefined
    });
  }

  private iniciarAutoRefresh(): void {
    this.autoRefreshSub = interval(Castigos.INTERVALO_AUTO_REFRESH_MS).subscribe(() => {
      if (this.document.visibilityState !== 'visible' || this.debePausarAutoRefresh()) return;
      this.sincronizarDesdeServidor({ silencioso: true });
    });
  }

  private detenerAutoRefresh(): void {
    this.autoRefreshSub?.unsubscribe();
    this.autoRefreshSub = undefined;
  }

  private debePausarAutoRefresh(): boolean {
    return this.cargando
      || this.guardando
      || this.modalCastigoAbierto
      || this.modalSeleccionUsuarioAbierto
      || !!this.modalConfirmacion;
  }

  private sincronizarDesdeServidor(opts: { silencioso: boolean; historialUsuarioId?: string }): void {
    const { silencioso, historialUsuarioId } = opts;
    const idHistorial = historialUsuarioId
      ?? (this.modalCastigoAbierto ? this.usuarioSeleccionado?.id : undefined);

    if (silencioso) {
      if (this.actualizandoEnFondo || this.cargando) return;
      this.actualizandoEnFondo = true;
    } else {
      this.cargando = true;
      this.errorCarga = '';
    }

    const requests: Record<string, Observable<unknown>> = {
      // Listado de usuarios: solo SUPER_ADMIN; el personal arma la lista desde el historial de su alcance.
      usuarios: this.esSuperAdmin
        ? this.usuarioAdminService.listarUsuarios().pipe(catchError(() => of([] as UsuarioAdmin[])))
        : of([] as UsuarioAdmin[]),
      historial: this.usuarioAdminService.listarHistorialCastigos().pipe(
        catchError(() => of([] as CastigoHistorialEntry[]))
      )
    };
    if (idHistorial) {
      requests['historialUsuario'] = this.usuarioAdminService.listarHistorialUsuario(idHistorial).pipe(
        catchError(() => of([] as CastigoHistorialEntry[]))
      );
    }

    forkJoin(requests).pipe(
      timeout(15000),
      catchError(() => of({
        usuarios: this.usuarios,
        historial: this.historial,
        historialUsuario: this.historialUsuario
      }))
    ).subscribe({
      next: (result) => {
        const data = result as {
          usuarios: UsuarioAdmin[];
          historial: CastigoHistorialEntry[];
          historialUsuario?: CastigoHistorialEntry[];
        };
        if (!this.esSuperAdmin) {
          data.usuarios = usuariosDesdeHistorial(data.historial);
        }

        const usuarioIdsCastigo = this.resolverIdsCastigoACargar(data.usuarios, data.historial);

        const cargarCastigos$ = usuarioIdsCastigo.length > 0
          ? this.usuarioAdminService.listarCastigos(usuarioIdsCastigo).pipe(
              catchError(() => of(new Map<string, CastigoResponse>()))
            )
          : of(new Map<string, CastigoResponse>());

        cargarCastigos$.subscribe(castigosMap => {
          this.ngZone.run(() => {
            this.usuarios = data.usuarios;
            this.historial = data.historial;
            this.castigosPorUsuario = {
              ...this.castigosPorUsuario,
              ...Object.fromEntries(castigosMap)
            };
            if (data.historialUsuario) {
              this.historialUsuario = data.historialUsuario;
            }
            if (idHistorial && this.modalCastigoAbierto) {
              const actualizado = data.usuarios.find(u => u.id === idHistorial);
              if (actualizado) {
                this.usuarioSeleccionado = actualizado;
                this.castigoActual = this.castigosPorUsuario[idHistorial] ?? this.castigoActual;
              }
            }
            this.aplicarFiltros();
            this.cargando = false;
            this.actualizandoEnFondo = false;
            this.refrescarVista();
          });
        });
      },
      error: () => {
        this.ngZone.run(() => {
          if (!silencioso) {
            this.errorCarga = 'No se pudieron cargar los datos.';
          }
          this.cargando = false;
          this.actualizandoEnFondo = false;
          this.refrescarVista();
        });
      }
    });
  }

  private coincideBusquedaUsuario(u: UsuarioAdmin, q: string): boolean {
    return (
      u.dni.includes(q) ||
      u.nombres.toLowerCase().includes(q) ||
      u.apellidos.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.telefono ?? '').includes(q) ||
      this.etiquetaNivel(this.nivelUsuario(u)).toLowerCase().includes(q)
    );
  }

  private extraerError(err: unknown): string {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'TimeoutError') {
      return 'La operación tardó demasiado.';
    }
    if (err instanceof Error && err.message) return err.message;
    if (err && typeof err === 'object' && 'error' in err) {
      const payload = (err as { error?: unknown }).error;
      if (typeof payload === 'string') return payload;
      if (payload && typeof payload === 'object' && 'error' in payload) {
        return String((payload as { error: unknown }).error);
      }
    }
    return 'No se pudo completar la operación.';
  }
}

/** Ciudadanos castigados dentro del alcance, a partir del historial (el personal no lista todos los usuarios). */
function usuariosDesdeHistorial(historial: CastigoHistorialEntry[]): UsuarioAdmin[] {
  const porId = new Map<string, UsuarioAdmin>();
  for (const h of historial) {
    if (h.userId && !porId.has(h.userId)) {
      porId.set(h.userId, { id: h.userId, dni: h.dni, nombres: h.fullName, apellidos: '', estado: 'ACTIVO' });
    }
  }
  return [...porId.values()];
}
