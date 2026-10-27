import { Municipalidad } from '../../../core/models/municipalidad.model';
import { MunicipalidadService } from '../../../core/services/municipalidad';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OsmMap, GeoPunto } from '../../../shared/components/osm-map/osm-map';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';

import { AuthService } from '../../../core/auth/auth.service';
import { Entidad } from '../../../core/models/entidad.model';
import { EntidadService } from '../../../core/services/entidad';
import { RecursoOperativoService } from '../../../core/services/recurso-operativo';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { UbigeoSelect } from '../../../shared/components/ubigeo-select/ubigeo-select';
import { UbigeoService } from '../../../shared/services/ubigeo.service';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { EntidadExcelService } from '../../../core/reports/entidad/entidad-excel.service';
import { EntidadPdfService } from '../../../core/reports/entidad/entidad-pdf.service';
import { EntidadReporteFila, EntidadReporteFiltros } from '../../../core/reports/entidad/entidad-reporte.model';

type ModoModalEntidad = 'crear' | 'ver' | 'editar';
type FiltroEstadoEntidad = 'TODOS' | 'ACTIVO' | 'INACTIVO';

type CampoEntidad =
  | 'rolId'
  | 'municipalidadId'
  | 'ruc'
  | 'razonSocial'
  | 'tipoEntidad'
  | 'estado'
  | 'password'
  | 'pinSeguridad'
  | 'ubicacionBase'
  | 'ubigeo'
  | 'datosContacto'
  | 'contactoTelefono'
  | 'contactoEmail';

const TIPOS_ENTIDAD_VALIDOS: ReadonlySet<string> = new Set([
  'SALUD', 'SEGURIDAD', 'RESCATE', 'POLICIA', 'BOMBEROS', 'MUNICIPALIDAD'
]);

const TIPOS_EMERGENCIA_DISPONIBLES = [
  'INCENDIO',
  'ACCIDENTE_TRANSITO',
  'ASALTO',
  'SECUESTRO',
  'EMERGENCIA_MEDICA',
  'DESASTRE_NATURAL',
  'VIOLENCIA',
  'OTRO'
];

const ROLES_DISPONIBLES = [
  { id: '660000000000000000000003', nombre: 'ROL DE ENTIDAD' },
  // Puedes agregar más roles aquí si el backend los tiene
];

const REGEX_RUC = /^(20|10)\d{9}$/; // RUC inicia con 20 o 10 + 9 dígitos
const REGEX_ROL_ID = /^[A-Za-z0-9_-]{3,50}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Email genérico válido
const REGEX_TELEFONO = /^[\d\-]{3,}$/;
const REGEX_PIN = /^\d{4,6}$/;
const REGEX_PASSWORD_FUERTE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

@Component({
  selector: 'app-entidades',
  standalone: true,
  imports: [CommonModule, FormsModule, OsmMap, UbigeoSelect],
  templateUrl: './entidades.html',
  styleUrl: './entidades.css'
})
export class Entidades implements OnInit {

  entidades: Entidad[] = [];
  entidadesFiltradas: Entidad[] = [];

  recursosPorEntidad: Record<string, number> = {};

  cargando = false;
  guardando = false;
  errorCarga = '';

  busqueda = '';
  /** Llega desde la ficha de Municipalidades (?municipalidad=id); vacío = todas. */
  filtroMunicipalidad = '';
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  filtroEstado: FiltroEstadoEntidad = 'TODOS';

  modalAbierto = false;
  modoModal: ModoModalEntidad = 'crear';

  entidadSeleccionada: Entidad | null = null;

  ubicacionBaseTexto = '{}';
  datosContactoTexto = '{}';

  entidadForm: Entidad = this.crearFormularioVacio();

  /** Mapa de errores por campo. Se vacía cuando el campo es válido. */
  errores: Partial<Record<CampoEntidad, string>> = {};

  ejemploUbicacionJson = '{"direccion": "Av. Principal 123", "latitud": -13.0829, "longitud": -76.3706}';
  ejemploContactoJson = '{"telefono": "914 500 473", "email": "contacto@entidad.gob.pe"}';

  // ── Mapa (OpenStreetMap) ──────────────────────────────────────
  mapCenter: GeoPunto = { lat: -13.0829, lng: -76.3706 }; // Cañete, Lima
  mapMarkerPosition: GeoPunto | null = null;
  coordenadasSeleccionadas: { lat: number; lng: number } | null = null;

  // Campos de contacto individuales (más user-friendly que JSON)
  contactoTelefono = '';
  contactoEmail = '';
  contactoDireccion = '';
  
  // Campos de ubicación geográfica (se llenan automáticamente desde el mapa)
  contactoDistrito = '';
  contactoProvincia = '';
  contactoDepartamento = '';
  
  // Prefijo del RUC seleccionado por el usuario (20 o 10)
  rucPrefijo: '20' | '10' = '20';

  /** Getter: los 9 dígitos del RUC después del prefijo ("20" o "10") */
  get rucSufijo(): string {
    const ruc = this.entidadForm.ruc ?? '';
    if (ruc.startsWith('20')) {
      this.rucPrefijo = '20';
      return ruc.slice(2);
    }
    if (ruc.startsWith('10')) {
      this.rucPrefijo = '10';
      return ruc.slice(2);
    }
    return ruc;
  }

  /** Cuando el usuario escribe en el sufijo, ensamblamos el RUC completo con el prefijo seleccionado */
  onRucSufijoChange(sufijo: string): void {
    // Solo permitir dígitos
    const soloDigitos = sufijo.replace(/\D/g, '').slice(0, 9);
    this.entidadForm.ruc = this.rucPrefijo + soloDigitos;
    this.validarCampo('ruc');
  }
  
  /** Cuando el usuario cambia el prefijo (20 o 10) */
  onRucPrefijoChange(prefijo: '20' | '10'): void {
    this.rucPrefijo = prefijo;
    const sufijo = this.rucSufijo;
    this.entidadForm.ruc = prefijo + sufijo;
    this.validarCampo('ruc');
  }

  filtros: { label: string; value: FiltroEstadoEntidad }[] = [
    { label: 'TODOS', value: 'TODOS' },
    { label: 'ACTIVOS', value: 'ACTIVO' },
    { label: 'INACTIVOS', value: 'INACTIVO' }
  ];

  // Opciones para los desplegables
  readonly rolesDisponibles = ROLES_DISPONIBLES;
  readonly tiposEmergenciaDisponibles = TIPOS_EMERGENCIA_DISPONIBLES;
  tiposEmergenciaSeleccionados: string[] = [];

  /** Inyección por field para los helpers de rol — más limpio que sumar 4 params al constructor. */
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(CivicToastService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly branding = inject(ReportBrandingService);
  private readonly entidadPdf = inject(EntidadPdfService);
  private readonly entidadExcel = inject(EntidadExcelService);

  /** True solo si el usuario es SUPER_ADMIN. */
  readonly esAdmin = this.authService.isAdmin();
  /** Admin municipal: gestiona todas las entidades de su municipalidad (el backend filtra la lista). */
  readonly esAdminMunicipal = this.authService.isMunicipalidadAdmin();
  /** Solo SUPER_ADMIN elige la municipalidad de una entidad nueva. */
  municipalidades: Municipalidad[] = [];
  /** ID de la entidad del usuario (null para ADMIN). */
  readonly entidadIdActual = this.authService.getEntidadId();
  /** True si el usuario está restringido al ámbito de su entidad. */
  readonly enScopeDeEntidad = !this.esAdmin && !!this.entidadIdActual;
  /** True si estamos en el navegador (no en SSR). */
  readonly isBrowser = isPlatformBrowser(this.platformId);

  // ── Exportación de reportes ──────────────────────────────────────────────
  readonly puedeExportar = this.branding.puedeExportar();
  exportando = false;

  constructor(
    private entidadService: EntidadService,
    private municipalidadService: MunicipalidadService,
    private recursoService: RecursoOperativoService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.filtroMunicipalidad = this.route.snapshot.queryParamMap.get('municipalidad') ?? '';
    this.cargarDatos();
    if (this.esAdmin) {
      this.municipalidadService.listar().subscribe({
        next: lista => {
          this.municipalidades = lista;
          this.refrescarVista();
        },
        error: () => this.toast.error('No se pudieron cargar las municipalidades')
      });
    } else if (this.esAdminMunicipal) {
      const mid = this.authService.getMunicipalidadId();
      if (mid) this.municipalidadService.obtener(mid).subscribe({
        next: m => {
          this.municipalidades = [m];
          this.refrescarVista();
        },
        error: () => this.toast.error('No se pudo cargar su municipalidad')
      });
    }
  }

  /** Prefijo UBIGEO de la municipalidad de la entidad: limita el distrito elegible ('' = sin límite, valida el backend). */
  get prefijoUbigeo(): string {
    const id = this.entidadForm.municipalityId ?? this.authService.getMunicipalidadId();
    return UbigeoService.jurisdiccion(this.municipalidades.find(m => m.id === id));
  }

  nombreMunicipalidad(id: string | null | undefined): string {
    return this.municipalidades.find(m => m.id === id)?.businessName ?? '';
  }

  /**
   * Fuerza la detección de cambios tras una operación async.
   *
   * Garantiza el re-render incluso si el callback resuelve fuera de la zona
   * de Angular (ej. modo zoneless o respuestas HTTP vía fetch nativo).
   */
  private refrescarVista(): void {
    try {
      this.cdr.detectChanges();
    } catch {
      // El componente puede haber sido destruido; ignoramos silenciosamente.
    }
  }

  crearFormularioVacio(): Entidad {
    return {
      roleId: '660000000000000000000003',
      ruc: this.rucPrefijo, // Usar el prefijo seleccionado (20 o 10)
      businessName: '',
      entityType: '',
      password: '',
      securityPin: '',
      baseLocation: {},
      ubigeo: '',
      contactData: {},
      status: 'ACTIVO',
      createdAt: null
    };
  }

  cargarDatos(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.refrescarVista();

    // Si el usuario está limitado al alcance de su entidad, evitamos traer todas
    // las entidades del sistema: pedimos solo la suya por ID y los recursos
    // filtrados por entidad propietaria. Esto respeta el principio de mínimo
    // privilegio aunque el backend ya devuelva 403 en otras llamadas.
    const enScope = this.enScopeDeEntidad && !!this.entidadIdActual;

    const entidades$ = enScope
      ? this.entidadService.obtenerPorId(this.entidadIdActual!).pipe(
          catchError((err) => {
            console.error('Error cargando entidad del usuario:', err);
            return of(null as unknown as Entidad);
          })
        )
      : this.entidadService.listar().pipe(
          catchError((err) => {
            console.error('Error cargando entidades:', err);
            return of([] as Entidad[]);
          })
        );

    const recursos$ = enScope
      ? this.recursoService.obtenerPorEntidad(this.entidadIdActual!).pipe(
          catchError((err) => {
            console.error('❌ Error cargando recursos de la entidad:', err);
            console.error('   Status:', err.status);
            console.error('   Mensaje:', err.message);
            console.error('   URL:', err.url);
            return of([] as any[]);
          })
        )
      : this.recursoService.listar().pipe(
          catchError((err) => {
            console.error('❌ Error cargando recursos (listar todos):', err);
            console.error('   Status:', err.status);
            console.error('   Mensaje:', err.message);
            console.error('   URL:', err.url);
            return of([] as any[]);
          })
        );

    forkJoin({ entidades: entidades$, recursos: recursos$ }).subscribe({
      next: ({ entidades, recursos }) => {
        this.ngZone.run(() => {
          if (Array.isArray(entidades)) {
            this.entidades = entidades;
          } else if (entidades) {
            this.entidades = [entidades as Entidad];
          } else {
            this.entidades = [];
          }

          // Limpieza de console.logs innecesarios

          this.recursosPorEntidad = {};
          (recursos || []).forEach((recurso: any) => {
            // El backend devuelve indistintamente `entidadPropietariaId` (nuevo)
            // o `entidadPertenecienteId` (legacy). Soportamos ambos.
            const entidadId = recurso?.entidadPropietariaId ?? recurso?.entidadPertenecienteId;
            
            if (entidadId) {
              this.recursosPorEntidad[entidadId] = (this.recursosPorEntidad[entidadId] || 0) + 1;
            }
          });

          this.aplicarFiltros();
          this.cargando = false;
          this.refrescarVista();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error cargando entidades:', error);
          this.entidades = [];
          this.entidadesFiltradas = [];
          this.recursosPorEntidad = {};
          this.errorCarga = 'No se pudieron cargar las entidades.';
          this.cargando = false;
          this.refrescarVista();
        });
      }
    });
  }

  /** True si el usuario puede modificar esta entidad (CRUD). */
  puedeEditar(entidad: Entidad | null): boolean {
    if (this.esAdmin || this.esAdminMunicipal) return true;
    if (!entidad || !this.entidadIdActual) return false;
    return entidad.id === this.entidadIdActual;
  }

  /** True si puede crear nuevas entidades (SUPER_ADMIN o admin municipal). */
  get puedeCrear(): boolean {
    return this.esAdmin || this.esAdminMunicipal;
  }

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLowerCase();

    this.entidadesFiltradas = this.entidades.filter((entidad) => {
      const coincideEstado =
        this.filtroEstado === 'TODOS' ||
        entidad.status === this.filtroEstado;

      const contenido = [
        entidad.id,
        entidad.roleId,
        entidad.ruc,
        entidad.businessName,
        entidad.entityType,
        entidad.status,
        this.obtenerTelefono(entidad),
        this.obtenerEmail(entidad),
        this.obtenerDireccion(entidad)
      ]
        .join(' ')
        .toLowerCase();

      const coincideBusqueda = !texto || contenido.includes(texto);

      const coincideMunicipalidad = !this.filtroMunicipalidad || entidad.municipalityId === this.filtroMunicipalidad;

      return coincideEstado && coincideBusqueda && coincideMunicipalidad;
    });
  }

  quitarFiltroMunicipalidad(): void {
    this.filtroMunicipalidad = '';
    this.router.navigate([], { queryParams: {} });
    this.aplicarFiltros();
  }

  seleccionarFiltro(filtro: FiltroEstadoEntidad): void {
    this.filtroEstado = filtro;
    this.aplicarFiltros();
  }

  abrirCrear(): void {
    if (!this.puedeCrear) return;

    Swal.fire({
      title: '¿Agregar nueva entidad?',
      text: 'Vas a registrar una nueva entidad operativa en el sistema.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#f97316',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, agregar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.ngZone.run(() => {
        this.modoModal = 'crear';
        this.entidadSeleccionada = null;
        this.entidadForm = this.crearFormularioVacio();
        this.ubicacionBaseTexto = '{}';
        this.datosContactoTexto = '{}';
        this.contactoTelefono = '';
        this.contactoEmail = '';
        this.contactoDireccion = '';
        this.contactoDistrito = '';
        this.contactoProvincia = '';
        this.contactoDepartamento = '';
        this.coordenadasSeleccionadas = null;
        this.tiposEmergenciaSeleccionados = [];

        // Resetear marcador de Google Maps
        this.mapMarkerPosition = null;

        this.errores = {};
        this.modalAbierto = true;
        lockPageScroll(this.document);
        this.cdr.markForCheck();
        this.cdr.detectChanges();

        if (this.isBrowser) {
          // Google Maps se inicializa automáticamente en el template
          // Solo necesitamos resetear el marcador
          setTimeout(() => {
            this.mapMarkerPosition = null;
            this.coordenadasSeleccionadas = null;
          }, 100);
        }
      });
    });
  }

  abrirVer(entidad: Entidad): void {
    this.modoModal = 'ver';
    this.entidadSeleccionada = entidad;
    this.entidadForm = { ...entidad };
    this.ubicacionBaseTexto = this.convertirObjetoATexto(entidad.baseLocation);
    this.datosContactoTexto = this.convertirObjetoATexto(entidad.contactData);
    this.cargarDatosContactoDesdeEntidad(entidad);
    this.tiposEmergenciaSeleccionados = entidad.handledEmergencyTypes || [];
    this.errores = {};
    this.modalAbierto = true;
    lockPageScroll(this.document);

    if (this.isBrowser) {
      // Cargar ubicación para Google Maps en modo VER
      setTimeout(() => {
        this.cargarUbicacionParaVer(entidad);
      }, 100);
    }
  }

  abrirEditarDirecto(entidad: Entidad): void {
    if (!this.puedeEditar(entidad)) return;

    // Guardar referencia antes de mostrar la alerta
    const entidadParaEditar = { ...entidad };

    // Mostrar confirmación antes de editar
    Swal.fire({
      title: '¿Editar esta entidad?',
      text: 'Podrás modificar todos los datos de la entidad',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#f97316',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, editar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.modoModal = 'editar';
        this.entidadSeleccionada = entidadParaEditar;
        this.entidadForm = { ...entidadParaEditar };
        this.ubicacionBaseTexto = this.convertirObjetoATexto(entidadParaEditar.baseLocation);
        this.datosContactoTexto = this.convertirObjetoATexto(entidadParaEditar.contactData);
        this.cargarDatosContactoDesdeEntidad(entidadParaEditar);
        this.tiposEmergenciaSeleccionados = entidadParaEditar.handledEmergencyTypes || [];
        this.errores = {};
        this.modalAbierto = true;
        lockPageScroll(this.document);

        // Forzar detección de cambios
        this.cdr.markForCheck();
        this.refrescarVista();

        if (this.isBrowser) {
          // Cargar ubicación para Google Maps
          setTimeout(() => {
            this.cargarUbicacionDesdeEntidad(entidadParaEditar);
          }, 100);
        }
      }
    });
  }

  abrirEditarDesdeDetalle(): void {
    if (!this.entidadSeleccionada) return;
    if (!this.puedeEditar(this.entidadSeleccionada)) return;

    // Guardar referencia antes de mostrar la alerta
    const entidadParaEditar = { ...this.entidadSeleccionada };

    // Mostrar confirmación antes de editar
    Swal.fire({
      title: '¿Editar esta entidad?',
      text: 'Podrás modificar todos los datos de la entidad',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#f97316',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, editar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        // Ejecutar dentro de ngZone
        this.ngZone.run(() => {
          // Cambiar a modo editar
          this.modoModal = 'editar';
          
          // Cargar datos del formulario
          this.entidadForm = {
            ...entidadParaEditar,
            password: '',
            securityPin: ''
          };

          this.ubicacionBaseTexto = this.convertirObjetoATexto(entidadParaEditar.baseLocation);
          this.datosContactoTexto = this.convertirObjetoATexto(entidadParaEditar.contactData);
          this.cargarDatosContactoDesdeEntidad(entidadParaEditar);
          this.tiposEmergenciaSeleccionados = entidadParaEditar.handledEmergencyTypes || [];
          this.errores = {};
          
          // Resetear el marcador de Google Maps para edición
          this.mapMarkerPosition = null;
          
          // Forzar múltiples detecciones de cambios
          this.cdr.markForCheck();
          this.refrescarVista();
          
          // Esperar un tick y forzar de nuevo
          setTimeout(() => {
            this.cdr.markForCheck();
            this.refrescarVista();
          }, 0);
          
          if (this.isBrowser) {
            // Cargar ubicación para Google Maps
            setTimeout(() => {
              this.cargarUbicacionDesdeEntidad(entidadParaEditar);
            }, 100);
          }
        });
      }
    });
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    unlockPageScroll(this.document);
    this.guardando = false;
    this.entidadSeleccionada = null;
    this.entidadForm = this.crearFormularioVacio();
    this.ubicacionBaseTexto = '{}';
    this.datosContactoTexto = '{}';
    this.errores = {};
  }

  // ── Validaciones tipadas ─────────────────────────────────────────────────

  /** Devuelve el primer mensaje de error de un campo, o '' si es válido. */
  private revisarCampo(campo: CampoEntidad): string {
    switch (campo) {
      case 'rolId': {
        const valor = (this.entidadForm.roleId ?? '').trim();
        if (!valor) return 'El rol ID es obligatorio.';
        // Aceptar IDs de MongoDB (24 caracteres hexadecimales) o formato legacy
        if (valor.length === 24 && /^[0-9a-fA-F]{24}$/.test(valor)) {
          return ''; // ID de MongoDB válido
        }
        if (!REGEX_ROL_ID.test(valor)) {
          return 'Solo letras, números, guion y guion bajo (3 a 50 caracteres).';
        }
        return '';
      }
      case 'ruc': {
        const valor = (this.entidadForm.ruc ?? '').trim();
        if (!valor) return 'El RUC es obligatorio.';
        if (!/^\d+$/.test(valor)) return 'El RUC solo puede contener dígitos.';
        if (valor.length !== 11) return 'Ingresa exactamente 9 dígitos (el prefijo 20 o 10 ya está incluido).';
        if (!REGEX_RUC.test(valor)) return 'El RUC debe iniciar con 20 (Persona Jurídica) o 10 (Persona Natural).';
        return '';
      }
      case 'razonSocial': {
        const valor = (this.entidadForm.businessName ?? '').trim();
        if (!valor) return 'La razón social es obligatoria.';
        if (valor.length < 3) return 'Mínimo 3 caracteres.';
        if (valor.length > 200) return 'Máximo 200 caracteres.';
        return '';
      }
      case 'ubigeo':
        return /^\d{6}$/.test(this.entidadForm.ubigeo ?? '') ? '' : 'Elige el distrito donde opera la entidad.';
      case 'municipalidadId': {
        // Solo SUPER_ADMIN la elige al crear; al admin municipal se la asigna el backend.
        if (!this.esAdmin || this.entidadForm.id) return '';
        return this.entidadForm.municipalityId ? '' : 'Selecciona la municipalidad.';
      }
      case 'tipoEntidad': {
        const valor = (this.entidadForm.entityType ?? '').trim();
        if (!valor) return 'Selecciona un tipo de entidad.';
        if (!TIPOS_ENTIDAD_VALIDOS.has(valor)) return 'Tipo de entidad no válido.';
        return '';
      }
      case 'estado': {
        // El estado ya no se valida en el formulario, siempre es ACTIVO al crear
        return '';
      }
      case 'password': {
        const valor = this.entidadForm.password ?? '';
        // En edición es opcional (vacío = no se cambia); en crear es obligatoria.
        if (this.modoModal === 'crear') {
          if (!valor) return 'La contraseña es obligatoria al crear.';
          if (!REGEX_PASSWORD_FUERTE.test(valor)) {
            return 'Mínimo 8 caracteres con al menos una letra y un número.';
          }
          return '';
        }
        if (valor && !REGEX_PASSWORD_FUERTE.test(valor)) {
          return 'Si la cambias, mínimo 8 caracteres con letra y número.';
        }
        return '';
      }
      case 'pinSeguridad': {
        const valor = this.entidadForm.securityPin ?? '';
        if (this.modoModal === 'crear') {
          if (!valor) return 'El PIN es obligatorio al crear.';
          if (!REGEX_PIN.test(valor)) return 'El PIN debe tener entre 4 y 6 dígitos numéricos.';
          return '';
        }
        if (valor && !REGEX_PIN.test(valor)) {
          return 'El PIN debe tener entre 4 y 6 dígitos numéricos.';
        }
        return '';
      }
      case 'ubicacionBase': {
        // No es obligatorio tener una ubicación, pero si hay coordenadas debe haber dirección
        if (this.coordenadasSeleccionadas && !this.contactoDireccion.trim()) {
          return 'Si seleccionas una ubicación en el mapa, proporciona una dirección.';
        }
        return '';
      }
      case 'contactoTelefono': {
        const tel = this.contactoTelefono.trim();
        if (tel && tel.length < 3) return 'El teléfono debe tener al menos 3 dígitos.';
        if (tel && !REGEX_TELEFONO.test(tel)) {
          return 'El teléfono solo debe contener números y guiones.';
        }
        return '';
      }
      case 'contactoEmail': {
        const email = this.contactoEmail.trim();
        if (email && !REGEX_EMAIL.test(email)) {
          return 'Ingresa un correo electrónico válido (Ej: contacto@entidad.gob.pe)';
        }
        return '';
      }
      case 'datosContacto': {
        return '';
      }
    }
  }

  /** Se invoca desde el HTML al perder foco o al cambiar el valor. */
  validarCampo(campo: CampoEntidad): void {
    const mensaje = this.revisarCampo(campo);
    if (mensaje) {
      this.errores[campo] = mensaje;
    } else {
      delete this.errores[campo];
    }
  }

  /** Hay error visible para el campo. */
  tieneError(campo: CampoEntidad): boolean {
    return !!this.errores[campo];
  }

  get formularioValido(): boolean {
    const campos: CampoEntidad[] = [
      'rolId', 'municipalidadId', 'ruc', 'razonSocial', 'tipoEntidad',
      'password', 'pinSeguridad', 'ubicacionBase', 'ubigeo', 'contactoTelefono', 'contactoEmail'
    ];
    
    const errores = campos.map(c => ({ campo: c, error: this.revisarCampo(c) })).filter(e => e.error);
    
    // Limpieza de console logs
    
    return campos.every(c => !this.revisarCampo(c));
  }

  private validarJsonUbicacion(texto: string): string {
    const valor = (texto ?? '').trim();
    if (!valor || valor === '{}') return '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(valor);
    } catch {
      return 'JSON inválido. Revisa la sintaxis.';
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'Debe ser un objeto JSON.';
    }
    const obj = parsed as Record<string, unknown>;

    const lat = obj['latitud'] ?? obj['lat'] ?? obj['latitude'];
    if (lat !== undefined && lat !== null && lat !== '') {
      const n = Number(lat);
      if (Number.isNaN(n) || n < -90 || n > 90) {
        return 'La latitud debe ser un número entre -90 y 90.';
      }
    }
    const lng = obj['longitud'] ?? obj['lng'] ?? obj['lon'] ?? obj['longitude'];
    if (lng !== undefined && lng !== null && lng !== '') {
      const n = Number(lng);
      if (Number.isNaN(n) || n < -180 || n > 180) {
        return 'La longitud debe ser un número entre -180 y 180.';
      }
    }
    return '';
  }

  private validarJsonContacto(texto: string): string {
    const valor = (texto ?? '').trim();
    if (!valor || valor === '{}') return '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(valor);
    } catch {
      return 'JSON inválido. Revisa la sintaxis.';
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'Debe ser un objeto JSON.';
    }
    const obj = parsed as Record<string, unknown>;

    const email = obj['email'] ?? obj['correo'];
    if (typeof email === 'string' && email && !REGEX_EMAIL.test(email)) {
      return 'Ingresa un correo electrónico válido (Ej: contacto@entidad.gob.pe)';
    }
    const telefono = obj['telefono'] ?? obj['celular'] ?? obj['phone'];
    if (typeof telefono === 'string' && telefono && !REGEX_TELEFONO.test(telefono)) {
      return 'El teléfono debe tener entre 7 y 20 caracteres (dígitos, espacios, +, -, paréntesis).';
    }
    return '';
  }

  guardar(): void {
    if (this.modoModal === 'ver') return;

    if (!this.validarFormulario()) {
      return;
    }

    const entidadParaGuardar = this.prepararEntidadParaEnviar();

    // Confirmación antes de enviar
    const esCrear = this.modoModal === 'crear';
    Swal.fire({
      title: '¿Confirmar registro?',
      html: `
        <p class="text-slate-600 text-sm">${esCrear
          ? '¿Ya revisaste todos los datos ingresados? Una vez creada la entidad podrás editarla desde el panel.'
          : '¿Ya revisaste los cambios realizados? Se actualizarán los datos de la entidad.'}
        </p>`,
      icon: 'info',
      showCancelButton: true,
      confirmButtonColor: '#f97316',
      cancelButtonColor: '#64748b',
      confirmButtonText: esCrear ? 'Sí, registrar entidad' : 'Sí, guardar cambios',
      cancelButtonText: 'Revisar nuevamente',
      reverseButtons: true
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.guardando = true;

    if (this.modoModal === 'crear') {
      console.log('📤 Enviando creación al backend...');
      this.entidadService.crear(entidadParaGuardar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.cargarDatos();
          this.toast.success('Entidad registrada correctamente.');
        },
        error: (error) => {
          console.error('Error al crear entidad:', error);
          this.guardando = false;
          this.toast.error('No se pudo registrar la entidad. Revise los datos.');
        }
      });
    }

    if (this.modoModal === 'editar' && this.entidadForm.id) {
      console.log('📤 Enviando actualización al backend...');
      this.entidadService.actualizar(this.entidadForm.id, entidadParaGuardar).subscribe({
        next: () => {
          this.guardando = false;
          this.cerrarModal();
          this.cargarDatos();
          this.toast.success('Entidad actualizada.');
        },
        error: (error) => {
          console.error('Error al editar entidad:', error);
          this.guardando = false;
          this.toast.error('No se pudo actualizar la entidad.');
        }
      });
    }
  });
}

  /** Reejecuta todas las validaciones y deja el mapa de errores listo para mostrar. */
  validarFormulario(): boolean {
    const campos: CampoEntidad[] = [
      'rolId', 'municipalidadId', 'ruc', 'razonSocial', 'tipoEntidad',
      'password', 'pinSeguridad', 'ubicacionBase', 'ubigeo', 'contactoTelefono', 'contactoEmail'
    ];
    campos.forEach(c => this.validarCampo(c));

    const primerError = campos.find(c => this.errores[c]);
    if (primerError) {
      this.toast.error(this.errores[primerError] as string);
      return false;
    }
    return true;
  }

  cambiarEstado(entidad: Entidad): void {
    if (!entidad.id) return;
    if (!this.puedeEditar(entidad)) return;

    const esDesactivacion = entidad.status === 'ACTIVO';
    const nuevoEstado = esDesactivacion ? 'INACTIVO' : 'ACTIVO';
    const accion = esDesactivacion ? 'desactivar' : 'reactivar';
    
    Swal.fire({
      title: `¿${accion.charAt(0).toUpperCase() + accion.slice(1)} entidad?`,
      html: `
        <p class="text-slate-700 mb-2">
          <strong>${entidad.businessName}</strong>
        </p>
        <p class="text-sm text-slate-600">
          ${esDesactivacion 
            ? 'La entidad quedará <strong>INACTIVA</strong> (eliminación lógica). Sus recursos también se desactivarán.' 
            : 'La entidad será <strong>REACTIVADA</strong> y podrá volver a operar.'}
        </p>
      `,
      icon: esDesactivacion ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: esDesactivacion ? '#ef4444' : '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: `Sí, ${accion}`,
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        const operacion = esDesactivacion
          ? this.entidadService.desactivar(entidad.id!)
          : this.entidadService.activar(entidad.id!);

        operacion.subscribe({
          next: () => {
            this.ngZone.run(() => {
              this.cargarDatos();
              
              Swal.fire({
                title: esDesactivacion ? '¡Entidad desactivada!' : '¡Entidad reactivada!',
                html: `
                  <p class="text-slate-700">
                    <strong>${entidad.businessName}</strong>
                  </p>
                  <p class="text-sm text-slate-600 mt-2">
                    ${esDesactivacion 
                      ? 'La entidad ha sido desactivada correctamente (eliminación lógica)' 
                      : 'La entidad ha sido reactivada y puede operar nuevamente'}
                  </p>
                `,
                icon: 'success',
                confirmButtonColor: '#0ea5e9',
                confirmButtonText: 'Aceptar',
                timer: 3000
              });
            });
          },
          error: (error) => {
            this.ngZone.run(() => {
              console.error(`Error al ${accion} entidad:`, error);
              
              Swal.fire({
                title: 'Error',
                text: `No se pudo ${accion} la entidad. ${error.error?.message || ''}`,
                icon: 'error',
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Aceptar'
              });
              
              this.refrescarVista();
            });
          }
        });
      }
    });
  }

  obtenerRecursosEntidad(entidad: Entidad): number {
    if (!entidad.id) return 0;
    return this.recursosPorEntidad[entidad.id] || 0;
  }

  obtenerTelefono(entidad: Entidad): string {
    return String(
      entidad.contactData?.['telefono'] ||
      entidad.contactData?.['celular'] ||
      entidad.contactData?.['phone'] ||
      '-'
    );
  }

  obtenerEmail(entidad: Entidad): string {
    return String(
      entidad.contactData?.['email'] ||
      entidad.contactData?.['correo'] ||
      '-'
    );
  }

  obtenerDireccion(entidad: Entidad): string {
    return String(
      entidad.baseLocation?.['direccion'] ||
      entidad.baseLocation?.['address'] ||
      '-'
    );
  }

  obtenerLatitud(entidad: Entidad): string {
    return String(
      entidad.baseLocation?.['latitud'] ||
      entidad.baseLocation?.['lat'] ||
      entidad.baseLocation?.['latitude'] ||
      '-'
    );
  }

  obtenerLongitud(entidad: Entidad): string {
    return String(
      entidad.baseLocation?.['longitud'] ||
      entidad.baseLocation?.['lng'] ||
      entidad.baseLocation?.['lon'] ||
      entidad.baseLocation?.['longitude'] ||
      '-'
    );
  }

  convertirObjetoATexto(objeto: Record<string, unknown> | null | undefined): string {
    if (!objeto) return '{}';
    return JSON.stringify(objeto, null, 2);
  }

  convertirTextoAObjeto(texto: string): Record<string, unknown> {
    try {
      const valor = JSON.parse(texto || '{}');
      return valor && typeof valor === 'object' ? valor : {};
    } catch {
      return {};
    }
  }

  formatearTexto(valor: string | null | undefined): string {
    if (!valor) return '-';

    return valor
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, letra => letra.toUpperCase());
  }

  obtenerClaseTipo(tipo: string): string {
    switch (tipo) {
      case 'SALUD':
        return 'civic-badge civic-badge--success';
      case 'SEGURIDAD':
      case 'POLICIA':
        return 'civic-badge civic-badge--primary';
      case 'RESCATE':
      case 'BOMBEROS':
        return 'civic-badge civic-badge--warning';
      default:
        return 'civic-badge civic-badge--teal';
    }
  }

  trackByEntidadId(index: number, entidad: Entidad): string {
    return entidad.id || entidad.ruc || String(index);
  }

  /**
   * Maneja el cambio de estado de un checkbox de tipo de emergencia.
   */
  toggleTipoEmergencia(tipo: string, event: any): void {
    if (event.target.checked) {
      if (!this.tiposEmergenciaSeleccionados.includes(tipo)) {
        this.tiposEmergenciaSeleccionados.push(tipo);
      }
    } else {
      this.tiposEmergenciaSeleccionados = this.tiposEmergenciaSeleccionados.filter(t => t !== tipo);
    }
  }

  /**
   * Verifica si un tipo de emergencia está seleccionado.
   */
  esTipoEmergenciaSeleccionado(tipo: string): boolean {
    return this.tiposEmergenciaSeleccionados.includes(tipo);
  }

  /**
   * Formatea el texto de tipo de emergencia para mostrarlo.
   */
  formatearTipoEmergencia(tipo: string): string {
    return tipo.replace(/_/g, ' ').replace(/\b\w/g, letra => letra.toUpperCase());
  }

  // ── Métodos del mapa ──────────────────────────────────

  /**
   * Maneja el clic en el mapa para seleccionar ubicación.
   */
  onMapClick({ lat, lng }: GeoPunto): void {
    if (this.modoModal === 'ver') return;

    // Actualizar posición del marcador
    this.mapMarkerPosition = { lat, lng };

    // Guardar coordenadas
    this.coordenadasSeleccionadas = { lat, lng };

    // ✅ Forzar detección inmediata
    this.cdr.markForCheck();

    // Obtener dirección desde coordenadas
    this.obtenerDireccionDesdeLatLng(lat, lng);
  }

  /**
   * Carga la ubicación en el mapa para el modo VER (solo lectura).
   */
  private cargarUbicacionParaVer(entidad: Entidad): void {
    if (!entidad.baseLocation) return;

    const lat = Number(
      entidad.baseLocation['latitud'] ||
      entidad.baseLocation['lat'] ||
      entidad.baseLocation['latitude'] ||
      0
    );

    const lng = Number(
      entidad.baseLocation['longitud'] ||
      entidad.baseLocation['lng'] ||
      entidad.baseLocation['lon'] ||
      entidad.baseLocation['longitude'] ||
      0
    );

    if (lat !== 0 && lng !== 0) {
      this.coordenadasSeleccionadas = { lat, lng };
      this.mapMarkerPosition = { lat, lng };
      this.mapCenter = { lat, lng };
    } else {
      this.coordenadasSeleccionadas = null;
      this.mapMarkerPosition = null;
    }
  }

  /**
   * Obtiene la dirección a partir de coordenadas usando Nominatim (geocoding gratuito).
   * Extrae automáticamente: dirección, distrito, provincia y departamento.
   */
  private obtenerDireccionDesdeLatLng(lat: number, lng: number): void {
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
      .then(response => response.json())
      .then(data => {
        this.ngZone.run(() => {
          // Dirección completa
          this.contactoDireccion = data.display_name || '';
          
          // Extraer campos geográficos del objeto "address"
          if (data.address) {
            // Distrito (city, town, village, etc.)
            this.contactoDistrito = data.address.city || 
                                   data.address.town || 
                                   data.address.village || 
                                   data.address.municipality || 
                                   data.address.suburb ||
                                   data.address.neighbourhood ||
                                   data.address.hamlet ||
                                   '';
            
            // Provincia (region en Perú, county en otros países)
            this.contactoProvincia = data.address.region ||
                                    data.address.county || 
                                    data.address.state_district ||
                                    '';
            
            // Departamento
            this.contactoDepartamento = data.address.state || '';
          }
          
          // Forzar detección de cambios
          this.cdr.markForCheck();
          this.refrescarVista();
          
          setTimeout(() => {
            this.cdr.markForCheck();
            this.refrescarVista();
          }, 0);
        });
      })
      .catch(error => console.error('Error geocoding:', error));
  }

  /**
   * Carga los datos de contacto desde una entidad a los campos individuales.
   */
  private cargarDatosContactoDesdeEntidad(entidad: Entidad): void {
    if (!entidad.contactData) {
      this.contactoTelefono = '';
      this.contactoEmail = '';
    } else {
      this.contactoTelefono = String(
        entidad.contactData['telefono'] ||
        entidad.contactData['celular'] ||
        entidad.contactData['phone'] ||
        ''
      );

      this.contactoEmail = String(
        entidad.contactData['email'] ||
        entidad.contactData['correo'] ||
        ''
      );
    }

    // ✅ Cargar campos geográficos desde ubicacion_base (sin fallbacks hardcodeados)
    if (entidad.baseLocation) {
      this.contactoDistrito = String(entidad.baseLocation['distrito'] || '');
      this.contactoProvincia = String(entidad.baseLocation['provincia'] || '');
      this.contactoDepartamento = String(entidad.baseLocation['departamento'] || '');
    } else {
      this.contactoDistrito = '';
      this.contactoProvincia = '';
      this.contactoDepartamento = '';
    }
  }

  /**
   * Carga la ubicación desde una entidad al mapa.
   */
  private cargarUbicacionDesdeEntidad(entidad: Entidad): void {
    if (!entidad.baseLocation) {
      this.contactoDireccion = '';
      this.coordenadasSeleccionadas = null;
      this.mapMarkerPosition = null;
      return;
    }

    const lat = Number(
      entidad.baseLocation['latitud'] ||
      entidad.baseLocation['lat'] ||
      entidad.baseLocation['latitude'] ||
      0
    );

    const lng = Number(
      entidad.baseLocation['longitud'] ||
      entidad.baseLocation['lng'] ||
      entidad.baseLocation['lon'] ||
      entidad.baseLocation['longitude'] ||
      0
    );

    this.contactoDireccion = String(
      entidad.baseLocation['direccion'] ||
      entidad.baseLocation['address'] ||
      ''
    );

    if (lat !== 0 && lng !== 0 && this.isBrowser) {
      // Actualizar coordenadas y marcador para Google Maps
      this.coordenadasSeleccionadas = { lat, lng };
      this.mapMarkerPosition = { lat, lng };
      this.mapCenter = { lat, lng };
    } else {
      this.coordenadasSeleccionadas = null;
      this.mapMarkerPosition = null;
    }
  }

  /**
   * Prepara los datos de contacto y ubicación para enviar al servidor.
   */
  prepararEntidadParaEnviar(): Entidad {
    const entidad: Entidad = {
      roleId: this.entidadForm.roleId.trim(),
      ruc: this.entidadForm.ruc.trim(),
      businessName: this.entidadForm.businessName.trim(),
      entityType: this.entidadForm.entityType.trim(),
      status: this.modoModal === 'crear' ? 'ACTIVO' : this.entidadForm.status.trim(),
      baseLocation: this.construirUbicacionBase(),
      ubigeo: this.entidadForm.ubigeo ?? '',
      municipalityId: this.entidadForm.municipalityId ?? null,
      contactData: this.construirDatosContacto(),
      handledEmergencyTypes: this.tiposEmergenciaSeleccionados.length > 0 
        ? this.tiposEmergenciaSeleccionados 
        : undefined
    };

    if (this.modoModal === 'editar' && this.entidadForm.id) {
      entidad.id = this.entidadForm.id;
    }

    if (this.entidadForm.password?.trim()) {
      entidad.password = this.entidadForm.password.trim();
    }

    if (this.entidadForm.securityPin?.trim()) {
      entidad.securityPin = this.entidadForm.securityPin.trim();
    }

    return entidad;
  }

  /**
   * Construye el objeto de ubicación base desde el mapa y dirección.
   */
  private construirUbicacionBase(): Record<string, unknown> {
    if (!this.coordenadasSeleccionadas && !this.contactoDireccion.trim()) {
      return {};
    }

    const ubicacion: Record<string, unknown> = {};

    if (this.contactoDireccion.trim()) {
      ubicacion['direccion'] = this.contactoDireccion.trim();
    }

    if (this.coordenadasSeleccionadas) {
      ubicacion['latitud'] = this.coordenadasSeleccionadas.lat;
      ubicacion['longitud'] = this.coordenadasSeleccionadas.lng;
    }

    // ✅ NUEVO: Agregar distrito, provincia, departamento
    if (this.contactoDistrito.trim()) {
      ubicacion['distrito'] = this.contactoDistrito.trim();
    }
    
    if (this.contactoProvincia.trim()) {
      ubicacion['provincia'] = this.contactoProvincia.trim();
    }
    
    if (this.contactoDepartamento.trim()) {
      ubicacion['departamento'] = this.contactoDepartamento.trim();
    }

    return ubicacion;
  }

  /**
   * Construye el objeto de datos de contacto desde los campos individuales.
   */
  private construirDatosContacto(): Record<string, unknown> {
    const contacto: Record<string, unknown> = {};

    if (this.contactoTelefono.trim()) {
      contacto['telefono'] = this.contactoTelefono.trim();
    }

    if (this.contactoEmail.trim()) {
      contacto['email'] = this.contactoEmail.trim();
    }

    return contacto;
  }

  /**
   * Busca una dirección y centra el mapa en ella usando Nominatim.
   * Solo centra el mapa. El usuario debe hacer clic para capturar datos geográficos.
   */
  async buscarDireccion(): Promise<void> {
    if (!this.contactoDireccion.trim() || !this.isBrowser) return;

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(this.contactoDireccion)}&format=json&limit=1`);
      const data = await response.json();
      
      if (data && data[0]) {
        this.ngZone.run(() => {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);

          // Centrar mapa
          this.mapCenter = { lat, lng };
          this.mapMarkerPosition = { lat, lng };
          this.coordenadasSeleccionadas = { lat, lng };

          this.refrescarVista();
        });
      } else {
        alert('No se pudo encontrar la dirección. Intenta con otro formato.');
      }
    } catch (error) {
      console.error('❌ Error buscando dirección:', error);
      alert('Error al buscar la dirección.');
    }
  }

  // ── Exportar reportes (PDF / Excel) ──────────────────────────────────────

  /** Genera las filas del reporte con los nombres ya resueltos */
  private filasReporte(): EntidadReporteFila[] {
    return this.entidadesFiltradas.map(e => {
      const ubicacion = e.baseLocation || {};
      const contacto = e.contactData || {};
      
      return {
        ruc: e.ruc || '-',
        razonSocial: e.businessName || '-',
        tipoEntidad: this.formatearTexto(e.entityType),
        estado: this.formatearTexto(e.status),
        telefono: String(contacto['telefono'] || contacto['celular'] || contacto['phone'] || '-'),
        email: String(contacto['email'] || contacto['correo'] || '-'),
        direccion: String(ubicacion['direccion'] || ubicacion['address'] || '-'),
        distrito: String(ubicacion['distrito'] || '-'),
        provincia: String(ubicacion['provincia'] || '-'),
        departamento: String(ubicacion['departamento'] || '-'),
        municipalidad: this.nombreMunicipalidad(e.municipalityId),
        fechaRegistro: e.createdAt
      };
    });
  }

  /** Filtros aplicados al reporte */
  private filtrosReporte(): EntidadReporteFiltros {
    return {
      estado: this.filtroEstado === 'TODOS' ? 'Todos' : this.formatearTexto(this.filtroEstado),
      tipoEntidad: 'Todos' // Se puede agregar filtro por tipo si se requiere
    };
  }

  exportarExcel(): Promise<void> {
    return this.exportar(
      () => this.entidadExcel.generarExcel(this.filasReporte(), this.filtrosReporte()),
      'Excel'
    );
  }

  exportarPdf(): Promise<void> {
    return this.exportar(
      () => this.entidadPdf.generarPdf(this.filasReporte(), this.filtrosReporte()),
      'PDF'
    );
  }

  private async exportar(generar: () => Promise<void>, formato: string): Promise<void> {
    if (this.exportando || !this.entidadesFiltradas.length) return;
    this.exportando = true;
    try {
      await generar();
      this.toast.success(`${formato} exportado con éxito.`);
    } catch (error) {
      console.error(`Error al generar ${formato}:`, error);
      this.toast.error(`No se pudo generar el ${formato}.`);
    } finally {
      this.exportando = false;
    }
  }
}
