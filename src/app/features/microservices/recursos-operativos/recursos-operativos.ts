import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { RecursoOperativo, Location } from '../../../core/models/recurso-operativo.model';
import { Catalogo } from '../../../core/models/catalogo.model';
import { Entidad } from '../../../core/models/entidad.model';

import { RecursoOperativoService } from '../../../core/services/recurso-operativo';
import { CatalogoService } from '../../../core/services/catalogo';
import { EntidadService } from '../../../core/services/entidad';
import { MaintenanceOrderService } from '../../../core/services/maintenance-order.service';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { RecursoExcelService } from '../../../core/reports/recurso/recurso-excel.service';
import { RecursoPdfService } from '../../../core/reports/recurso/recurso-pdf.service';
import { RecursoReporteFila, RecursoReporteFiltros } from '../../../core/reports/recurso/recurso-reporte.model';

type ModoModal = 'crear' | 'ver' | 'editar';

type FiltroEstado =
    | 'TODOS'
    | 'DISPONIBLE'
    | 'OCUPADO'
    | 'EN_MANTENIMIENTO'
    | 'FUERA_SERVICIO'
    | 'DADO_DE_BAJA';

type CampoRecurso =
    | 'entidadId'
    | 'key'
    | 'name'
    | 'type'
    | 'category'
    | 'identificador'
    | 'encargadoNombre'
    | 'estadoDisponibilidad'
    | 'subestadoOperativo';

const REGEX_IDENTIFICADOR = /^[A-Za-z0-9][A-Za-z0-9\-_]{1,29}$/;
const REGEX_NOMBRE_PERSONA = /^[A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ .'\-]{1,99}$/;

@Component({
    selector: 'app-recursos-operativos',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './recursos-operativos.html',
    styleUrl: './recursos-operativos.css'
})
export class RecursosOperativos implements OnInit {

    recursos: RecursoOperativo[] = [];
    recursosFiltrados: RecursoOperativo[] = [];

    catalogos: Catalogo[] = [];
    entidades: Entidad[] = [];

    cargando = false;
    guardando = false;

    busqueda = '';
    filtroActivo: FiltroEstado = 'TODOS';

    modalAbierto = false;
    modoModal: ModoModal = 'crear';

    recursoSeleccionado: RecursoOperativo | null = null;
    recursoForm: RecursoOperativoForm = this.crearFormularioVacio();

    erroresRecurso: Partial<Record<CampoRecurso, string>> = {};

    // Selector de Catálogos Mejorado (Estilo Escalamiento de Emergencias)
    busquedaCatalogo: string = '';
    filtroTipoRecursoCatalogo: 'TODOS' | 'UNIDAD_MOVIL' | 'UNIDAD_PERSONAL' | 'UNIDAD_FIJA' = 'TODOS';
    selectorCatalogoExpandido: boolean = true;

    menuEstadoAbierto: string | null = null;
    cambiandoEstado: string | null = null;

    toast: { mensaje: string; tipo: 'exito' | 'error' | 'info' } | null = null;
    private toastTimer: ReturnType<typeof setTimeout> | null = null;

    generandoReporte = false;

    readonly opcionesEstado: { value: string; label: string; clase: string }[] = [
        { value: 'DISPONIBLE',           label: '🟢 Disponible',             clase: 'text-emerald-600 hover:bg-emerald-50' },
        { value: 'OCUPADO',               label: '🟠 Ocupado',                 clase: 'text-amber-600 hover:bg-amber-50' },
        { value: 'EN_MANTENIMIENTO',     label: '🔴 En mantenimiento',       clase: 'text-rose-600 hover:bg-rose-50' },
        { value: 'FUERA_DE_SERVICIO',     label: '⚫ Fuera de servicio',      clase: 'text-slate-600 hover:bg-slate-50' },
        { value: 'RESERVADO',            label: '🟡 Reservado',              clase: 'text-indigo-600 hover:bg-indigo-50' }
    ];

    private readonly authService = inject(AuthService);
    private readonly civicToast = inject(CivicToastService);
    private readonly branding = inject(ReportBrandingService);
    private readonly recursoPdf = inject(RecursoPdfService);
    private readonly recursoExcel = inject(RecursoExcelService);
    private readonly maintenanceService = inject(MaintenanceOrderService);

    // Órdenes de mantenimiento activas en Flota: resourceId -> orderCode
    ordenesActivasPorRecurso = new Map<string, string>();

    readonly esAdmin = this.authService.isAdmin();
    readonly entidadIdActual = this.authService.getEntidadId();
    readonly enScopeDeEntidad = !this.esAdmin && !!this.entidadIdActual;

    constructor(
        private recursoService: RecursoOperativoService,
        private catalogoService: CatalogoService,
        private entidadService: EntidadService,
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone
    ) { }

    ngOnInit(): void {
        this.cargarDatosIniciales();
    }

    private refrescarVista(): void {
        try { this.cdr.detectChanges(); } catch { /* componente destruido */ }
    }

    puedeEditar(recurso: RecursoOperativo | null): boolean {
        if (this.esAdmin) return true;
        if (!recurso || !this.entidadIdActual) return false;
        const entId = this.resolverEntidadId(recurso);
        return entId === this.entidadIdActual;
    }

    tieneOrdenActiva(recursoId?: string | null): boolean {
        if (!recursoId) return false;
        return this.ordenesActivasPorRecurso.has(recursoId);
    }

    obtenerCodigoOrdenActiva(recursoId?: string | null): string {
        if (!recursoId) return '';
        return this.ordenesActivasPorRecurso.get(recursoId) || '';
    }

    get puedeCrear(): boolean {
        return this.esAdmin || this.authService.isEntidadAdmin();
    }

    // %% Carga de datos %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    cargarDatosIniciales(): void {
        this.cargando = true;
        this.refrescarVista();

        const enScope = this.enScopeDeEntidad && !!this.entidadIdActual;

        const recursos$ = enScope
            ? this.recursoService.obtenerPorEntidad(this.entidadIdActual!).pipe(catchError(() => of([] as RecursoOperativo[])))
            : this.recursoService.listar().pipe(catchError(() => of([] as RecursoOperativo[])));

        const entidades$ = enScope
            ? this.entidadService.obtenerPorId(this.entidadIdActual!).pipe(
                    map(e => e ? [e] : []),
                    catchError(() => of([] as Entidad[]))
                )
            : this.entidadService.listar().pipe(catchError(() => of([] as Entidad[])));

        forkJoin({
            recursos: recursos$,
            catalogos: this.catalogoService.listar().pipe(catchError(() => of([] as Catalogo[]))),
            entidades: entidades$,
            ordenes: this.maintenanceService.getAll().pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ recursos, catalogos, entidades, ordenes }) => {
                this.ngZone.run(() => {
                    this.recursos = recursos || [];
                    this.catalogos = catalogos || [];
                    this.entidades = entidades || [];

                    const activeMap = new Map<string, string>();
                    for (const o of ordenes || []) {
                        const status = (o.orderStatus || '').toUpperCase();
                        if (status !== 'FINALIZADA' && status !== 'COMPLETED' && status !== 'CANCELADA' && status !== 'CANCELLED') {
                            activeMap.set(o.resourceId, o.orderCode);
                        }
                    }
                    this.ordenesActivasPorRecurso = activeMap;

                    this.aplicarFiltros();
                    this.cargando = false;
                    this.refrescarVista();
                });
            },
            error: () => {
                this.ngZone.run(() => {
                    this.recursos = [];
                    this.recursosFiltrados = [];
                    this.catalogos = [];
                    this.entidades = [];
                    this.cargando = false;
                    this.refrescarVista();
                });
            }
        });
    }

    cargarDatosMaestros(): Observable<{ catalogos: Catalogo[]; entidades: Entidad[] }> {
        const enScope = this.enScopeDeEntidad && !!this.entidadIdActual;

        const entidades$ = enScope
            ? this.entidadService.obtenerPorId(this.entidadIdActual!).pipe(
                    map(e => e ? [e] : []),
                    catchError(() => of([] as Entidad[]))
                )
            : this.entidadService.listar().pipe(catchError(() => of([] as Entidad[])));

        return forkJoin({
            catalogos: this.catalogoService.listar().pipe(catchError(() => of([] as Catalogo[]))),
            entidades: entidades$
        }).pipe(
            map(({ catalogos, entidades }) => {
                this.catalogos = catalogos || [];
                this.entidades = entidades || [];
                return { catalogos: this.catalogos, entidades: this.entidades };
            })
        );
    }

    // %% Formulario %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    crearFormularioVacio(): RecursoOperativoForm {
        return {
            entidadId: '',
            catalogoId: '',
            // Campos de catálogo editables
            key: '',
            name: '',
            type: 'UNIDAD_MOVIL',
            category: 'SEGURIDAD',
            icon: 'icono_patrulla.png',
            // Campos operativos
            identificador: '',
            encargadoNombre: '',
            estadoDisponibilidad: 'DISPONIBLE',
            subestadoOperativo: 'ASIGNADO_PATRULLAJE',
            estado: 'ACTIVO',
            zonaNombre: '',
            zonaCodigo: '',
            zonaDistrito: ''
        };
    }

    // %% Normalización del schema de BD %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    /** Resuelve el ID de entidad sea cual sea el campo que venga del backend */
    resolverEntidadId(r: RecursoOperativo): string {
        return this.normalizarId((r as any).entityId ?? (r as any).entidad_id ?? (r as any).entidadId ?? (r as any).entidadPropietariaId);
    }

    /** Resuelve el ID de catálogo sea cual sea el campo */
    resolverCatalogoId(r: RecursoOperativo): string {
        return this.normalizarId((r as any).catalogo_id ?? (r as any).catalogoId);
    }

    /** Resuelve estado_disponibilidad / estadoDisponibilidad / availability */
    resolverEstado(r: RecursoOperativo): string {
        return String((r as any).availability ?? (r as any).estado_disponibilidad ?? (r as any).estadoDisponibilidad ?? '');
    }

    /** Resuelve subestado_operativo / subestadoOperativo / statusDetail */
    resolverSubestado(r: RecursoOperativo): string {
        return String((r as any).statusDetail ?? (r as any).subestado_operativo ?? (r as any).subestadoOperativo ?? '');
    }

    /** Resuelve encargado_nombre / encargadoNombre / responsible */
    resolverEncargado(r: RecursoOperativo): string {
        return String((r as any).responsible ?? (r as any).encargado_nombre ?? (r as any).encargadoNombre ?? '');
    }

    /** Resuelve la zona embebida - compatible con ambos formatos */
    resolverZona(r: RecursoOperativo): Location | null {
        // Primero intentar con los campos nuevos del API
        if (r.location) {
            return {
                zone: r.location.zone ?? null,
                code: r.location.code ?? null,
                district: r.location.district ?? null
            };
        }
        
        // Luego intentar con campos legacy (zonaOperativa)
        const zonaLegacy = (r as any).zona_operativa ?? (r as any).zonaOperativa;
        if (zonaLegacy) {
            return {
                zone: zonaLegacy.nombre ?? zonaLegacy.zone ?? null,
                code: zonaLegacy.codigo ?? zonaLegacy.code ?? null,
                district: zonaLegacy.distrito ?? zonaLegacy.district ?? null
            };
        }
        
        return null;
    }

    normalizarRecursoAForm(r: RecursoOperativo): RecursoOperativoForm {
        const zona = this.resolverZona(r);
        return {
            entidadId: this.resolverEntidadId(r),
            catalogoId: this.resolverCatalogoId(r),
            // Campos de catálogo
            key: r.key || '',
            name: r.name || '',
            type: r.type || 'UNIDAD_MOVIL',
            category: r.category || 'SEGURIDAD',
            icon: r.icon || 'icono_patrulla.png',
            // Campos operativos
            identificador: r.identificador || r.internalCode || '',
            encargadoNombre: this.resolverEncargado(r),
            estadoDisponibilidad: this.resolverEstado(r) || 'DISPONIBLE',
            subestadoOperativo: this.resolverSubestado(r) || 'ASIGNADO_PATRULLAJE',
            estado: r.estado || 'ACTIVO',
            zonaNombre: zona?.zone ?? '',
            zonaCodigo: zona?.code ?? '',
            zonaDistrito: zona?.district ?? ''
        };
    }

    // %% Filtros %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    aplicarFiltros(): void {
        const texto = this.busqueda.trim().toLowerCase();

        this.recursosFiltrados = this.recursos.filter(r => {
            const estado = this.resolverEstado(r);
            const zona = this.resolverZona(r);

            const coincideEstado = this.filtroActivo === 'TODOS' || estado === this.filtroActivo;

            const contenido = [
                r.id, r.identificador, r.internalCode,
                this.resolverEncargado(r),
                this.resolverCatalogoId(r),
                this.obtenerEtiquetaVisualCatalogo(this.resolverCatalogoId(r), r),
                this.resolverEntidadId(r),
                this.obtenerRazonSocialEntidad(this.resolverEntidadId(r)),
                zona?.zone, zona?.code, zona?.district,
                estado, this.resolverSubestado(r), r.estado
            ].join(' ').toLowerCase();

            return coincideEstado && (!texto || contenido.includes(texto));
        });
    }

    seleccionarFiltro(filtro: FiltroEstado): void {
        this.filtroActivo = filtro;
        this.aplicarFiltros();
    }

    contarPorEstado(estado: string): number {
        return this.recursos.filter(r => this.resolverEstado(r) === estado).length;
    }

    // %% Modal %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    abrirCrear(): void {
        if (!this.puedeCrear) return;

        this.cargarDatosMaestros().subscribe({
            next: () => {
                this.modoModal = 'crear';
                this.recursoSeleccionado = null;
                this.recursoForm = this.crearFormularioVacio();
                if (this.entidadIdActual) {
                    this.recursoForm.entidadId = this.entidadIdActual;
                }
                this.busquedaCatalogo = '';
                this.filtroTipoRecursoCatalogo = 'TODOS';
                this.selectorCatalogoExpandido = true;
                this.erroresRecurso = {};
                this.modalAbierto = true;
                this.refrescarVista();
            },
            error: () => this.civicToast.error('Error al cargar datos para crear recurso.')
        });
    }

    abrirVer(recurso: RecursoOperativo): void {
        this.cargarDatosMaestros().subscribe({
            next: () => {
                this.modoModal = 'ver';
                this.recursoSeleccionado = recurso;
                this.recursoForm = this.normalizarRecursoAForm(recurso);
                this.selectorCatalogoExpandido = false;
                this.modalAbierto = true;
                this.refrescarVista();
            },
            error: () => this.civicToast.error('Error al cargar detalle del recurso.')
        });
    }

    abrirEditarDirecto(recurso: RecursoOperativo): void {
        if (!this.puedeEditar(recurso)) return;

        this.cargarDatosMaestros().subscribe({
            next: () => {
                this.modoModal = 'editar';
                this.recursoSeleccionado = recurso;
                this.recursoForm = this.normalizarRecursoAForm(recurso);
                this.selectorCatalogoExpandido = false;
                this.erroresRecurso = {};
                this.modalAbierto = true;
                this.refrescarVista();
            },
            error: () => this.civicToast.error('Error al cargar datos para editar recurso.')
        });
    }

    abrirEditarDesdeDetalle(): void {
        if (!this.recursoSeleccionado || !this.puedeEditar(this.recursoSeleccionado)) return;
        this.modoModal = 'editar';
        this.selectorCatalogoExpandido = false;
        this.erroresRecurso = {};
        this.refrescarVista();
    }

    cerrarModal(): void {
        this.modalAbierto = false;
        this.guardando = false;
        this.recursoSeleccionado = null;
        this.recursoForm = this.crearFormularioVacio();
        this.busquedaCatalogo = '';
        this.filtroTipoRecursoCatalogo = 'TODOS';
        this.selectorCatalogoExpandido = true;
        this.erroresRecurso = {};
    }

    // %% Guardar %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    guardar(): void {
        if (this.modoModal === 'ver') return;

        // Si entidadId está vacía pero tenemos entidadIdActual, asignarla automáticamente
        if (!this.recursoForm.entidadId && this.entidadIdActual) {
            this.recursoForm.entidadId = this.entidadIdActual;
        }

        if (!this.validarFormulario()) return;

        // Validar si el recurso tiene una orden técnica activa en Flota
        if (this.modoModal === 'editar' && this.tieneOrdenActiva(this.recursoSeleccionado?.id)) {
            const nuevoEstado = this.recursoForm.estadoDisponibilidad;
            if (nuevoEstado && nuevoEstado !== 'EN_MANTENIMIENTO') {
                const codigo = this.obtenerCodigoOrdenActiva(this.recursoSeleccionado?.id);
                this.mostrarToast(`Inmovilizado: El recurso tiene la Orden de Mantenimiento ${codigo} activa. Debe liberarse o cancelarse desde el módulo de Flota.`, 'error');
                return;
            }
        }

        const payload = this.prepararPayload();
        console.log('[RecursosOperativos] Enviando payload:', payload);
        this.guardando = true;

        if (this.modoModal === 'crear') {
            this.recursoService.crear(payload).subscribe({
                next: () => {
                    this.guardando = false;
                    this.cerrarModal();
                    this.cargarDatosIniciales();
                    this.mostrarToast('Recurso operativo agregado con éxito.');
                },
                error: (err) => {
                    this.guardando = false;
                    console.error('[RecursosOperativos] Error al crear recurso:', err);
                    let msg = err?.error?.mensaje || err?.error?.message || err?.error?.error;
                    if (!msg) {
                        if (err?.status === 403) {
                            msg = 'Acceso denegado (403): Tu rol actual no tiene permisos para crear recursos (se requiere ADMIN o ENTIDAD_ADMIN).';
                        } else if (err?.status === 401) {
                            msg = 'Sesión no autorizada (401). Inicia sesión nuevamente.';
                        } else if (err?.status === 422) {
                            msg = 'Entidad o catálogo no válido para la operación (422).';
                        } else if (err?.status === 409) {
                            msg = 'El identificador ya se encuentra registrado en el sistema (409).';
                        } else {
                            msg = 'Error al guardar recurso operativo.';
                        }
                    }
                    this.mostrarToast(msg, 'error');
                }
            });
        }

        if (this.modoModal === 'editar' && this.recursoSeleccionado?.id) {
            // Para actualizar, enviamos el objeto completo con todos los campos
            const payloadCompleto = {
                ...payload,
                id: this.recursoSeleccionado.id
            };

            this.recursoService.actualizar(this.recursoSeleccionado.id, payloadCompleto).subscribe({
                next: () => {
                    this.guardando = false;
                    this.cerrarModal();
                    this.cargarDatosIniciales();
                    this.mostrarToast('Recurso operativo actualizado con éxito.');
                },
                error: (err) => {
                    this.guardando = false;
                    console.error('[RecursosOperativos] Error al actualizar recurso:', err);
                    const msg = err?.error?.mensaje || err?.error?.message || err?.error?.error || 'Error al actualizar.';
                    this.mostrarToast(msg, 'error');
                }
            });
        }
    }

    /** Construye el payload en formato del API (location con zone/code/district) */
    private prepararPayload(): any {
        const location: Location | null = this.recursoForm.zonaNombre?.trim()
            ? {
                    zone: this.recursoForm.zonaNombre.trim(),
                    code: this.recursoForm.zonaCodigo?.trim() || null,
                    district: this.recursoForm.zonaDistrito?.trim() || null
                }
            : null;

        // Normalizar estadoDisponibilidad al enum exacto del backend (FUERA_DE_SERVICIO)
        let estadoDisp = this.recursoForm.estadoDisponibilidad || 'DISPONIBLE';
        if (estadoDisp === 'FUERA_SERVICIO') {
            estadoDisp = 'FUERA_DE_SERVICIO';
        }

        // Retornar objeto completo usando nomenclatura del API
        return {
            entityId: (this.recursoForm.entidadId || this.entidadIdActual || '').trim(),
            // Campos de catálogo ahora se envían directamente (misma tabla)
            key: this.recursoForm.key?.trim() || null,
            name: this.recursoForm.name?.trim() || null,
            type: this.recursoForm.type?.trim() || null,
            category: this.recursoForm.category?.trim() || null,
            icon: this.recursoForm.icon?.trim() || null,
            // Campos operativos
            internalCode: (this.recursoForm.identificador || '').trim(),
            responsible: this.recursoForm.encargadoNombre?.trim() || null,
            location: location,
            availability: estadoDisp,
            statusDetail: this.recursoForm.subestadoOperativo || 'ASIGNADO_PATRULLAJE',
            active: this.recursoForm.estado === 'ACTIVO'
        };
    }

    // %% Cambio de estado rápido %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    toggleMenuEstado(recursoId: string, event: Event): void {
        event.stopPropagation();
        this.menuEstadoAbierto = this.menuEstadoAbierto === recursoId ? null : recursoId;
    }

    cerrarMenuEstado(): void {
        this.menuEstadoAbierto = null;
    }

    cambiarEstadoRapido(recurso: RecursoOperativo, nuevoEstado: string): void {
        if (!recurso.id || this.resolverEstado(recurso) === nuevoEstado) {
            this.menuEstadoAbierto = null;
            return;
        }

        if (this.tieneOrdenActiva(recurso.id)) {
            const codigo = this.obtenerCodigoOrdenActiva(recurso.id);
            this.menuEstadoAbierto = null;
            this.mostrarToast(`Inmovilizado: El recurso tiene la Orden de Mantenimiento ${codigo} activa. Debe cancelarse o liberarse desde Flota.`, 'error');
            return;
        }

        this.cambiandoEstado = recurso.id;
        this.menuEstadoAbierto = null;
        this.refrescarVista();

        // Usar el endpoint PATCH específico para cambiar estado
        this.recursoService.cambiarEstado(recurso.id, nuevoEstado).subscribe({
            next: () => {
                this.cambiandoEstado = null;
                this.cargarDatosIniciales();
                this.mostrarToast(`Estado cambiado a ${this.formatearTexto(nuevoEstado)} exitosamente.`);
            },
            error: (err) => {
                this.cambiandoEstado = null;
                this.refrescarVista();
                const msg = err?.error?.message || err?.error?.error || 'Error al cambiar estado.';
                this.mostrarToast(msg, 'error');
            }
        });
    }

    // %% Validación %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    validarCampoRecurso(campo: CampoRecurso): void {
        const val = this.recursoForm[campo] ?? '';
        delete this.erroresRecurso[campo];

        if (campo === 'entidadId' && !val.toString().trim() && !this.entidadIdActual) {
            this.erroresRecurso[campo] = 'Seleccione una entidad propietaria.';
        }
        if (campo === 'key') {
            const str = val.toString().trim();
            if (!str) {
                this.erroresRecurso[campo] = 'La clave del recurso es requerida.';
            } else if (str.length < 2 || str.length > 50) {
                this.erroresRecurso[campo] = 'La clave debe tener entre 2 y 50 caracteres.';
            }
        }
        if (campo === 'name') {
            const str = val.toString().trim();
            if (!str) {
                this.erroresRecurso[campo] = 'El nombre del recurso es requerido.';
            } else if (str.length < 3 || str.length > 100) {
                this.erroresRecurso[campo] = 'El nombre debe tener entre 3 y 100 caracteres.';
            }
        }
        if (campo === 'type' && !val.toString().trim()) {
            this.erroresRecurso[campo] = 'Seleccione un tipo de recurso.';
        }
        if (campo === 'category' && !val.toString().trim()) {
            this.erroresRecurso[campo] = 'Seleccione una categoría.';
        }
        if (campo === 'identificador') {
            const str = val.toString().trim();
            if (!str) {
                this.erroresRecurso[campo] = 'El identificador es requerido.';
            } else if (!REGEX_IDENTIFICADOR.test(str)) {
                this.erroresRecurso[campo] = 'Formato inválido (2-30 caracteres, sin espacios).';
            }
        }
        if (campo === 'encargadoNombre') {
            const str = val.toString().trim();
            if (str && !REGEX_NOMBRE_PERSONA.test(str)) {
                this.erroresRecurso[campo] = 'Formato inválido de nombre.';
            }
        }
        if (campo === 'estadoDisponibilidad' && !val.toString().trim()) {
            this.erroresRecurso[campo] = 'Seleccione un estado de disponibilidad.';
        }
        if (campo === 'subestadoOperativo' && !val.toString().trim()) {
            this.erroresRecurso[campo] = 'Seleccione un subestado operativo.';
        }
    }

    tieneErrorRecurso(campo: CampoRecurso): boolean {
        return !!this.erroresRecurso[campo];
    }

    validarFormulario(): boolean {
        this.validarCampoRecurso('entidadId');
        this.validarCampoRecurso('key');
        this.validarCampoRecurso('name');
        this.validarCampoRecurso('type');
        this.validarCampoRecurso('category');
        this.validarCampoRecurso('identificador');
        this.validarCampoRecurso('encargadoNombre');
        this.validarCampoRecurso('estadoDisponibilidad');
        this.validarCampoRecurso('subestadoOperativo');
        return Object.keys(this.erroresRecurso).length === 0;
    }

    get recursoFormValido(): boolean {
        const tieneEntidad = !!this.recursoForm.entidadId || !!this.entidadIdActual;
        return tieneEntidad &&
               !!this.recursoForm.key &&
               !!this.recursoForm.name &&
               !!this.recursoForm.type &&
               !!this.recursoForm.category &&
               !!this.recursoForm.identificador &&
               Object.keys(this.erroresRecurso).length === 0;
    }

    // %% Toast %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    mostrarToast(mensaje: string, tipo: 'exito' | 'error' | 'info' = 'exito'): void {
        this.ngZone.run(() => {
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toast = { mensaje, tipo };
            this.refrescarVista();
            this.toastTimer = setTimeout(() => this.cerrarToast(), 4500);
        });
    }

    cerrarToast(): void {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toast = null;
        this.refrescarVista();
    }

    // %% Helpers %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    formatearTexto(texto: string | null | undefined): string {
        if (!texto) return '';
        return texto
            .split('_')
            .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join(' ');
    }

    private normalizarId(id: string | undefined | null): string {
        return id?.toString().trim() || '';
    }

    obtenerEtiquetaVisualCatalogo(catalogoId: string, recurso?: RecursoOperativo): string {
        const cat = this.catalogos.find(c => (catalogoId && c.id === catalogoId) || (recurso?.key && (c.key === recurso.key || c.clave === recurso.key)));
        return cat?.displayLabel || cat?.etiquetaVisual || cat?.key || cat?.clave || recurso?.name || recurso?.key || 'Sin recurso';
    }

    obtenerCategoriaPadreCatalogo(catalogoId: string, recurso?: RecursoOperativo): string {
        const cat = this.catalogos.find(c => (catalogoId && c.id === catalogoId) || (recurso?.key && (c.key === recurso.key || c.clave === recurso.key)));
        return cat?.parentCategory || cat?.categoriaPadre || recurso?.category || '';
    }

    obtenerTipoRecursoCatalogo(catalogoId: string, recurso?: RecursoOperativo): string {
        const cat = this.catalogos.find(c => (catalogoId && c.id === catalogoId) || (recurso?.key && (c.key === recurso.key || c.clave === recurso.key)));
        return cat?.resourceType || cat?.tipoRecurso || recurso?.type || '';
    }

    obtenerCatalogoPorId(catalogoId: string, recurso?: RecursoOperativo): Catalogo | null {
        return this.catalogos.find(c => (catalogoId && c.id === catalogoId) || (recurso?.key && (c.key === recurso.key || c.clave === recurso.key))) || null;
    }

    readonly mapaIconosPredefinidos: Record<string, string> = {
        'icono_patrulla.png': '🚔',
        'icono_moto_policial.png': '🏍️',
        'icono_ambulancia.png': '🚑',
        'icono_medico.png': '🩺',
        'icono_camion_bomberos.png': '🚒',
        'icono_bombero.png': '👨‍🚒',
        'icono_helicoptero.png': '🚁',
        'icono_policia.png': '👮',
        'icono_camioneta.png': '🚙',
        'icono_otro.png': '📦'
    };

    obtenerEmojiCatalogo(cat: Catalogo | null | undefined, recurso?: RecursoOperativo): string {
        if (!cat && recurso) {
            cat = this.obtenerCatalogoPorId('', recurso);
        }
        if (!cat) {
            if (recurso?.icon && this.mapaIconosPredefinidos[recurso.icon]) {
                return this.mapaIconosPredefinidos[recurso.icon];
            }
            const fallback = (recurso?.key || recurso?.name || '').toLowerCase();
            if (fallback.includes('moto')) return '🏍️';
            if (fallback.includes('patrull')) return '🚔';
            if (fallback.includes('ambulanc')) return '🚑';
            if (fallback.includes('cisterna') || fallback.includes('bomber')) return '🚒';
            if (fallback.includes('camioneta') || fallback.includes('camion')) return '🚙';
            if (fallback.includes('medico') || fallback.includes('salud')) return '🩺';
            if (fallback.includes('serenazgo') || fallback.includes('sereno') || fallback.includes('policia')) return '👮';
            return '📦';
        }
        if (cat.mapIcon && this.mapaIconosPredefinidos[cat.mapIcon]) {
            return this.mapaIconosPredefinidos[cat.mapIcon];
        }
        const clave = (cat.key || '').toLowerCase();
        const etiq = (cat.displayLabel || '').toLowerCase();
        const full = `${clave} ${etiq}`;

        if (full.includes('moto')) return '🏍️';
        if (full.includes('patrull')) return '🚔';
        if (full.includes('ambulanc')) return '🚑';
        if (full.includes('cisterna') || full.includes('bomber')) return '🚒';
        if (full.includes('camioneta') || full.includes('camion')) return '🚙';
        if (full.includes('medico') || full.includes('doctor') || full.includes('salud')) return '🩺';
        if (full.includes('policia') || full.includes('sereno') || full.includes('oficial')) return '👮';
        if (full.includes('helicoptero') || full.includes('aereo')) return '🚁';
        if (full.includes('fija') || full.includes('base') || full.includes('caseta')) return '🏢';

        const catNorm = this.normalizarCategoria(cat.parentCategory);
        if (catNorm === 'SEGURIDAD') return '🛡️';
        if (catNorm === 'SALUD') return '🏥';
        if (catNorm === 'RESCATE') return '🔥';

        return '📦';
    }

    normalizarCategoria(valor: string | null | undefined): 'SEGURIDAD' | 'SALUD' | 'RESCATE' | null {
        if (!valor) return null;
        const v = valor.trim().toUpperCase();
        if (v.includes('SEGURIDAD') || v.includes('POLICIA') || v.includes('SERENAZGO') || v.includes('MUNICIPALIDAD') || v.includes('PNP')) {
            return 'SEGURIDAD';
        }
        if (v.includes('SALUD') || v.includes('HOSPITAL') || v.includes('SAMU') || v.includes('MEDIC') || v.includes('POSTA')) {
            return 'SALUD';
        }
        if (v.includes('RESCATE') || v.includes('BOMBERO') || v.includes('INCENDIO') || v.includes('DEFENSA')) {
            return 'RESCATE';
        }
        return null;
    }

    get tipoEntidadEfectivo(): string {
        if (this.recursoForm.entidadId) {
            const t = this.obtenerTipoEntidad(this.recursoForm.entidadId);
            if (t) return t;
        }
        if (this.entidadIdActual) {
            const t = this.obtenerTipoEntidad(this.entidadIdActual);
            if (t) return t;
        }
        return this.authService.getTipoEntidad() || '';
    }

    esCatalogoPermitidoParaEntidad(cat: Catalogo, tipoEntidad: string | null | undefined): boolean {
        if (!tipoEntidad) return true;
        const catNorm = this.normalizarCategoria(cat.parentCategory);
        const entNorm = this.normalizarCategoria(tipoEntidad);

        if (entNorm && catNorm) {
            return entNorm === catNorm;
        }

        const cp = (cat.parentCategory || '').toUpperCase().trim();
        const te = tipoEntidad.toUpperCase().trim();
        if (cp && te) {
            return cp === te || te.includes(cp) || cp.includes(te);
        }

        return true;
    }

    get catalogosFiltradosParaForm(): Catalogo[] {
        const query = (this.busquedaCatalogo || '').trim().toLowerCase();
        const filtroTipoRecurso = this.filtroTipoRecursoCatalogo;
        const tipoEntidad = this.tipoEntidadEfectivo;

        return this.catalogos.filter(cat => {
            // Solo activos para creación
            if (cat.status && cat.status !== 'ACTIVO') return false;

            // Aislamiento estricto por tipo de entidad
            if (tipoEntidad && !this.esCatalogoPermitidoParaEntidad(cat, tipoEntidad)) {
                return false;
            }

            // Filtro por tipo de recurso (Móvil, Personal, Fija)
            if (filtroTipoRecurso !== 'TODOS' && cat.resourceType !== filtroTipoRecurso) {
                return false;
            }

            // Búsqueda por texto (etiqueta visual, clave, tipo recurso, categoria)
            if (query) {
                const contenido = [
                    cat.displayLabel,
                    cat.key,
                    cat.resourceType,
                    cat.parentCategory
                ].filter(Boolean).join(' ').toLowerCase();

                if (!contenido.includes(query)) return false;
            }

            return true;
        });
    }

    get catalogoSeleccionadoItem(): Catalogo | null {
        if (!this.recursoForm.catalogoId) return null;
        return this.catalogos.find(c => c.id === this.recursoForm.catalogoId) || null;
    }

    // DEPRECATED: Ya no se usa selector de catálogo - los campos son editables directamente
    /*
    seleccionarCatalogoItem(cat: Catalogo): void {
        this.recursoForm.catalogoId = cat.id || '';
        this.validarCampoRecurso('catalogoId');
        this.selectorCatalogoExpandido = false;
        this.refrescarVista();
    }

    expandirSelectorCatalogo(): void {
        this.selectorCatalogoExpandido = true;
        this.refrescarVista();
    }
    */

    onEntidadFormChange(nuevaEntidadId: string): void {
        this.recursoForm.entidadId = nuevaEntidadId;
        this.validarCampoRecurso('entidadId');

        // Si el catálogo seleccionado ya no coincide con la entidad nueva, limpiarlo
        if (this.recursoForm.catalogoId) {
            const catActual = this.catalogos.find(c => c.id === this.recursoForm.catalogoId);
            if (catActual && !this.esCatalogoPermitidoParaEntidad(catActual, this.tipoEntidadEfectivo)) {
                this.recursoForm.catalogoId = '';
                this.selectorCatalogoExpandido = true;
            }
        }
        this.refrescarVista();
    }

    obtenerColorCategoria(categoriaPadre: string | null | undefined): string {
        const norm = this.normalizarCategoria(categoriaPadre);
        switch (norm) {
            case 'SEGURIDAD': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'SALUD': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'RESCATE': return 'bg-orange-50 text-orange-700 border-orange-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    }

    obtenerColorBadgeTipoEntidad(tipoEntidad: string | null | undefined): string {
        const norm = this.normalizarCategoria(tipoEntidad);
        switch (norm) {
            case 'SEGURIDAD': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'SALUD': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'RESCATE': return 'bg-orange-50 text-orange-700 border-orange-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    }

    obtenerIconoTipoEntidad(tipoEntidad: string | null | undefined): string {
        const norm = this.normalizarCategoria(tipoEntidad);
        switch (norm) {
            case 'SEGURIDAD': return '🛡️';
            case 'SALUD': return '🏥';
            case 'RESCATE': return '🔥';
            default: return '🏛️';
        }
    }

    obtenerRazonSocialEntidad(entidadId: string): string {
        const ent = this.entidades.find(e => e.id === entidadId);
        return ent?.businessName || 'Sin entidad';
    }

    obtenerTipoEntidad(entidadId: string): string {
        const ent = this.entidades.find(e => e.id === entidadId);
        return ent?.entityType || '';
    }

    obtenerClaseEstado(estado: string): string {
        const map: Record<string, string> = {
            'DISPONIBLE': 'bg-emerald-100 border-emerald-300 text-emerald-700',
            'OCUPADO': 'bg-amber-100 border-amber-300 text-amber-700',
            'EN_DESPACHO': 'bg-blue-100 border-blue-300 text-blue-700',
            'EN_MANTENIMIENTO': 'bg-rose-100 border-rose-300 text-rose-700',
            'FUERA_DE_SERVICIO': 'bg-slate-100 border-slate-300 text-slate-700',
            'FUERA_SERVICIO': 'bg-slate-100 border-slate-300 text-slate-700',
            'RESERVADO': 'bg-indigo-100 border-indigo-300 text-indigo-700',
            'DADO_DE_BAJA': 'bg-slate-100 border-slate-300 text-slate-500 line-through'
        };
        return map[estado] || 'bg-slate-100 border-slate-300 text-slate-700';
    }

    obtenerClaseSubestado(subestado: string): string {
        const map: Record<string, string> = {
            'ASIGNADO_PATRULLAJE': 'bg-purple-100 border-purple-300 text-purple-700',
            'MANTENIMIENTO_PREVENTIVO': 'bg-amber-100 border-amber-300 text-amber-700',
            'MANTENIMIENTO_CORRECTIVO': 'bg-rose-100 border-rose-300 text-rose-700',
            'PRESTADO_TEMPORALMENTE': 'bg-orange-100 border-orange-300 text-orange-700',
            'EN_COMISION': 'bg-blue-100 border-blue-300 text-blue-700',
            'EN_CAPACITACION': 'bg-teal-100 border-teal-300 text-teal-700',
            'EN_ENTIDAD_PROPIETARIA': 'bg-sky-100 border-sky-300 text-sky-700',
            'ASIGNADO_A_ZONA': 'bg-indigo-100 border-indigo-300 text-indigo-700',
            'EN_APOYO_INTERINSTITUCIONAL': 'bg-teal-100 border-teal-300 text-teal-700',
            'RETORNANDO': 'bg-cyan-100 border-cyan-300 text-cyan-700'
        };
        return map[subestado] || 'bg-slate-100 border-slate-300 text-slate-700';
    }

    trackByRecursoId(index: number, recurso: RecursoOperativo): string {
        return recurso.id || index.toString();
    }

    trackByCatalogoId(index: number, catalogo: Catalogo): string {
        return catalogo.id || index.toString();
    }

    trackByEntidadId(index: number, entidad: Entidad): string {
        return entidad.id || index.toString();
    }

    // %% Reportes %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

    readonly puedeExportar = this.branding.puedeExportar();

    /** Lo que se ve es lo que se exporta: las filas filtradas, con nombres ya resueltos. */
    private filasReporte(): RecursoReporteFila[] {
        return this.recursosFiltrados.map(r => {
            const catalogoId = this.resolverCatalogoId(r), zona = this.resolverZona(r);
            return {
                identificador: r.identificador || r.internalCode || '',
                encargado: this.resolverEncargado(r),
                recurso: this.obtenerEtiquetaVisualCatalogo(catalogoId, r),
                categoria: this.obtenerCategoriaPadreCatalogo(catalogoId, r),
                tipo: this.obtenerTipoRecursoCatalogo(catalogoId, r),
                entidad: this.obtenerRazonSocialEntidad(this.resolverEntidadId(r)),
                zona: zona?.zone ?? null,
                codigoZona: zona?.code ?? null,
                distrito: zona?.district ?? null,
                estado: this.formatearTexto(this.resolverEstado(r)),
                subestado: this.formatearTexto(this.resolverSubestado(r))
            };
        });
    }

    private filtrosReporte(): RecursoReporteFiltros {
        return { estado: this.filtroActivo === 'TODOS' ? 'Todos' : this.formatearTexto(this.filtroActivo), busqueda: this.busqueda.trim() };
    }

    descargarPDF(): Promise<void> {
        return this.exportar(() => this.recursoPdf.generarPdf(this.filasReporte(), this.filtrosReporte()), 'PDF');
    }

    descargarExcel(): Promise<void> {
        return this.exportar(() => this.recursoExcel.generarExcel(this.filasReporte(), this.filtrosReporte()), 'Excel');
    }

    private async exportar(generar: () => Promise<void>, formato: string): Promise<void> {
        if (this.generandoReporte || !this.recursosFiltrados.length) return;
        this.generandoReporte = true;
        this.refrescarVista();
        try {
            await generar();
            this.mostrarToast(`Reporte ${formato} generado exitosamente`, 'exito');
        } catch {
            this.mostrarToast(`No se pudo generar el reporte ${formato}`, 'error');
        } finally {
            this.generandoReporte = false;
            this.refrescarVista();
        }
    }
}

/** Tipo interno del formulario — desacoplado del modelo de BD */
interface RecursoOperativoForm {
    entidadId: string;
    catalogoId: string; // Mantener por compatibilidad pero opcional
    // Campos de catálogo ahora editables (pertenecen a la misma tabla)
    key: string;       // Clave del recurso (ej: PATRULLA_001)
    name: string;      // Nombre del recurso (ej: Patrulla Alpha)
    type: string;      // Tipo (ej: UNIDAD_MOVIL)
    category: string;  // Categoría (ej: SEGURIDAD)
    icon: string;      // Icono (ej: icono_patrulla.png)
    // Campos operativos
    identificador: string;
    encargadoNombre: string;
    estadoDisponibilidad: string;
    subestadoOperativo: string;
    estado: string;
    zonaNombre: string;
    zonaCodigo: string;
    zonaDistrito: string;
}
