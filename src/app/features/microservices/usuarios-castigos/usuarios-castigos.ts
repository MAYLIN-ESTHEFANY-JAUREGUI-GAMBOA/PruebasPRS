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
import { Observable, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import {
  AdminCreateUsuarioRequest,
  AdminUpdateUsuarioRequest,
  CastigoHistorialEntry,
  CastigoResponse,
  NIVEL_CASTIGO,
  UsuarioAdmin,
  construirCastigoResponse,
  etiquetaNivelCastigo,
  nombreCompletoUsuario,
  resolverNivelCastigo, AplicarCastigoRequest
} from '../../../core/models/usuario.model';
import { UsuarioAdminService } from '../../../core/services/usuario-admin';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';
import { CivicToastService } from '../../../shared/services/civic-toast.service';

type SeccionActiva = 'ciudadanos' | 'sanciones';
type SubSeccionSanciones = 'vigentes' | 'auditoria';
type ModalAccion = 'escalar' | 'levantar';
type ModoUsuario = 'crear' | 'editar';
type CampoUsuario = 'dni' | 'password' | 'nombres' | 'apellidos' | 'telefono' | 'email';

const REGEX_DNI = /^\d{8}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_TELEFONO = /^[0-9+\s()-]{7,20}$/;
const REGEX_NOMBRE = /^[\p{L}\s'.-]+$/u;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const MIN_NOMBRE = 2;
const MAX_NOMBRE = 80;

interface ConfirmacionModal {
  titulo: string;
  mensaje: string;
  confirmarLabel: string;
  peligro?: boolean;
  accion: () => void | Promise<void>;
}

interface NivelEscalera {
  codigo: number;
  titulo: string;
  descripcion: string;
  consecuencia: string;
}

interface FormUsuario {
  dni: string;
  password: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string;
}

@Component({
  selector: 'app-usuarios-castigos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios-castigos.html',
  styleUrl: './usuarios-castigos.css'
})
export class UsuariosCastigos implements OnInit, OnDestroy {

  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly toast = inject(CivicToastService);

  seccionActiva: SeccionActiva = 'ciudadanos';
  subSeccionSanciones: SubSeccionSanciones = 'vigentes';

  usuarios: UsuarioAdmin[] = [];
  ciudadanosFiltrados: UsuarioAdmin[] = [];
  sancionesActivas: UsuarioAdmin[] = [];
  sancionesActivasFiltradas: UsuarioAdmin[] = [];
  historial: CastigoHistorialEntry[] = [];
  historialFiltrado: CastigoHistorialEntry[] = [];

  cargando = false;
  guardando = false;
  errorCarga = '';

  busqueda = '';
  filtroEstado: 'TODOS' | 'ACTIVO' | 'INACTIVO' = 'TODOS';
  filtroNivel: 'TODOS' | '0' | '1' | '2' | '3' = 'TODOS';
  filtroAccion: 'TODOS' | 'APLICAR' | 'LEVANTAR' | 'ACTUALIZAR' = 'TODOS';

  modalCastigoAbierto = false;
  modalUsuarioAbierto = false;
  modalConfirmacion: ConfirmacionModal | null = null;
  modoUsuario: ModoUsuario = 'crear';
  modalAccion: ModalAccion = 'escalar';
  historialModalAbierto = false;

  usuarioSeleccionado: UsuarioAdmin | null = null;
  castigoActual: CastigoResponse | null = null;
  historialUsuario: CastigoHistorialEntry[] = [];
  avisoHistorialModal = '';

  formMotivo = '';
  formHorasBloqueo = 24;
  formUsuario: FormUsuario = this.formUsuarioVacio();
  errorModal = '';
  mensajeExito = '';

  erroresUsuario: Partial<Record<CampoUsuario, string>> = {};
  tocadosUsuario: Partial<Record<CampoUsuario, boolean>> = {};

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

  readonly filtrosNivel = [
    { label: 'Todos', value: 'TODOS' as const },
    { label: 'Sin sanción', value: '0' as const },
    { label: 'Nivel 1', value: '1' as const },
    { label: 'Nivel 2', value: '2' as const },
    { label: 'Nivel 3', value: '3' as const }
  ];

  readonly filtrosEstado = [
    { label: 'Todos', value: 'TODOS' as const },
    { label: 'Activos', value: 'ACTIVO' as const },
    { label: 'Inactivos', value: 'INACTIVO' as const }
  ];

  readonly filtrosAccion = [
    { label: 'Todas', value: 'TODOS' as const },
    { label: 'Aplicadas', value: 'APLICAR' as const },
    { label: 'Levantadas', value: 'LEVANTAR' as const },
    { label: 'Actualizadas', value: 'ACTUALIZAR' as const }
  ];

  ngOnInit(): void {
    this.cargarDatos();
  }

  ngOnDestroy(): void {
    this.guardando = false;
    this.bloquearScroll(false);
  }

  cargarDatos(): void {
    this.cargando = true;
    this.errorCarga = '';
    forkJoin({
      usuarios: this.usuarioAdminService.listarUsuarios().pipe(catchError(() => of([] as UsuarioAdmin[]))),
      historial: this.usuarioAdminService.listarHistorialCastigos().pipe(
        catchError(() => of([] as CastigoHistorialEntry[]))
      )
    }).subscribe({
      next: ({ usuarios, historial }) => {
        this.ngZone.run(() => {
          this.usuarios = usuarios;
          this.historial = historial;
          this.aplicarFiltros();
          this.cargando = false;
          this.refrescarVista();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.errorCarga = 'No se pudieron cargar los datos.';
          this.cargando = false;
          this.refrescarVista();
        });
      }
    });
  }

  cambiarSeccion(seccion: SeccionActiva): void {
    this.seccionActiva = seccion;
    if (seccion === 'sanciones') {
      this.subSeccionSanciones = 'vigentes';
    }
    this.aplicarFiltros();
  }

  cambiarSubSeccionSanciones(sub: SubSeccionSanciones): void {
    this.subSeccionSanciones = sub;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = 'TODOS';
    this.filtroNivel = 'TODOS';
    this.filtroAccion = 'TODOS';
    this.aplicarFiltros();
  }

  hayFiltrosActivos(): boolean {
    return !!this.busqueda.trim()
      || this.filtroEstado !== 'TODOS'
      || this.filtroNivel !== 'TODOS'
      || (this.seccionActiva === 'sanciones' && this.filtroAccion !== 'TODOS');
  }

  abrirConfirmacion(config: ConfirmacionModal): void {
    this.modalConfirmacion = config;
    this.bloquearScroll(true);
  }

  cerrarConfirmacion(): void {
    this.modalConfirmacion = null;
    if (!this.modalCastigoAbierto && !this.modalUsuarioAbierto) {
      this.bloquearScroll(false);
    }
  }

  async confirmarAccion(): Promise<void> {
    const accion = this.modalConfirmacion?.accion;
    if (!accion) return;
    this.cerrarConfirmacion();
    await accion();
  }

  aplicarFiltros(): void {
    const q = this.busqueda.trim().toLowerCase();
    const ciudadanos = this.usuarios.filter(u => this.esCiudadano(u));

    this.ciudadanosFiltrados = ciudadanos.filter(u => {
      if (q && !this.coincideBusquedaUsuario(u, q)) return false;
      if (this.filtroEstado !== 'TODOS' && u.estado !== this.filtroEstado) return false;
      if (this.filtroNivel !== 'TODOS' && this.nivelUsuario(u) !== Number(this.filtroNivel)) return false;
      return true;
    });

    this.sancionesActivas = ciudadanos.filter(u => this.nivelUsuario(u) > 0);
    this.sancionesActivasFiltradas = this.sancionesActivas.filter(u => {
      if (q && !this.coincideBusquedaUsuario(u, q)) return false;
      if (this.filtroNivel !== 'TODOS' && this.nivelUsuario(u) !== Number(this.filtroNivel)) return false;
      return true;
    });

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
  }

  esCiudadano(u: UsuarioAdmin): boolean {
    return !u.entidadId;
  }

  conteoCiudadanos(): number {
    return this.usuarios.filter(u => this.esCiudadano(u)).length;
  }

  conteoActivos(): number {
    return this.usuarios.filter(u => this.esCiudadano(u) && u.estado === 'ACTIVO').length;
  }

  abrirModalCrearUsuario(): void {
    this.modoUsuario = 'crear';
    this.formUsuario = this.formUsuarioVacio();
    this.limpiarErroresUsuario();
    this.errorModal = '';
    this.modalUsuarioAbierto = true;
    this.bloquearScroll(true);
  }

  abrirModalEditarUsuario(usuario: UsuarioAdmin): void {
    this.modoUsuario = 'editar';
    this.usuarioSeleccionado = usuario;
    this.formUsuario = {
      dni: usuario.dni,
      password: '',
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      telefono: usuario.telefono ?? '',
      email: usuario.email ?? ''
    };
    this.limpiarErroresUsuario();
    this.errorModal = '';
    this.modalUsuarioAbierto = true;
    this.bloquearScroll(true);
  }

  cerrarModalUsuario(): void {
    this.modalUsuarioAbierto = false;
    this.usuarioSeleccionado = null;
    this.limpiarErroresUsuario();
    this.errorModal = '';
    if (!this.modalCastigoAbierto && !this.modalConfirmacion) {
      this.bloquearScroll(false);
    }
    this.refrescarVista();
  }

  async guardarUsuario(): Promise<void> {
    if (this.guardando) return;
    if (!this.validarFormularioUsuario()) return;

    const f = this.formUsuario;
    if (this.modoUsuario === 'crear') {
      const body: AdminCreateUsuarioRequest = {
        dni: f.dni.trim(),
        password: f.password,
        firstName: f.nombres.trim(),
        lastName: f.apellidos.trim(),
        phone: f.telefono.trim() || undefined,
        email: f.email.trim() || undefined,
        entityId: null
      };
      await this.ejecutarGuardado(
        this.usuarioAdminService.crearUsuario(body),
        () => {
          this.toast.success('Ciudadano registrado correctamente.');
          this.cerrarModalUsuario();
          this.cargarDatos();
        }
      );
      return;
    }
    if (!this.usuarioSeleccionado) return;
    const body: AdminUpdateUsuarioRequest = {
      firstName: f.nombres.trim(),
      lastName: f.apellidos.trim(),
      phone: f.telefono.trim() || undefined,
      email: f.email.trim() || undefined
    };
    await this.ejecutarGuardado(
      this.usuarioAdminService.actualizarUsuario(this.usuarioSeleccionado.id, body),
      (actualizado) => {
        this.sincronizarUsuarioEnLista(actualizado);
        this.toast.success('Datos actualizados.');
        this.cerrarModalUsuario();
      }
    );
  }

  async toggleEstadoUsuario(usuario: UsuarioAdmin): Promise<void> {
    if (this.guardando) return;
    const nuevo = usuario.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    const activar = nuevo === 'ACTIVO';
    this.abrirConfirmacion({
      titulo: activar ? 'Activar cuenta' : 'Desactivar cuenta',
      mensaje: activar
        ? `Se habilitará el acceso de ${this.nombreUsuario(usuario)} a la app móvil.`
        : `Se suspenderá el acceso de ${this.nombreUsuario(usuario)} a la app móvil.`,
      confirmarLabel: activar ? 'Activar cuenta' : 'Desactivar cuenta',
      peligro: !activar,
      accion: async () => {
        await this.ejecutarGuardado(
          this.usuarioAdminService.cambiarEstado(usuario.id, nuevo),
          (actualizado) => {
            this.sincronizarUsuarioEnLista(actualizado);
            this.toast.success(`Cuenta ${activar ? 'activada' : 'desactivada'}.`);
          },
          (mensaje) => this.toast.error(mensaje)
        );
      }
    });
  }

  abrirModalCastigo(usuario: UsuarioAdmin): void {
    this.usuarioSeleccionado = usuario;
    this.modalCastigoAbierto = true;
    this.historialModalAbierto = false;
    this.modalAccion = this.puedeEscalarDesde(usuario) ? 'escalar' : 'levantar';
    this.castigoActual = construirCastigoResponse(usuario);
    this.historialUsuario = [];
    this.formMotivo = '';
    this.formHorasBloqueo = 24;
    this.errorModal = '';
    this.mensajeExito = '';
    this.avisoHistorialModal = '';
    this.guardando = false;
    this.bloquearScroll(true);

    this.usuarioAdminService.listarHistorialUsuario(usuario.id).pipe(
      catchError(() => {
        this.avisoHistorialModal = 'No se pudo cargar el historial.';
        return of([] as CastigoHistorialEntry[]);
      })
    ).subscribe(historial => {
      this.historialUsuario = historial;
      this.refrescarVista();
    });
  }

  gestionarDesdeHistorial(entry: CastigoHistorialEntry): void {
    const usuario = this.usuarios.find(u => u.id === entry.userId || u.dni === entry.dni);
    if (usuario) {
      this.abrirModalCastigo(usuario);
      return;
    }
    this.toast.info(`No se encontró al ciudadano DNI ${entry.dni} en el directorio actual.`);
    this.refrescarVista();
  }

  cerrarModalCastigo(): void {
    this.guardando = false;
    this.modalCastigoAbierto = false;
    this.usuarioSeleccionado = null;
    this.castigoActual = null;
    if (!this.modalUsuarioAbierto && !this.modalConfirmacion) {
      this.bloquearScroll(false);
    }
    this.refrescarVista();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalConfirmacion) this.cerrarConfirmacion();
    else if (this.modalCastigoAbierto) this.cerrarModalCastigo();
    else if (this.modalUsuarioAbierto) this.cerrarModalUsuario();
  }

  cambiarAccionModal(accion: ModalAccion): void {
    this.modalAccion = accion;
    this.errorModal = '';
    this.mensajeExito = '';
  }

  seleccionarHorasPreset(horas: number): void {
    this.formHorasBloqueo = horas;
  }

  puedeConfirmarEscalar(): boolean {
    return this.formMotivo.trim().length >= 10;
  }

  textoBotonConfirmar(): string {
    const etiqueta = this.castigoActual?.proximoNivelEtiqueta;
    return etiqueta ? `Aplicar ${etiqueta}` : 'Confirmar';
  }

  ejecutarAccionModal(): void {
    if (this.guardando) return;
    if (this.modalAccion === 'escalar') {
      if (!this.puedeConfirmarEscalar()) {
        this.errorModal = this.formMotivo.trim()
          ? 'El motivo debe tener al menos 10 caracteres.'
          : 'Indique el motivo del castigo.';
        this.refrescarVista();
        return;
      }
      void this.escalarCastigo();
      return;
    }
    void this.levantarCastigo();
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
        this.castigoActual = castigo;
        this.formMotivo = '';
        this.mensajeExito = `Sanción aplicada: ${castigo.nivelEtiqueta}.`;
        this.refrescarTrasAccion(castigo);
      }
    );
  }

  async levantarCastigo(): Promise<void> {
    if (!this.usuarioSeleccionado) return;
    await this.ejecutarAccionCastigo(
      this.usuarioAdminService.levantarCastigo(this.usuarioSeleccionado.id),
      (castigo) => {
        this.castigoActual = castigo;
        this.modalAccion = 'escalar';
        this.mensajeExito = 'Sanción levantada.';
        this.refrescarTrasAccion(castigo);
      }
    );
  }

  nivelUsuario(u: UsuarioAdmin): number {
    return resolverNivelCastigo(u.sistemaCastigos);
  }

  etiquetaNivel(nivel: number): string {
    return etiquetaNivelCastigo(nivel);
  }

  nombreUsuario(u: UsuarioAdmin): string {
    return nombreCompletoUsuario(u);
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

  claseBadgeEstado(estado: string): string {
    return estado === 'ACTIVO'
      ? 'civic-chip civic-chip--estado civic-chip--estado-activo'
      : 'civic-chip civic-chip--estado civic-chip--estado-inactivo';
  }

  etiquetaEstado(estado: string): string {
    return estado === 'ACTIVO' ? 'Activo' : 'Inactivo';
  }

  accionEtiqueta(accion: string): string {
    switch (accion) {
      case 'APLICAR': return 'Aplicado';
      case 'LEVANTAR': return 'Levantado';
      case 'ACTUALIZAR': return 'Actualizado';
      default: return accion;
    }
  }

  accesoPermitidoUsuario(u: UsuarioAdmin): boolean {
    const nivel = this.nivelUsuario(u);
    if (nivel === NIVEL_CASTIGO.BLOQUEO_PERMANENTE) return false;
    if (nivel === NIVEL_CASTIGO.BLOQUEO_TEMPORAL && u.sistemaCastigos?.fecha_fin_bloqueo_temporal) {
      return new Date(u.sistemaCastigos.fecha_fin_bloqueo_temporal) <= new Date();
    }
    return true;
  }

  nivelEscaleraEstado(codigo: number): 'done' | 'current' | 'pending' {
    const actual = this.castigoActual?.nivelCastigo ?? 0;
    if (codigo < actual) return 'done';
    if (codigo === actual) return 'current';
    if (codigo === actual + 1 && this.castigoActual?.proximoNivel === codigo) return 'pending';
    return codigo <= actual ? 'done' : 'pending';
  }

  puedeEscalar(): boolean {
    const c = this.castigoActual;
    if (!c?.proximoNivel || this.guardando) return false;
    if (c.nivelCastigo === NIVEL_CASTIGO.BLOQUEO_TEMPORAL && c.bloqueoActivo) return false;
    return true;
  }

  puedeEscalarDesde(u: UsuarioAdmin): boolean {
    const c = construirCastigoResponse(u);
    if (!c.proximoNivel) return false;
    if (c.nivelCastigo === NIVEL_CASTIGO.BLOQUEO_TEMPORAL && c.bloqueoActivo) return false;
    return true;
  }

  puedeLevantar(): boolean {
    return (this.castigoActual?.nivelCastigo ?? 0) > 0 && !this.guardando;
  }

  formatearFecha(valor?: string | null): string {
    if (!valor) return '—';
    try {
      return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
    } catch {
      return valor;
    }
  }

  formatearFechaAuditoria(valor?: string | null): { fecha: string; hora: string } {
    if (!valor) return { fecha: '—', hora: '' };
    try {
      const d = new Date(valor);
      return {
        fecha: new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(d),
        hora: new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(d)
      };
    } catch {
      return { fecha: valor, hora: '' };
    }
  }

  trackByUsuarioId(_: number, u: UsuarioAdmin): string {
    return u.id;
  }

  trackByHistorialId(_: number, h: CastigoHistorialEntry): string {
    return h.id;
  }

  onDniInput(valor: string): void {
    this.formUsuario.dni = (valor ?? '').replace(/\D/g, '').slice(0, 8);
    this.validarCampoUsuario('dni');
  }

  onTelefonoInput(valor: string): void {
    this.formUsuario.telefono = (valor ?? '').replace(/[^\d+\s()-]/g, '').slice(0, 20);
    this.validarCampoUsuario('telefono');
  }

  validarCampoUsuario(campo: CampoUsuario): void {
    this.tocadosUsuario[campo] = true;
    const mensaje = this.revisarCampoUsuario(campo);
    if (mensaje) this.erroresUsuario[campo] = mensaje;
    else delete this.erroresUsuario[campo];
  }

  tieneErrorUsuario(campo: CampoUsuario): boolean {
    return !!this.tocadosUsuario[campo] && !!this.erroresUsuario[campo];
  }

  get formularioUsuarioValido(): boolean {
    return this.camposUsuarioRelevantes().every(c => !this.revisarCampoUsuario(c));
  }

  validarFormularioUsuario(): boolean {
    const campos = this.camposUsuarioRelevantes();
    campos.forEach(c => this.validarCampoUsuario(c));
    const primerError = campos.find(c => this.erroresUsuario[c]);
    if (primerError) {
      this.errorModal = this.erroresUsuario[primerError] ?? 'Revise los datos del formulario.';
      this.refrescarVista();
      return false;
    }
    this.errorModal = '';
    return true;
  }

  private camposUsuarioRelevantes(): CampoUsuario[] {
    if (this.modoUsuario === 'crear') {
      return ['dni', 'nombres', 'apellidos', 'password', 'email', 'telefono'];
    }
    return ['nombres', 'apellidos', 'email', 'telefono'];
  }

  private revisarCampoUsuario(campo: CampoUsuario): string {
    const f = this.formUsuario;
    switch (campo) {
      case 'dni': {
        if (this.modoUsuario !== 'crear') return '';
        const valor = (f.dni ?? '').trim();
        if (!valor) return 'El DNI es obligatorio.';
        if (!/^\d+$/.test(valor)) return 'El DNI solo puede contener dígitos.';
        if (valor.length !== 8) return 'El DNI debe tener exactamente 8 dígitos.';
        if (!REGEX_DNI.test(valor)) return 'DNI inválido.';
        return '';
      }
      case 'password': {
        if (this.modoUsuario !== 'crear') return '';
        const valor = f.password ?? '';
        if (!valor) return 'La contraseña es obligatoria.';
        if (valor.length < MIN_PASSWORD) {
          return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
        }
        if (valor.length > MAX_PASSWORD) {
          return `La contraseña es demasiado larga (máx. ${MAX_PASSWORD}).`;
        }
        return '';
      }
      case 'nombres':
        return this.revisarNombre(f.nombres, 'Los nombres');
      case 'apellidos':
        return this.revisarNombre(f.apellidos, 'Los apellidos');
      case 'email': {
        const valor = (f.email ?? '').trim();
        if (!valor) return '';
        if (valor.length > 120) return 'El email es demasiado largo (máx. 120 caracteres).';
        if (!REGEX_EMAIL.test(valor)) return 'Formato de email no válido.';
        return '';
      }
      case 'telefono': {
        const valor = (f.telefono ?? '').trim();
        if (!valor) return '';
        if (!REGEX_TELEFONO.test(valor)) {
          return 'Teléfono inválido (7–20 caracteres: dígitos, espacios, +, -, paréntesis).';
        }
        return '';
      }
    }
  }

  private revisarNombre(valor: string, etiqueta: string): string {
    const limpio = (valor ?? '').trim();
    if (!limpio) return `${etiqueta} son obligatorios.`;
    if (limpio.length < MIN_NOMBRE) return `${etiqueta} deben tener al menos ${MIN_NOMBRE} caracteres.`;
    if (limpio.length > MAX_NOMBRE) return `${etiqueta} no pueden superar ${MAX_NOMBRE} caracteres.`;
    if (!REGEX_NOMBRE.test(limpio)) {
      return `${etiqueta} solo pueden contener letras, espacios, apóstrofes y guiones.`;
    }
    return '';
  }

  private limpiarErroresUsuario(): void {
    this.erroresUsuario = {};
    this.tocadosUsuario = {};
  }

  private formUsuarioVacio(): FormUsuario {
    return { dni: '', password: '', nombres: '', apellidos: '', telefono: '', email: '' };
  }

  private bloquearScroll(bloquear: boolean): void {
    if (bloquear) lockPageScroll(this.document);
    else unlockPageScroll(this.document);
  }

  private async ejecutarGuardado<T>(
    source: Observable<T>,
    onSuccess: (result: T) => void,
    onErrorToast?: (mensaje: string) => void
  ): Promise<void> {
    this.ngZone.run(() => {
      this.guardando = true;
      this.errorModal = '';
      this.refrescarVista();
    });
    try {
      const result = await firstValueFrom(source.pipe(timeout(30000)));
      this.ngZone.run(() => onSuccess(result));
    } catch (err) {
      const mensaje = this.extraerError(err);
      this.ngZone.run(() => {
        this.errorModal = mensaje;
        onErrorToast?.(mensaje);
        this.refrescarVista();
      });
    } finally {
      this.ngZone.run(() => {
        this.guardando = false;
        this.refrescarVista();
      });
    }
  }

  private sincronizarUsuarioEnLista(actualizado: UsuarioAdmin): void {
    const idx = this.usuarios.findIndex(u => u.id === actualizado.id);
    this.usuarios = idx === -1
      ? [...this.usuarios, actualizado]
      : this.usuarios.map((u, i) => (i === idx ? actualizado : u));
    this.aplicarFiltros();
    this.refrescarVista();
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
        this.refrescarVista();
      });
    } finally {
      this.ngZone.run(() => {
        this.guardando = false;
        this.refrescarVista();
      });
    }
  }

  private refrescarVista(): void {
    try { this.cdr.detectChanges(); } catch { /* noop */ }
  }

  private refrescarTrasAccion(castigo?: CastigoResponse): void {
    if (!this.usuarioSeleccionado) return;
    const id = this.usuarioSeleccionado.id;
    if (castigo) this.castigoActual = castigo;

    forkJoin({
      usuarios: this.usuarioAdminService.listarUsuarios().pipe(catchError(() => of([] as UsuarioAdmin[]))),
      historial: this.usuarioAdminService.listarHistorialCastigos().pipe(
        catchError(() => of([] as CastigoHistorialEntry[]))
      ),
      historialUsuario: this.usuarioAdminService.listarHistorialUsuario(id).pipe(
        catchError(() => of([] as CastigoHistorialEntry[]))
      )
    }).pipe(
      timeout(15000),
      catchError(() => of({
        usuarios: this.usuarios,
        historial: this.historial,
        historialUsuario: this.historialUsuario
      }))
    ).subscribe(({ usuarios, historial, historialUsuario }) => {
      this.usuarios = usuarios;
      this.historial = historial;
      this.historialUsuario = historialUsuario;
      const actualizado = usuarios.find(u => u.id === id);
      if (actualizado) {
        this.usuarioSeleccionado = actualizado;
        this.castigoActual = construirCastigoResponse(actualizado);
      }
      this.aplicarFiltros();
      this.refrescarVista();
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
