import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Inject, NgZone, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Catalogo } from '../../../core/models/catalogo.model';
import { CatalogoService } from '../../../core/services/catalogo';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { CatalogoExcelService } from '../../../core/reports/catalogo/catalogo-excel.service';
import { CatalogoPdfService } from '../../../core/reports/catalogo/catalogo-pdf.service';
import { CatalogoReporteFiltros } from '../../../core/reports/catalogo/catalogo-reporte.model';

type ModoModalCatalogo = 'crear' | 'ver' | 'editar';
type FiltroEstadoCatalogo = 'TODOS' | 'ACTIVO' | 'INACTIVO';



const CAMPO_A_PROPIEDAD: Record<string, keyof Catalogo> = {
  clave: 'key',
  etiquetaVisual: 'displayLabel',
  categoriaPadre: 'parentCategory',
  tipoRecurso: 'resourceType',
  iconoMapa: 'mapIcon'
};

@Component({
  selector: 'app-catalogos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalogos.html',
  styleUrl: './catalogos.css'
})
export class Catalogos implements OnInit {

  catalogos: Catalogo[] = [];
  catalogosFiltrados: Catalogo[] = [];

  cargando = false;

  busqueda = '';
  filtroEstado: FiltroEstadoCatalogo = 'TODOS';

  modalAbierto = false;
  modoModal: ModoModalCatalogo = 'crear';

  catalogoSeleccionado: Catalogo | null = null;
  catalogoForm: Catalogo = this.crearFormularioVacio();

  private readonly toast = inject(CivicToastService);

  tabActiva: 'SEGURIDAD' | 'SALUD' | 'RESCATE' = 'SEGURIDAD';

  descargandoPdf = false;
  descargandoExcel = false;

  readonly tabs: { value: 'SEGURIDAD' | 'SALUD' | 'RESCATE'; label: string; icono: string; color: string; colorBg: string; colorBorder: string; colorText: string }[] = [
    { value: 'SEGURIDAD', label: 'Seguridad',  icono: '🛡️', color: 'bg-blue-500',    colorBg: 'bg-blue-50',    colorBorder: 'border-blue-200', colorText: 'text-blue-700'    },
    { value: 'SALUD',     label: 'Salud',      icono: '🏥', color: 'bg-emerald-500', colorBg: 'bg-emerald-50', colorBorder: 'border-emerald-200', colorText: 'text-emerald-700' },
    { value: 'RESCATE',   label: 'Rescate',    icono: '🔥', color: 'bg-orange-500',  colorBg: 'bg-orange-50',  colorBorder: 'border-orange-200', colorText: 'text-orange-700'  }
  ];

  filtros: { label: string; value: FiltroEstadoCatalogo }[] = [
    { label: 'TODOS', value: 'TODOS' },
    { label: 'ACTIVOS', value: 'ACTIVO' },
    { label: 'INACTIVOS', value: 'INACTIVO' }
  ];

  private readonly branding = inject(ReportBrandingService);
  private readonly catalogoPdf = inject(CatalogoPdfService);
  private readonly catalogoExcel = inject(CatalogoExcelService);

  constructor(
    private catalogoService: CatalogoService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.cargarCatalogos();
    }
  }

  /** Garantiza un re-render aunque el callback resuelva fuera de zona. */
  private refrescarVista(): void {
    try {
      this.cdr.detectChanges();
    } catch {
      // Componente puede haber sido destruido; ignoramos.
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  mostrarToast(tipo: 'exito' | 'error', mensaje: string): void {
    if (tipo === 'exito') {
      this.toast.success(mensaje);
    } else {
      this.toast.error(mensaje);
    }
  }

  // ── Validación en tiempo real ──────────────────────────────────────────────

  errores: { [key: string]: string } = {};

  validarCampo(campo: string): void {
    // Las claves de error del formulario siguen en español; el modelo (contrato de la API) va en inglés.
    const val = (this.catalogoForm as Record<string, unknown>)[CAMPO_A_PROPIEDAD[campo] ?? campo];
    const str = (val as string | null | undefined)?.toString().trim() ?? '';

    switch (campo) {
      case 'clave':
        // Forzar mayúsculas automáticamente
        if (this.catalogoForm.key) {
          this.catalogoForm.key = this.catalogoForm.key.toUpperCase();
        }
        if (!str) {
          this.errores['clave'] = 'La clave es obligatoria.';
        } else if (str.length < 4) {
          this.errores['clave'] = 'Mínimo 4 caracteres.';
        } else if (str.length > 50) {
          this.errores['clave'] = 'Máximo 50 caracteres.';
        } else if (!/^[A-Z][A-Z0-9_]*$/.test(str)) {
          this.errores['clave'] = 'Solo MAYÚSCULAS, números y guion bajo. Debe iniciar con letra.';
        } else {
          this.errores['clave'] = '';
        }
        break;

      case 'etiquetaVisual':
        if (!str) {
          this.errores['etiquetaVisual'] = 'La etiqueta visual es obligatoria.';
        } else if (str.length < 3) {
          this.errores['etiquetaVisual'] = 'Mínimo 3 caracteres.';
        } else if (str.length > 100) {
          this.errores['etiquetaVisual'] = 'Máximo 100 caracteres.';
        } else {
          this.errores['etiquetaVisual'] = '';
        }
        break;

      case 'categoriaPadre':
        if (!str) {
          this.errores['categoriaPadre'] = '';
        } else if (str.length > 50) {
          this.errores['categoriaPadre'] = 'Máximo 50 caracteres.';
        } else if (!/^[A-Z][A-Z0-9_]*$/.test(str)) {
          this.errores['categoriaPadre'] = 'Solo MAYÚSCULAS, números y guion bajo.';
        } else {
          this.errores['categoriaPadre'] = '';
        }
        break;

      case 'tipoRecurso':
        if (!str) {
          this.errores['tipoRecurso'] = '';
        } else if (str.length > 50) {
          this.errores['tipoRecurso'] = 'Máximo 50 caracteres.';
        } else if (!/^[A-Z][A-Z0-9_]*$/.test(str)) {
          this.errores['tipoRecurso'] = 'Solo MAYÚSCULAS, números y guion bajo.';
        } else {
          this.errores['tipoRecurso'] = '';
        }
        break;

      case 'iconoMapa':
        this.errores['iconoMapa'] = str ? '' : 'Debes seleccionar un ícono.';
        break;
    }
  }

  get formularioValido(): boolean {
    const campos = ['clave', 'etiquetaVisual', 'iconoMapa'];
    campos.forEach(c => this.validarCampo(c));
    return campos.every(c => !this.errores[c]);
  }

  readonly iconosPredefinidos: { nombre: string; etiqueta: string; emoji: string }[] = [
    { nombre: 'icono_patrulla.png',        etiqueta: 'Patrullero',       emoji: '🚔' },
    { nombre: 'icono_moto_policial.png',   etiqueta: 'Moto Policial',    emoji: '🏍️' },
    { nombre: 'icono_ambulancia.png',      etiqueta: 'Ambulancia',       emoji: '🚑' },
    { nombre: 'icono_medico.png',          etiqueta: 'Médico',           emoji: '🩺' },
    { nombre: 'icono_camion_bomberos.png', etiqueta: 'Camión Bomberos',  emoji: '🚒' },
    { nombre: 'icono_bombero.png',         etiqueta: 'Bombero',          emoji: '👨‍🚒' },
    { nombre: 'icono_helicoptero.png',     etiqueta: 'Helicóptero',      emoji: '🚁' },
    { nombre: 'icono_policia.png',         etiqueta: 'Policía',          emoji: '👮' },
    { nombre: 'icono_camioneta.png',       etiqueta: 'Camioneta',        emoji: '🚙' },
    { nombre: 'icono_otro.png',            etiqueta: 'Otro',             emoji: '❓' }
  ];

  crearFormularioVacio(): Catalogo {
    return { group: 'SUB_TIPOS_RECURSOS', key: '', displayLabel: '', parentCategory: 'SEGURIDAD', resourceType: 'UNIDAD_MOVIL', mapIcon: '', status: 'ACTIVO', createdAt: null };
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  cargarCatalogos(): void {
    this.cargando = true;
    this.refrescarVista();

    this.catalogoService.listar().subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.catalogos = data || [];
          this.aplicarFiltros();
          this.cargando = false;
          this.refrescarVista();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('Error cargando catálogos:', error);
          this.catalogos = [];
          this.catalogosFiltrados = [];
          this.cargando = false;
          this.mostrarToast('error', 'No se pudieron cargar los catálogos.');
          this.refrescarVista();
        });
      }
    });
  }

  // ── Filtros ────────────────────────────────────────────────────────────────

  aplicarFiltros(): void {
    const texto = this.busqueda.trim().toLowerCase();
    this.catalogosFiltrados = this.catalogos.filter((catalogo) => {
      const coincideEstado = this.filtroEstado === 'TODOS' || (catalogo.status ?? '') === this.filtroEstado;
      const contenido = [catalogo.id, catalogo.group, catalogo.key, catalogo.displayLabel, catalogo.parentCategory, catalogo.resourceType, catalogo.mapIcon, catalogo.status]
        .map(v => v ?? '').join(' ').toLowerCase();
      return coincideEstado && (!texto || contenido.includes(texto));
    });
  }

  seleccionarFiltro(filtro: FiltroEstadoCatalogo): void {
    this.filtroEstado = filtro;
    this.aplicarFiltros();
  }

  obtenerCatalogosPorCategoria(categoria: string): Catalogo[] {
    return this.catalogosFiltrados.filter(c => (c.parentCategory ?? '') === categoria);
  }

  obtenerTotalPorCategoria(categoria: string): number {
    return this.catalogos.filter(c => (c.parentCategory ?? '') === categoria).length;
  }

  obtenerTotalActivos(): number {
    return this.catalogos.filter(c => (c.status ?? '') === 'ACTIVO').length;
  }

  obtenerTotalInactivos(): number {
    return this.catalogos.filter(c => (c.status ?? '') !== 'ACTIVO').length;
  }

  obtenerTotalGrupos(): number {
    return new Set(this.catalogos.map(c => c.group ?? '').filter(g => g.trim() !== '')).size;
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  abrirCrear(): void {
    this.modoModal = 'crear';
    this.catalogoSeleccionado = null;
    this.catalogoForm = this.crearFormularioVacio();
    this.catalogoForm.parentCategory = this.tabActiva; // preseleccionar tab activa
    this.errores = {};
    this.modalAbierto = true;
  }

  abrirEditar(catalogo: Catalogo): void {
    this.modoModal = 'editar';
    this.catalogoSeleccionado = catalogo;
    this.catalogoForm = { ...this.crearFormularioVacio(), ...catalogo };
    this.errores = {};
    this.modalAbierto = true;
  }

  cerrarModal(): void {
    this.modalAbierto = false;
    this.catalogoSeleccionado = null;
    this.catalogoForm = this.crearFormularioVacio();
    this.errores = {};
  }

  // ── Guardar ────────────────────────────────────────────────────────────────

  guardar(): void {
    if (this.modoModal === 'ver') return;
    if (!this.validarFormulario()) return;

    const payload = this.prepararCatalogoParaEnviar();
    const modoActual = this.modoModal;

    // Actualizar la lista LOCAL de inmediato sin esperar al servidor
    if (modoActual === 'crear') {
      const nuevo: Catalogo = { ...payload, status: 'ACTIVO' };
      this.catalogos = [...this.catalogos, nuevo];
    } else {
      this.catalogos = this.catalogos.map(c =>
        c.id === payload.id ? { ...c, ...payload } : c
      );
    }
    this.aplicarFiltros();

    // Cerrar modal al instante
    this.cerrarModal();
    this.mostrarToast('exito', modoActual === 'crear' ? 'Catálogo creado.' : 'Catálogo actualizado.');

    // Sincronizar con el servidor en background
    const peticion$ = modoActual === 'crear'
      ? this.catalogoService.crear(payload)
      : this.catalogoService.actualizar(payload.id!, payload);

    peticion$.subscribe({
      next: (respuesta) => {
        this.ngZone.run(() => {
          // Si el servidor devuelve el id real (en crear), actualizarlo en la lista
          if (modoActual === 'crear' && respuesta?.id) {
            this.catalogos = this.catalogos.map(c =>
              !c.id && c.key === respuesta.key ? { ...c, ...respuesta } : c
            );
            this.aplicarFiltros();
          }
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          console.error('Error al guardar:', err);
          this.mostrarToast('error', 'Error al guardar. Recargando datos...');
          this.cargarCatalogos(); // solo en error recarga del servidor
        });
      }
    });
  }

  validarFormulario(): boolean {
    const campos = ['clave', 'etiquetaVisual', 'iconoMapa'];
    campos.forEach(c => this.validarCampo(c));
    const primer = campos.find(c => this.errores[c]);
    if (primer) {
      this.mostrarToast('error', this.errores[primer] as string);
      return false;
    }
    return true;
  }

  prepararCatalogoParaEnviar(): Catalogo {
    const c: Catalogo = {
      group: 'SUB_TIPOS_RECURSOS',
      key: (this.catalogoForm.key ?? '').trim().toUpperCase(),
      displayLabel: (this.catalogoForm.displayLabel ?? '').trim(),
      parentCategory: (this.catalogoForm.parentCategory ?? '').trim() || null,
      resourceType: (this.catalogoForm.resourceType ?? '').trim() || null,
      mapIcon: (this.catalogoForm.mapIcon ?? '').trim() || null,
      status: (this.catalogoForm.status ?? 'ACTIVO')
    };
    if (this.modoModal === 'editar' && this.catalogoForm.id) c.id = this.catalogoForm.id;
    return c;
  }

  // ── Estado ─────────────────────────────────────────────────────────────────

  cambiarEstado(catalogo: Catalogo): void {
    if (!catalogo.id) return;
    const nuevoEstado = catalogo.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';

    // Actualizar localmente al instante
    this.catalogos = this.catalogos.map(c =>
      c.id === catalogo.id ? { ...c, estado: nuevoEstado } : c
    );
    this.aplicarFiltros();
    this.mostrarToast('exito', `Catálogo ${nuevoEstado === 'ACTIVO' ? 'activado' : 'desactivado'} correctamente.`);

    // Sincronizar con servidor en background
    const accion = nuevoEstado === 'INACTIVO'
      ? this.catalogoService.desactivar(catalogo.id)
      : this.catalogoService.activar(catalogo.id);

    accion.subscribe({
      error: (err) => {
        console.error(err);
        // Revertir si falla
        this.catalogos = this.catalogos.map(c =>
          c.id === catalogo.id ? { ...c, estado: catalogo.status } : c
        );
        this.aplicarFiltros();
        this.mostrarToast('error', 'Error al cambiar el estado. Se revirtió el cambio.');
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  formatearTexto(valor: string | null | undefined): string {
    if (!valor) return '-';
    return valor.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  obtenerClaseGrupo(grupo: string | null | undefined): string {
    return `civic-badge ${this.obtenerVarianteGrupo(grupo)}`;
  }

  obtenerClaseTextoGrupo(grupo: string | null | undefined): string {
    return this.obtenerClaseTextoGrupoSem(grupo);
  }

  obtenerClaseFranjaGrupo(grupo: string | null | undefined): string {
    return `civic-group-stripe ${this.obtenerClaseFranjaGrupoSem(grupo)}`;
  }

  obtenerClaseBgSuave(grupo: string | null | undefined): string {
    return `civic-group-soft ${this.obtenerClaseBgSuaveSem(grupo)}`;
  }

  obtenerClaseIconoGrupo(grupo: string | null | undefined): string {
    return `civic-group-icon ${this.obtenerClaseIconoGrupoSem(grupo)}`;
  }

  private obtenerVarianteGrupo(grupo: string | null | undefined): string {
    switch (grupo ?? '') {
      case 'CATEGORIAS': return 'civic-badge--success';
      case 'TIPOS_RECURSO': return 'civic-badge--primary';
      case 'SUB_TIPOS_RECURSOS': return 'civic-badge--teal';
      case 'TIPOS_ENTIDAD': return 'civic-badge--violet';
      case 'ESTADOS_OPERATIVOS': return 'civic-badge--warning';
      case 'SUBESTADOS_RECURSO_OPERATIVO': return 'civic-badge--primary';
      default: return 'civic-badge--muted';
    }
  }

  private obtenerClaseTextoGrupoSem(grupo: string | null | undefined): string {
    switch (grupo ?? '') {
      case 'CATEGORIAS': return 'civic-group-text--success';
      case 'TIPOS_RECURSO': return 'civic-group-text--primary';
      case 'SUB_TIPOS_RECURSOS': return 'civic-group-text--teal';
      case 'TIPOS_ENTIDAD': return 'civic-group-text--violet';
      case 'ESTADOS_OPERATIVOS': return 'civic-group-text--warning';
      case 'SUBESTADOS_RECURSO_OPERATIVO': return 'civic-group-text--primary';
      default: return 'civic-group-text--muted';
    }
  }

  private obtenerClaseFranjaGrupoSem(grupo: string | null | undefined): string {
    switch (grupo ?? '') {
      case 'CATEGORIAS': return 'civic-group-stripe--success';
      case 'TIPOS_RECURSO': return 'civic-group-stripe--primary';
      case 'SUB_TIPOS_RECURSOS': return 'civic-group-stripe--teal';
      case 'TIPOS_ENTIDAD': return 'civic-group-stripe--violet';
      case 'ESTADOS_OPERATIVOS': return 'civic-group-stripe--warning';
      case 'SUBESTADOS_RECURSO_OPERATIVO': return 'civic-group-stripe--primary';
      default: return 'civic-group-stripe--muted';
    }
  }

  private obtenerClaseBgSuaveSem(grupo: string | null | undefined): string {
    switch (grupo ?? '') {
      case 'CATEGORIAS': return 'civic-group-soft--success';
      case 'TIPOS_RECURSO': return 'civic-group-soft--primary';
      case 'SUB_TIPOS_RECURSOS': return 'civic-group-soft--teal';
      case 'TIPOS_ENTIDAD': return 'civic-group-soft--violet';
      case 'ESTADOS_OPERATIVOS': return 'civic-group-soft--warning';
      case 'SUBESTADOS_RECURSO_OPERATIVO': return 'civic-group-soft--primary';
      default: return 'civic-group-soft--muted';
    }
  }

  private obtenerClaseIconoGrupoSem(grupo: string | null | undefined): string {
    switch (grupo ?? '') {
      case 'CATEGORIAS': return 'civic-group-icon--success';
      case 'TIPOS_RECURSO': return 'civic-group-icon--primary';
      case 'SUB_TIPOS_RECURSOS': return 'civic-group-icon--teal';
      case 'TIPOS_ENTIDAD': return 'civic-group-icon--violet';
      case 'ESTADOS_OPERATIVOS': return 'civic-group-icon--warning';
      case 'SUBESTADOS_RECURSO_OPERATIVO': return 'civic-group-icon--primary';
      default: return 'civic-group-icon--muted';
    }
  }

  obtenerEmojiIcono(nombreIcono: string | null | undefined): string {
    const icono = this.iconosPredefinidos.find(i => i.nombre === (nombreIcono ?? ''));
    return icono?.emoji ?? '📦';
  }

  trackByCatalogoId(_index: number, catalogo: Catalogo): string {
    return catalogo.id || catalogo.key || String(_index);
  }

  // ── Reportes (client-side, plantilla común) ────────────────────────────────

  readonly puedeExportar = this.branding.puedeExportar();

  /** La tab activa y los filtros de pantalla son los del reporte. */
  private filtrosReporte(): CatalogoReporteFiltros {
    return { categoria: this.tabActiva, estado: this.filtroEstado === 'TODOS' ? 'Todos' : this.filtroEstado, busqueda: this.busqueda.trim() };
  }

  get hayDatosReporte(): boolean {
    return this.obtenerCatalogosPorCategoria(this.tabActiva).length > 0;
  }

  async descargarPdf(): Promise<void> {
    if (this.descargandoPdf || !this.hayDatosReporte) return;
    this.descargandoPdf = true;
    await this.exportar(() => this.catalogoPdf.generarPdf(this.obtenerCatalogosPorCategoria(this.tabActiva), this.filtrosReporte()), 'PDF');
    this.descargandoPdf = false;
    this.refrescarVista();
  }

  async descargarExcel(): Promise<void> {
    if (this.descargandoExcel || !this.hayDatosReporte) return;
    this.descargandoExcel = true;
    await this.exportar(() => this.catalogoExcel.generarExcel(this.obtenerCatalogosPorCategoria(this.tabActiva), this.filtrosReporte()), 'Excel');
    this.descargandoExcel = false;
    this.refrescarVista();
  }

  private async exportar(generar: () => Promise<void>, formato: string): Promise<void> {
    try {
      await generar();
      this.mostrarToast('exito', `Reporte ${formato} descargado correctamente.`);
    } catch {
      this.mostrarToast('error', `No se pudo generar el reporte ${formato}.`);
    }
  }
}