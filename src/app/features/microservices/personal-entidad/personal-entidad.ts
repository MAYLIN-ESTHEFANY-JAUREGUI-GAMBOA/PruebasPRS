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
import { firstValueFrom } from 'rxjs';

import { AuthService, ROLES } from '../../../core/auth/auth.service';
import {
  AdminCreateUsuarioRequest,
  PersonalExistente,
  UsuarioAdmin,
  nombreCompletoUsuario
} from '../../../core/models/usuario.model';
import { UsuarioAdminService } from '../../../core/services/usuario-admin';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { UsuarioPdfService } from '../../../core/reports/usuario/usuario-pdf.service';
import { UsuarioExcelService } from '../../../core/reports/usuario/usuario-excel.service';
import { UsuarioReporteFila } from '../../../core/reports/usuario/usuario-reporte.model';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';
import {
  formatearTelefonoAlEscribir,
  sanitizarTelefonoInput,
  validarTelefonoPeru
} from '../../../shared/utils/telefono.util';

type CampoForm = 'dni' | 'password' | 'nombres' | 'apellidos' | 'telefono' | 'email' | 'rolId';
/** Con un DNI ya registrado estos datos son los del usuario y no se editan: solo se agrega el rol. */
const CAMPOS_DEL_EXISTENTE: CampoForm[] = ['password', 'nombres', 'apellidos', 'telefono', 'email'];

const REGEX_DNI = /^\d{8}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_NOMBRE = /^[\p{L}\s'.-]+$/u;
const MIN_PASSWORD = 6;

interface RolPersonal {
  /** Se envía el nombre del rol: vg-ms-usuarios resuelve el ObjectId. */
  id: string;
  label: string;
}

const ROL_OPERADOR: RolPersonal = { id: ROLES.OPERADOR_ENTIDAD, label: 'Operador' };
const ROL_ANALISTA: RolPersonal = { id: ROLES.ANALISTA, label: 'Analista (solo lectura)' };
const ROL_ADMIN_MUNICIPAL: RolPersonal = { id: ROLES.MUNICIPALIDAD_ADMIN, label: 'Administrador municipal' };

const ETIQUETA_ROL: Record<string, string> = {
  [ROLES.OPERADOR_ENTIDAD]: 'Operador',
  [ROLES.ANALISTA]: 'Analista',
  [ROLES.MUNICIPALIDAD_ADMIN]: 'Administrador municipal',
  [ROLES.ENTIDAD_ADMIN]: 'Administrador de entidad',
  [ROLES.CIUDADANO]: 'Ciudadano'
};

interface FormPersonal {
  dni: string;
  password: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  email: string;
  rolId: string;
}

@Component({
  selector: 'app-personal-entidad',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './personal-entidad.html',
  styleUrl: '../usuarios-castigos/usuarios-castigos.css'
})
export class PersonalEntidad implements OnInit, OnDestroy {
  private readonly usuarioService = inject(UsuarioAdminService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly toast = inject(CivicToastService);
  private readonly usuarioPdf = inject(UsuarioPdfService);
  private readonly usuarioExcel = inject(UsuarioExcelService);
  readonly puedeExportar = inject(ReportBrandingService).puedeExportar();
  generandoReporte = false;

  /** Personal municipal (sin entidad): analistas y, solo la cuenta titular, otros admins municipales. */
  readonly esMunicipal = this.auth.isMunicipalScope();
  readonly rolesDisponibles: RolPersonal[] = this.esMunicipal
    ? (this.auth.isTitular() ? [ROL_ANALISTA, ROL_ADMIN_MUNICIPAL] : [ROL_ANALISTA])
    : [ROL_OPERADOR, ROL_ANALISTA];
  readonly nombreCompleto = nombreCompletoUsuario;

  personal: UsuarioAdmin[] = [];
  filtrados: UsuarioAdmin[] = [];

  cargando = false;
  guardando = false;
  errorCarga = '';
  busqueda = '';
  filtroEstado: 'TODOS' | 'ACTIVO' | 'INACTIVO' = 'TODOS';

  modalAbierto = false;
  form: FormPersonal = this.formVacio();
  errorModal = '';
  errores: Partial<Record<CampoForm, string>> = {};
  /** Usuario ya registrado con el DNI del formulario (p. ej. un ciudadano que pasa a ser operador). */
  existente: PersonalExistente | null = null;
  buscandoDni = false;

  readonly filtrosEstado = [
    { label: 'Todos', value: 'TODOS' as const },
    { label: 'Activos', value: 'ACTIVO' as const },
    { label: 'Inactivos', value: 'INACTIVO' as const }
  ];

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.bloquearScroll(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalAbierto) this.cerrarModal();
  }

  get nombreEntidad(): string {
    return this.auth.session()?.entidad?.razonSocial
      ?? this.auth.getTipoEntidad()
      ?? (this.esMunicipal ? 'tu municipalidad' : 'tu entidad');
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.usuarioService.listarPersonalEntidad().subscribe({
      next: rows => {
        this.ngZone.run(() => {
          this.personal = rows;
          this.aplicarFiltros();
          this.cargando = false;
          this.cdr.markForCheck();
        });
      },
      error: err => {
        this.ngZone.run(() => {
          this.errorCarga = err instanceof Error ? err.message : 'No se pudo cargar el personal.';
          this.cargando = false;
          this.cdr.markForCheck();
        });
      }
    });
  }

  aplicarFiltros(): void {
    const q = this.busqueda.trim().toLowerCase();
    this.filtrados = this.personal.filter(u => {
      if (this.filtroEstado !== 'TODOS' && (u.estado ?? '').toUpperCase() !== this.filtroEstado) {
        return false;
      }
      if (!q) return true;
      const blob = [u.dni, u.nombres, u.apellidos, u.email, u.telefono]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
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

  conteoActivos(): number {
    return this.personal.filter(u => (u.estado ?? '').toUpperCase() === 'ACTIVO').length;
  }

  conteoInactivos(): number {
    return this.personal.filter(u => (u.estado ?? '').toUpperCase() === 'INACTIVO').length;
  }

  /** Lo que se ve es lo que se exporta; el alcance (municipal o entidad) lo fija el JWT. */
  async exportar(formato: 'pdf' | 'xlsx'): Promise<void> {
    if (this.generandoReporte || !this.filtrados.length) return;
    const filas: UsuarioReporteFila[] = this.filtrados.map(u => ({
      nombre: this.nombreCompleto(u), dni: u.dni, rol: this.etiquetaRol(u), telefono: u.telefono, email: u.email,
      estado: u.estado, creadoEn: u.creadoEn
    }));
    const filtros = { estado: this.filtrosEstado.find(f => f.value === this.filtroEstado)!.label, busqueda: this.busqueda.trim() };
    const ambito = this.esMunicipal ? 'municipal' as const : 'entidad' as const;
    const institucion = this.esMunicipal ? undefined : this.auth.session()?.entidad?.razonSocial;
    this.generandoReporte = true;
    try {
      await (formato === 'pdf'
        ? this.usuarioPdf.generarPdf(ambito, filas, filtros, institucion)
        : this.usuarioExcel.generarExcel(ambito, filas, filtros, institucion));
      this.toast.success(`Reporte ${formato === 'pdf' ? 'PDF' : 'Excel'} generado.`);
    } catch {
      this.toast.error('No se pudo generar el reporte.');
    } finally {
      this.generandoReporte = false;
      this.cdr.markForCheck();
    }
  }

  etiquetaRol(u: UsuarioAdmin): string {
    // Rol de panel primero: un ciudadano incorporado como personal conserva CIUDADANO.
    const nombres = u.roles ?? [];
    const rol = nombres.find(r => r !== ROLES.CIUDADANO) ?? nombres[0];
    return (rol && ETIQUETA_ROL[rol]) ?? 'Personal';
  }

  abrirModal(): void {
    this.form = this.formVacio();
    this.existente = null;
    this.errores = {};
    this.errorModal = '';
    this.modalAbierto = true;
    this.bloquearScroll(true);
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.errores = {};
    this.errorModal = '';
    this.bloquearScroll(false);
  }

  onDniInput(value: string): void {
    const dni = value.replace(/\D/g, '').slice(0, 8);
    if (dni === this.form.dni) return;
    this.form.dni = dni;
    if (this.existente) {
      // Cambió el DNI: se descartan los datos rellenados del usuario anterior.
      this.existente = null;
      Object.assign(this.form, { nombres: '', apellidos: '', telefono: '', email: '' });
    }
    this.validarCampo('dni');
    if (dni.length === 8) void this.buscarDni(dni);
  }

  private async buscarDni(dni: string): Promise<void> {
    this.buscandoDni = true;
    try {
      const res = await firstValueFrom(this.usuarioService.buscarPersonalPorDni(dni));
      if (this.form.dni !== dni || !res.exists) return;
      this.existente = res;
      Object.assign(this.form, {
        nombres: res.firstName ?? '',
        apellidos: res.lastName ?? '',
        telefono: res.phone ?? '',
        email: res.email ?? '',
        password: ''
      });
      CAMPOS_DEL_EXISTENTE.forEach(c => delete this.errores[c]);
    } catch (err) {
      if (this.form.dni === dni) {
        this.errores['dni'] = err instanceof Error ? err.message : 'No se pudo verificar el DNI.';
      }
    } finally {
      this.buscandoDni = false;
      this.cdr.markForCheck();
    }
  }

  onTelefonoInput(value: string): void {
    this.form.telefono = formatearTelefonoAlEscribir(value);
    this.validarCampo('telefono');
  }

  validarCampo(campo: CampoForm): void {
    if (this.existente && CAMPOS_DEL_EXISTENTE.includes(campo)) {
      delete this.errores[campo];
      return;
    }
    const f = this.form;
    let msg = '';
    switch (campo) {
      case 'dni':
        if (!REGEX_DNI.test(f.dni.trim())) msg = 'El DNI debe tener 8 dígitos.';
        break;
      case 'password':
        if (f.password.length < MIN_PASSWORD) msg = `Mínimo ${MIN_PASSWORD} caracteres.`;
        break;
      case 'nombres':
        if (f.nombres.trim().length < 2 || !REGEX_NOMBRE.test(f.nombres.trim())) {
          msg = 'Ingrese nombres válidos.';
        }
        break;
      case 'apellidos':
        if (f.apellidos.trim().length < 2 || !REGEX_NOMBRE.test(f.apellidos.trim())) {
          msg = 'Ingrese apellidos válidos.';
        }
        break;
      case 'telefono': {
        const t = sanitizarTelefonoInput(f.telefono);
        if (t && !validarTelefonoPeru(t)) msg = 'Teléfono inválido.';
        break;
      }
      case 'email':
        if (f.email.trim() && !REGEX_EMAIL.test(f.email.trim())) msg = 'Email inválido.';
        break;
      case 'rolId':
        if (!f.rolId) msg = 'Seleccione un rol.';
        break;
    }
    if (msg) this.errores[campo] = msg;
    else delete this.errores[campo];
  }

  tieneError(campo: CampoForm): boolean {
    return !!this.errores[campo];
  }

  async guardar(): Promise<void> {
    (['dni', 'password', 'nombres', 'apellidos', 'telefono', 'email', 'rolId'] as CampoForm[]).forEach(
      c => this.validarCampo(c)
    );
    if (Object.keys(this.errores).length || this.buscandoDni) {
      this.errorModal = this.buscandoDni ? 'Verificando el DNI, intente de nuevo.' : 'Revise los datos del formulario.';
      return;
    }

    const f = this.form;
    const existente = this.existente;
    // A un usuario existente solo se le agrega el rol: no se envían contraseña ni contacto (el backend no los cambia).
    const body: AdminCreateUsuarioRequest = existente
      ? { dni: f.dni.trim(), firstName: f.nombres.trim() || '-', lastName: f.apellidos.trim() || '-', roleIds: [f.rolId] }
      : {
          dni: f.dni.trim(),
          password: f.password,
          firstName: f.nombres.trim(),
          lastName: f.apellidos.trim(),
          phone: sanitizarTelefonoInput(f.telefono) || undefined,
          email: f.email.trim() || undefined,
          roleIds: [f.rolId]
        };

    this.guardando = true;
    this.errorModal = '';
    try {
      await firstValueFrom(this.usuarioService.crearPersonalEntidad(body));
      this.toast.success(existente
        ? 'Rol agregado al usuario existente. Ingresa al panel con su DNI y su contraseña actual.'
        : 'Usuario creado. Ya puede ingresar al panel con su DNI.');
      this.cerrarModal();
      this.cargar();
    } catch (err) {
      this.errorModal = err instanceof Error ? err.message : 'No se pudo crear el usuario.';
      this.toast.error(this.errorModal);
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  async toggleEstado(u: UsuarioAdmin): Promise<void> {
    const actual = (u.estado ?? '').toUpperCase();
    if (actual === 'SUSPENDIDO') return;
    const siguiente: 'ACTIVO' | 'INACTIVO' = actual === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    this.guardando = true;
    try {
      await firstValueFrom(this.usuarioService.cambiarEstadoPersonalEntidad(u.id, siguiente));
      this.toast.success(siguiente === 'ACTIVO' ? 'Usuario activado.' : 'Usuario desactivado.');
      this.cargar();
    } catch (err) {
      this.toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  private formVacio(): FormPersonal {
    return {
      dni: '',
      password: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      email: '',
      rolId: this.rolesDisponibles[0].id
    };
  }

  private bloquearScroll(bloquear: boolean): void {
    if (bloquear) lockPageScroll(this.document);
    else unlockPageScroll(this.document);
  }
}
