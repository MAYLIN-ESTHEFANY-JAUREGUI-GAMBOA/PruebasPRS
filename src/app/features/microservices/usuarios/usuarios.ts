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
import { Observable, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

import {
  AdminCreateUsuarioRequest,
  AdminUpdateUsuarioRequest,
  UsuarioAdmin,
  nombreCompletoUsuario
} from '../../../core/models/usuario.model';
import { UsuarioAdminService } from '../../../core/services/usuario-admin';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';
import {
  formatearTelefonoAlEscribir,
  sanitizarTelefonoInput,
  validarTelefonoPeru
} from '../../../shared/utils/telefono.util';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { UsuarioPdfService } from '../../../core/reports/usuario/usuario-pdf.service';
import { UsuarioExcelService } from '../../../core/reports/usuario/usuario-excel.service';

type ModoUsuario = 'crear' | 'editar';
type CampoUsuario = 'dni' | 'password' | 'nombres' | 'apellidos' | 'telefono' | 'email';

const REGEX_DNI = /^\d{8}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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

interface FormUsuario {
  dni: string;
  password: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string;
}

function inicial(texto: string): string {
  const c = (texto ?? '').trim().normalize('NFD').charAt(0).toUpperCase();
  return /[A-ZÑ]/.test(c) ? c : '#';
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html',
  styleUrls: ['../municipalidades/municipalidades.css', './usuarios.css']
})
export class Usuarios implements OnInit, OnDestroy {

  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly toast = inject(CivicToastService);
  private readonly usuarioPdf = inject(UsuarioPdfService);
  private readonly usuarioExcel = inject(UsuarioExcelService);
  readonly puedeExportar = inject(ReportBrandingService).puedeExportar();
  generandoReporte = false;

  usuarios: UsuarioAdmin[] = [];
  ciudadanosFiltrados: UsuarioAdmin[] = [];
  /** Padrón alfabético por inicial del apellido, como un directorio impreso. */
  grupos: { letra: string; usuarios: UsuarioAdmin[] }[] = [];
  seleccionado: UsuarioAdmin | null = null;

  cargando = false;
  guardando = false;
  /** En modo crear: usuario ya registrado con el DNI escrito; no se puede crear de nuevo. */
  usuarioExistente: UsuarioAdmin | null = null;
  buscandoDni = false;
  errorCarga = '';

  busqueda = '';
  filtroEstado: 'TODOS' | 'ACTIVO' | 'INACTIVO' = 'TODOS';

  modalUsuarioAbierto = false;
  modalConfirmacion: ConfirmacionModal | null = null;
  modoUsuario: ModoUsuario = 'crear';

  usuarioSeleccionado: UsuarioAdmin | null = null;
  formUsuario: FormUsuario = this.formUsuarioVacio();
  errorModal = '';

  erroresUsuario: Partial<Record<CampoUsuario, string>> = {};
  tocadosUsuario: Partial<Record<CampoUsuario, boolean>> = {};

  readonly filtrosEstado = [
    { label: 'Todos', value: 'TODOS' as const },
    { label: 'Activos', value: 'ACTIVO' as const },
    { label: 'Inactivos', value: 'INACTIVO' as const }
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
    this.usuarioAdminService.listarUsuarios().pipe(
      catchError(() => of([] as UsuarioAdmin[]))
    ).subscribe({
      next: (usuarios) => {
        this.ngZone.run(() => {
          this.usuarios = usuarios;
          this.aplicarFiltros();
          this.cargando = false;
          this.refrescarVista();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.errorCarga = 'No se pudieron cargar los ciudadanos.';
          this.cargando = false;
          this.refrescarVista();
        });
      }
    });
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = 'TODOS';
    this.aplicarFiltros();
  }

  hayFiltrosActivos(): boolean {
    return !!this.busqueda.trim() || this.filtroEstado !== 'TODOS';
  }

  aplicarFiltros(): void {
    const q = this.busqueda.trim().toLowerCase();
    this.ciudadanosFiltrados = this.usuarios.filter(u => this.esCiudadano(u)).filter(u => {
      if (u.estado === 'PENDIENTE_APROBACION' || u.estado === 'RECHAZADO') return false;
      if (q && !this.coincideBusquedaUsuario(u, q)) return false;
      // Inactivos incluye los suspendidos por castigo: ninguno puede ingresar.
      if (this.filtroEstado !== 'TODOS' && (u.estado === 'ACTIVO') !== (this.filtroEstado === 'ACTIVO')) return false;
      return true;
    }).sort((a, b) => this.nombreIndice(a).localeCompare(this.nombreIndice(b), 'es'));
    this.grupos = [];
    for (const u of this.ciudadanosFiltrados) {
      const letra = inicial(u.apellidos || u.nombres);
      const ultimo = this.grupos.at(-1);
      if (ultimo?.letra === letra) ultimo.usuarios.push(u);
      else this.grupos.push({ letra, usuarios: [u] });
    }
    // Conserva la ficha abierta (con sus datos al día) si sigue en la lista; si no, abre la primera.
    this.seleccionado = this.ciudadanosFiltrados.find(u => u.id === this.seleccionado?.id) ?? this.ciudadanosFiltrados[0] ?? null;
  }

  /** SUPER_ADMIN: ciudadanos de todo el sistema, con los filtros de la tabla. */
  async exportar(formato: 'pdf' | 'xlsx'): Promise<void> {
    if (this.generandoReporte || !this.ciudadanosFiltrados.length) return;
    const filas = this.ciudadanosFiltrados.map(u => ({
      nombre: [u.nombres, u.apellidos].filter(Boolean).join(' ') || 'Sin nombre', dni: u.dni,
      telefono: u.telefono, email: u.email, estado: u.estado, creadoEn: u.creadoEn
    }));
    const filtros = { estado: this.filtrosEstado.find(f => f.value === this.filtroEstado)?.label ?? 'Todos', busqueda: this.busqueda.trim() };
    this.generandoReporte = true;
    try {
      await (formato === 'pdf'
        ? this.usuarioPdf.generarPdf('ciudadanos', filas, filtros)
        : this.usuarioExcel.generarExcel('ciudadanos', filas, filtros));
      this.toast.success(`Reporte ${formato === 'pdf' ? 'PDF' : 'Excel'} generado.`);
    } catch {
      this.toast.error('No se pudo generar el reporte.');
    } finally {
      this.generandoReporte = false;
      this.cdr.markForCheck();
    }
  }

  esCiudadano(u: UsuarioAdmin): boolean {
    return !u.entidadId;
  }

  conteoCiudadanos(): number {
    return this.usuarios.filter(u => this.esCiudadano(u)
      && u.estado !== 'PENDIENTE_APROBACION'
      && u.estado !== 'RECHAZADO').length;
  }

  conteoActivos(): number {
    return this.usuarios.filter(u => this.esCiudadano(u) && u.estado === 'ACTIVO').length;
  }

  conteoInactivos(): number {
    return this.conteoCiudadanos() - this.conteoActivos();
  }

  conteo(filtro: 'TODOS' | 'ACTIVO' | 'INACTIVO'): number {
    return filtro === 'TODOS' ? this.conteoCiudadanos() : filtro === 'ACTIVO' ? this.conteoActivos() : this.conteoInactivos();
  }

  abrirModalCrearUsuario(): void {
    this.modoUsuario = 'crear';
    this.usuarioExistente = null;
    this.formUsuario = this.formUsuarioVacio();
    this.limpiarErroresUsuario();
    this.errorModal = '';
    this.modalUsuarioAbierto = true;
    this.bloquearScroll(true);
  }

  abrirModalEditarUsuario(usuario: UsuarioAdmin): void {
    this.modoUsuario = 'editar';
    this.usuarioExistente = null;
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
    if (!this.modalConfirmacion) {
      this.bloquearScroll(false);
    }
    this.refrescarVista();
  }

  abrirConfirmacion(config: ConfirmacionModal): void {
    this.modalConfirmacion = config;
    this.bloquearScroll(true);
  }

  cerrarConfirmacion(): void {
    this.modalConfirmacion = null;
    if (!this.modalUsuarioAbierto) {
      this.bloquearScroll(false);
    }
  }

  async confirmarAccion(): Promise<void> {
    const accion = this.modalConfirmacion?.accion;
    if (!accion) return;
    this.cerrarConfirmacion();
    await accion();
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
    if (usuario.estado === 'SUSPENDIDO') {
      this.toast.info('Este ciudadano tiene bloqueo permanente. Levántelo desde la sección Castigos.');
      return;
    }
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalConfirmacion) this.cerrarConfirmacion();
    else if (this.modalUsuarioAbierto) this.cerrarModalUsuario();
  }

  nombreUsuario(u: UsuarioAdmin): string {
    return nombreCompletoUsuario(u);
  }

  inicialesUsuario(u: UsuarioAdmin): string {
    return this.iniciales(this.nombreUsuario(u));
  }

  nombreIndice(u: UsuarioAdmin): string {
    return [u.apellidos, u.nombres].filter(Boolean).join(', ') || u.dni;
  }

  etiquetaReniec(estado?: string | null): string {
    switch ((estado ?? '').toUpperCase()) {
      case 'COINCIDE': return 'Coincide';
      case 'NO_COINCIDE': return 'No coincide';
      case 'ERROR': return 'Error de consulta';
      default: return 'Sin consulta';
    }
  }

  /** Zona de lectura del carnet, al estilo del reverso del DNI: decorativa, armada con los datos reales. */
  mrz(u: UsuarioAdmin): string[] {
    const limpio = (t: string) => (t ?? '').normalize('NFD').replace(/[^A-Za-z ]/g, '').trim().toUpperCase().replace(/\s+/g, '<');
    const linea = (t: string) => t.padEnd(30, '<').slice(0, 30);
    return [linea(`I<PER${u.dni}`), linea(`${limpio(u.apellidos)}<<${limpio(u.nombres)}`)];
  }

  iniciales(nombre: string): string {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  }

  etiquetaEstado(estado: string): string {
    if (estado === 'ACTIVO') return 'Activo';
    if (estado === 'SUSPENDIDO') return 'Suspendido';
    return 'Inactivo';
  }

  onDniInput(valor: string): void {
    const dni = (valor ?? '').replace(/\D/g, '').slice(0, 8);
    if (dni === this.formUsuario.dni) return;
    this.formUsuario.dni = dni;
    if (this.usuarioExistente) {
      // Cambió el DNI: se descartan los datos rellenados del usuario anterior.
      this.usuarioExistente = null;
      Object.assign(this.formUsuario, { nombres: '', apellidos: '', telefono: '', email: '' });
    }
    this.validarCampoUsuario('dni');
    if (this.modoUsuario === 'crear' && dni.length === 8) void this.buscarDni(dni);
  }

  editarUsuarioExistente(): void {
    if (this.usuarioExistente) this.abrirModalEditarUsuario(this.usuarioExistente);
  }

  private async buscarDni(dni: string): Promise<void> {
    this.buscandoDni = true;
    try {
      const existente = await firstValueFrom(this.usuarioAdminService.buscarUsuarioPorDni(dni));
      if (this.formUsuario.dni !== dni || this.modoUsuario !== 'crear' || !existente) return;
      this.usuarioExistente = existente;
      Object.assign(this.formUsuario, {
        nombres: existente.nombres ?? '',
        apellidos: existente.apellidos ?? '',
        telefono: existente.telefono ?? '',
        email: existente.email ?? '',
        password: ''
      });
      this.limpiarErroresUsuario();
    } catch {
      // Si la verificación falla, el backend igual rechaza el DNI repetido (409) al guardar.
    } finally {
      this.buscandoDni = false;
      this.refrescarVista();
    }
  }

  onTelefonoInput(valor: string): void {
    const sanitizado = sanitizarTelefonoInput(valor);
    this.formUsuario.telefono = formatearTelefonoAlEscribir(sanitizado);
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
    if (this.modoUsuario === 'crear' && (this.usuarioExistente || this.buscandoDni)) return false;
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
        return validarTelefonoPeru(f.telefono ?? '');
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

  private coincideBusquedaUsuario(u: UsuarioAdmin, q: string): boolean {
    return (
      u.dni.includes(q) ||
      u.nombres.toLowerCase().includes(q) ||
      u.apellidos.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.telefono ?? '').includes(q)
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

  private refrescarVista(): void {
    try { this.cdr.detectChanges(); } catch { /* noop */ }
  }
}
