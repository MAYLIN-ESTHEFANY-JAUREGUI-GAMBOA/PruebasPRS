import { CommonModule, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, catchError, firstValueFrom, forkJoin, map, of } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { EstadoMunicipalidad, GuardarMunicipalidadRequest, Municipalidad, TipoMunicipalidad } from '../../../core/models/municipalidad.model';
import { MunicipalidadService } from '../../../core/services/municipalidad';
import { Entidad } from '../../../core/models/entidad.model';
import { EntidadService } from '../../../core/services/entidad';
import { UbigeoMapa, UbigeoService } from '../../../shared/services/ubigeo.service';
import { ReportBrandingService } from '../../../shared/reports/report-branding.service';
import { MunicipalidadPdfService } from '../../../core/reports/municipalidad/municipalidad-pdf.service';
import { MunicipalidadExcelService } from '../../../core/reports/municipalidad/municipalidad-excel.service';
import { EntidadReporteFila, MunicipalidadReporteFila } from '../../../core/reports/municipalidad/municipalidad-reporte.model';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';
import { sanitizarTelefonoInput } from '../../../shared/utils/telefono.util';
import { GeoMapPicker, GeoPoint } from '../../../shared/components/geo-map-picker/geo-map-picker';
import { UbigeoSelect } from '../../../shared/components/ubigeo-select/ubigeo-select';

type FiltroEstado = 'TODAS' | EstadoMunicipalidad;
type CampoForm = 'ruc' | 'razonSocial' | 'email' | 'telefono' | 'lat' | 'lng' | 'ubigeo' | 'password';

interface FormMunicipalidad {
  id: string | null;
  ruc: string;
  razonSocial: string;
  email: string;
  telefono: string;
  direccion: string;
  logoUrl: string;
  lat: string;
  lng: string;
  ubigeo: string;
  tipo: TipoMunicipalidad;
  password: string;
}

// Mismas reglas que SaveMunicipalityRequest (vg-ms-municipalidades).
const REGEX_RUC = /^20\d{9}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_TELEFONO = /^\+?[0-9 ()-]{6,20}$/;
const MIN_PASSWORD = 8;
const MAX_LOGO_MB = 2;

interface Lugar { nombre: string; detalle: string; lat: number; lng: number; }
const PREFIJO = /^municipalidad\s+(provincial|distrital)?\s*(de\s+)?/i;
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el']);

/** "SAN VICENTE DE CAÑETE" → "San Vicente de Cañete" (el UBIGEO INEI viene en mayúsculas). */
function titulo(s: string): string {
  return s.toLowerCase().split(' ')
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

/**
 * SUPER_ADMIN: alta, edición y suspensión de todas las municipalidades (con la clave de la cuenta titular).
 * MUNICIPALIDAD_ADMIN: solo ve y edita los datos de contacto de la suya.
 */
@Component({
  selector: 'app-municipalidades',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GeoMapPicker, UbigeoSelect],
  templateUrl: './municipalidades.html',
  styleUrl: './municipalidades.css'
})
export class Municipalidades implements OnInit, OnDestroy {
  private readonly service = inject(MunicipalidadService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toast = inject(CivicToastService);
  private readonly entidadService = inject(EntidadService);
  private readonly ubigeoService = inject(UbigeoService);
  private readonly municipalidadPdf = inject(MunicipalidadPdfService);
  private readonly municipalidadExcel = inject(MunicipalidadExcelService);

  readonly puedeExportar = inject(ReportBrandingService).puedeExportar();
  generandoReporte = false;

  readonly esSuperAdmin = this.auth.isAdmin();
  readonly tiposMunicipalidad: { valor: TipoMunicipalidad; nombre: string; alcance: string }[] = [
    { valor: 'PROVINCIAL', nombre: 'Provincial', alcance: 'Todos los distritos de su provincia' },
    { valor: 'DISTRITAL', nombre: 'Distrital', alcance: 'Solo su distrito' }
  ];
  /** Secciones del formulario: una a la vista, sin desplazar; el índice muestra qué falta. */
  readonly pasos: { id: string; titulo: string; lead: string; campos: CampoForm[] }[] = [
    { id: 'identidad', titulo: 'Identidad y acceso', lead: 'Cómo se identifica la municipalidad y con qué ingresa su cuenta titular.', campos: ['ruc', 'razonSocial', 'password'] },
    { id: 'jurisdiccion', titulo: 'Jurisdicción', lead: 'Define qué distritos cubre y, con ello, qué entidades le pertenecen.', campos: ['ubigeo'] },
    { id: 'sede', titulo: 'Sede', lead: 'Ubica el local principal. Busca el lugar o haz clic en el mapa; arrastra el pin para afinar.', campos: ['lat', 'lng'] },
    { id: 'contacto', titulo: 'Contacto', lead: 'Opcional. Se muestran en la ficha de la municipalidad.', campos: ['telefono', 'email'] }
  ];
  paso = 0;

  municipalidades: Municipalidad[] = [];
  cargando = false;
  guardando = false;
  errorCarga = '';

  filtroEstado: FiltroEstado = 'TODAS';
  busqueda = '';
  /** Municipalidad a la espera de confirmar la suspensión. */
  aSuspender: Municipalidad | null = null;

  modalAbierto = false;
  form: FormMunicipalidad = this.formVacio();
  errores: Partial<Record<CampoForm, string>> = {};
  errorModal = '';

  /** Vista previa local del logo mientras sube (object URL) o el logo ya guardado. */
  logoPreview: string | null = null;
  subiendoLogo = false;
  errorLogo = '';

  busquedaLugar = '';
  lugares: Lugar[] = [];
  buscandoLugar = false;
  errorLugar = '';

  /** Entidades del alcance (todas para SUPER_ADMIN, las suyas para el admin municipal): resumen en la ficha. */
  entidades: Entidad[] = [];
  private ubigeo: UbigeoMapa = {};
  seleccionadaId: string | null = null;

  ngOnInit(): void {
    this.cargar();
    this.ubigeoService.mapa$.subscribe({ next: m => { this.ubigeo = m; this.cdr.markForCheck(); }, error: () => {} });
  }

  /** Ficha visible: la elegida si sigue en la lista filtrada; si no, la primera. */
  get seleccionada(): Municipalidad | null {
    if (!this.esSuperAdmin) return this.municipalidades[0] ?? null;
    const lista = this.visibles;
    return lista.find(m => m.id === this.seleccionadaId) ?? lista[0] ?? null;
  }

  seleccionar(m: Municipalidad): void {
    this.seleccionadaId = m.id;
  }

  entidadesDe(m: Municipalidad): Entidad[] {
    // El admin municipal ya recibe solo las suyas, aunque una entidad antigua no traiga municipalityId.
    return this.esSuperAdmin ? this.entidades.filter(e => e.municipalityId === m.id) : this.entidades;
  }

  resumenEntidades(m: Municipalidad): { total: number; activas: number; porTipo: [string, number][] } {
    const lista = this.entidadesDe(m);
    const tipos = new Map<string, number>();
    lista.forEach(e => tipos.set(e.entityType, (tipos.get(e.entityType) ?? 0) + 1));
    return {
      total: lista.length,
      activas: lista.filter(e => e.status === 'ACTIVO').length,
      porTipo: [...tipos].sort((a, b) => b[1] - a[1])
    };
  }

  /** Departamento › provincia › distrito sede, y qué cubre según el tipo. */
  jurisdiccion(m: Municipalidad): { ruta: string[]; cobertura: string } | null {
    const u = m.ubigeo;
    if (!u || u.length !== 6) return null;
    const ruta = [u.slice(0, 2), u.slice(0, 4), u].map(c => titulo(this.ubigeo[c] ?? c));
    const distritos = UbigeoService.hijos(this.ubigeo, u.slice(0, 4)).length;
    const cobertura = m.type === 'PROVINCIAL'
      ? `Toda la provincia de ${ruta[1]}${distritos ? ` · ${distritos} distritos` : ''}`
      : `Solo el distrito de ${ruta[2]}`;
    return { ruta, cobertura };
  }

  tipoEntidad(t: string): string {
    return titulo((t ?? '').replace(/_/g, ' '));
  }

  distritoDe(e: Entidad): string {
    return e.ubigeo ? titulo(this.ubigeo[e.ubigeo] ?? e.ubigeo) : '';
  }

  /** Padrón (lo que muestra la lista) o ficha de una municipalidad con sus entidades. */
  async exportar(formato: 'pdf' | 'xlsx', ficha?: Municipalidad): Promise<void> {
    if (this.generandoReporte) return;
    const lista = ficha ? [ficha] : this.visibles;
    if (!lista.length) return;
    this.generandoReporte = true;
    try {
      if (ficha) {
        const fila = this.filaReporte(ficha);
        const ents = this.entidadesReporte(ficha);
        await (formato === 'pdf' ? this.municipalidadPdf.generarFicha(fila, ents) : this.municipalidadExcel.generarFicha(fila, ents));
      } else {
        const filas = lista.map(m => this.filaReporte(m));
        const filtros = {
          estado: { TODAS: 'Todas', ACTIVA: 'Activas', SUSPENDIDA: 'Suspendidas' }[this.filtroEstado],
          busqueda: this.busqueda.trim()
        };
        await (formato === 'pdf'
          ? this.municipalidadPdf.generarPadron(filas, filtros)
          : this.municipalidadExcel.generarPadron(filas, filtros, lista.flatMap(m => this.entidadesReporte(m))));
      }
      this.toast.success(`Reporte ${formato === 'pdf' ? 'PDF' : 'Excel'} generado.`);
    } catch {
      this.toast.error('No se pudo generar el reporte.');
    } finally {
      this.generandoReporte = false;
      this.cdr.markForCheck();
    }
  }

  private filaReporte(m: Municipalidad): MunicipalidadReporteFila {
    const j = this.jurisdiccion(m);
    return {
      nombre: m.businessName, ruc: m.ruc,
      tipo: m.type === 'PROVINCIAL' ? 'Provincial' : m.type === 'DISTRITAL' ? 'Distrital' : '',
      jurisdiccion: j ? `${j.ruta.join(' / ')} — ${j.cobertura}` : '',
      telefono: m.phone, email: m.email, direccion: m.address,
      entidades: this.entidadesDe(m).length,
      estado: m.status === 'ACTIVA' ? 'Activa' : 'Suspendida'
    };
  }

  private entidadesReporte(m: Municipalidad): EntidadReporteFila[] {
    return this.entidadesDe(m).map(e => ({
      municipalidad: m.businessName, nombre: e.businessName, ruc: e.ruc, tipo: this.tipoEntidad(e.entityType),
      distrito: this.distritoDe(e), estado: e.status === 'ACTIVO' ? 'Activa' : 'Inactiva'
    }));
  }

  ngOnDestroy(): void {
    unlockPageScroll(this.document);
  }

  cargar(): void {
    const mid = this.auth.getMunicipalidadId();
    const fuente: Observable<Municipalidad[]> = this.esSuperAdmin
      ? this.service.listar()
      : this.service.obtener(mid ?? '').pipe(map(m => [m]));
    this.cargando = true;
    this.errorCarga = '';
    // Sin entidades la ficha sigue siendo útil: un fallo ahí no bloquea la página.
    const entidades = this.entidadService.listar().pipe(catchError(() => of([] as Entidad[])));
    forkJoin({ lista: fuente, entidades }).subscribe({
      next: ({ lista, entidades }) => {
        this.municipalidades = lista;
        this.entidades = entidades;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.errorCarga = this.mensaje(err, 'No se pudieron cargar las municipalidades.');
        this.cargando = false;
        this.cdr.markForCheck();
      }
    });
  }

  get visibles(): Municipalidad[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.municipalidades.filter(m =>
      (this.filtroEstado === 'TODAS' || m.status === this.filtroEstado) &&
      (!q || m.businessName.toLowerCase().includes(q) || m.ruc.includes(q)));
  }

  conteo(estado: FiltroEstado): number {
    return estado === 'TODAS' ? this.municipalidades.length : this.municipalidades.filter(m => m.status === estado).length;
  }

  /** "Municipalidad Provincial de Cañete" → tipo "Municipalidad Provincial", lugar "Cañete". */
  nombre(m: Municipalidad): { tipo: string; lugar: string } {
    const match = m.businessName.match(PREFIJO);
    const lugar = match ? m.businessName.slice(match[0].length).trim() : '';
    return lugar
      ? { tipo: match![0].replace(/\s+de\s*$/i, '').trim(), lugar }
      : { tipo: '', lugar: m.businessName };
  }

  /** Iniciales del lugar para el sello cuando no hay logo (una o dos letras). */
  sigla(m: Municipalidad): string {
    const palabras = this.nombre(m).lugar.split(/\s+/).filter(p => p && !CONECTORES.has(p.toLowerCase()));
    if (palabras.length > 1) return (palabras[0][0] + palabras[1][0]).toUpperCase();
    return (palabras[0]?.[0] ?? '?').toUpperCase();
  }

  abrirNueva(): void {
    this.abrir(this.formVacio());
  }

  editar(m: Municipalidad): void {
    this.abrir({
      id: m.id,
      ruc: m.ruc,
      razonSocial: m.businessName,
      email: m.email ?? '',
      telefono: m.phone ?? '',
      direccion: m.address ?? '',
      logoUrl: m.logoUrl ?? '',
      lat: m.location ? String(m.location.lat) : '',
      lng: m.location ? String(m.location.lng) : '',
      ubigeo: m.ubigeo ?? '',
      tipo: m.type ?? 'DISTRITAL',
      password: ''
    });
  }

  /** RUC: solo dígitos, máximo 11. Se escribe en el input para que no aparezcan letras ni un instante. */
  escribirRuc(input: HTMLInputElement): void {
    const limpio = input.value.replace(/\D/g, '').slice(0, 11);
    input.value = limpio;
    this.form.ruc = limpio;
    // Avisa apenas los dos primeros dígitos no son 20, sin esperar a completar los 11.
    if (this.errores.ruc || (limpio.length >= 2 && !limpio.startsWith('20'))) this.validarCampo('ruc');
  }

  escribirTelefono(input: HTMLInputElement): void {
    const limpio = sanitizarTelefonoInput(input.value);
    input.value = limpio;
    this.form.telefono = limpio;
    if (this.errores.telefono) this.validarCampo('telefono');
  }

  async elegirLogo(archivo: File | null | undefined): Promise<void> {
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      this.errorLogo = 'El archivo debe ser una imagen (PNG, JPG, SVG o WebP).';
      return;
    }
    if (archivo.size > MAX_LOGO_MB * 1024 * 1024) {
      this.errorLogo = `La imagen supera ${MAX_LOGO_MB} MB.`;
      return;
    }
    this.liberarPreview();
    this.logoPreview = URL.createObjectURL(archivo);
    this.errorLogo = '';
    this.subiendoLogo = true;
    try {
      this.form.logoUrl = await this.service.subirLogo(archivo);
    } catch {
      this.errorLogo = 'No se pudo subir la imagen. Inténtalo de nuevo.';
      this.quitarLogo();
    } finally {
      this.subiendoLogo = false;
      this.cdr.markForCheck();
    }
  }

  quitarLogo(): void {
    this.liberarPreview();
    this.logoPreview = null;
    this.form.logoUrl = '';
  }

  get ubicacion(): GeoPoint | null {
    return this.form.lat && this.form.lng ? { lat: Number(this.form.lat), lng: Number(this.form.lng) } : null;
  }

  fijarUbicacion(p: GeoPoint | null): void {
    this.form.lat = p ? p.lat.toFixed(6) : '';
    this.form.lng = p ? p.lng.toFixed(6) : '';
    if (p) delete this.errores.lat;
  }

  /** Búsqueda en OpenStreetMap (Nominatim): sin clave; se consulta al enviar, no por tecla, por su límite de uso. El viewbox prioriza Lima sur–Cañete sin excluir el resto del país. */
  async buscarLugar(): Promise<void> {
    const q = this.busquedaLugar.trim();
    if (q.length < 3 || this.buscandoLugar) return;
    this.buscandoLugar = true;
    this.errorLugar = '';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=pe&viewbox=-77.3,-11.9,-75.4,-13.8&limit=5&accept-language=es&q=${encodeURIComponent(q)}`;
      const datos: { display_name: string; name?: string; lat: string; lon: string }[] = await (await fetch(url)).json();
      this.lugares = datos.map(d => {
        // display_name va de lo local a lo general; se muestran distrito, provincia y región para distinguir homónimos.
        const [primero, ...resto] = d.display_name.split(', ').filter(p => p !== 'Perú' && !/^\d+$/.test(p));
        return { nombre: d.name || primero, detalle: resto.slice(-3).join(', '), lat: Number(d.lat), lng: Number(d.lon) };
      });
      if (!this.lugares.length) this.errorLugar = 'Sin resultados. Prueba con el distrito o una calle cercana.';
    } catch {
      this.errorLugar = 'No se pudo buscar. Marca el punto directamente en el mapa.';
    } finally {
      this.buscandoLugar = false;
      this.cdr.markForCheck();
    }
  }

  elegirLugar(l: Lugar): void {
    this.fijarUbicacion({ lat: l.lat, lng: l.lng });
    if (!this.form.direccion.trim()) this.form.direccion = [l.nombre, l.detalle].filter(Boolean).join(', ').slice(0, 255);
    this.lugares = [];
    this.busquedaLugar = '';
  }

  cerrarModal(): void {
    this.liberarPreview();
    this.modalAbierto = false;
    unlockPageScroll(this.document);
  }

  validarCampo(campo: CampoForm): void {
    const msg = this.revisar(campo);
    if (msg) this.errores[campo] = msg;
    else delete this.errores[campo];
  }

  tieneError(campo: CampoForm): boolean {
    return !!this.errores[campo];
  }

  /** Ruta y cobertura del distrito elegido en el formulario, para confirmarlo antes de guardar. */
  get jurisdiccionForm(): { ruta: string[]; cobertura: string } | null {
    return this.jurisdiccion({ ubigeo: this.form.ubigeo, type: this.form.tipo } as Municipalidad);
  }

  pasoConError(i: number): boolean {
    return this.pasos[i].campos.some(c => this.errores[c]);
  }

  /** Resumen bajo cada sección del índice: el dato clave o lo que falta. */
  estadoPaso(i: number): { texto: string; listo: boolean } {
    if (this.pasoConError(i)) return { texto: 'Revisar', listo: false };
    const f = this.form;
    switch (this.pasos[i].id) {
      case 'identidad': return f.ruc.length === 11 && f.razonSocial.trim() ? { texto: f.ruc, listo: true } : { texto: 'Pendiente', listo: false };
      case 'jurisdiccion': return f.ubigeo.length === 6 ? { texto: titulo(this.ubigeo[f.ubigeo] ?? f.ubigeo), listo: true } : { texto: 'Sin distrito', listo: false };
      case 'sede': return f.lat ? { texto: 'Ubicada en el mapa', listo: true } : { texto: 'Sin marcar', listo: false };
      default: return f.telefono || f.email ? { texto: 'Registrado', listo: true } : { texto: 'Opcional', listo: false };
    }
  }

  async guardar(): Promise<void> {
    (['ruc', 'razonSocial', 'email', 'telefono', 'lat', 'lng', 'ubigeo', 'password'] as CampoForm[]).forEach(c => this.validarCampo(c));
    if (Object.keys(this.errores).length) {
      this.paso = this.pasos.findIndex((_, i) => this.pasoConError(i));
      this.errorModal = 'Revise los datos marcados en esta sección.';
      return;
    }
    const f = this.form;
    const body: GuardarMunicipalidadRequest = {
      ruc: f.ruc.trim(),
      businessName: f.razonSocial.trim(),
      email: f.email.trim() || null,
      phone: f.telefono.trim() || null,
      address: f.direccion.trim() || null,
      logoUrl: f.logoUrl.trim() || null,
      location: { lat: Number(f.lat), lng: Number(f.lng) },
      ubigeo: f.ubigeo,
      type: f.tipo,
      ...(f.password ? { password: f.password } : {})
    };
    this.guardando = true;
    this.errorModal = '';
    try {
      await firstValueFrom(f.id ? this.service.actualizar(f.id, body) : this.service.crear(body));
      this.toast.success(f.id ? 'Municipalidad actualizada.' : 'Municipalidad creada. Ya puede ingresar con su RUC.');
      this.cerrarModal();
      this.cargar();
    } catch (err) {
      this.errorModal = this.mensaje(err, 'No se pudo guardar la municipalidad.');
      this.toast.error(this.errorModal);
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  /** Suspender corta el acceso de todo su personal: pide confirmación. Reactivar es directo. */
  toggleEstado(m: Municipalidad): void {
    if (m.status === 'ACTIVA') this.aSuspender = m;
    else this.cambiarEstado(m);
  }

  confirmarSuspension(): void {
    const m = this.aSuspender;
    this.aSuspender = null;
    if (m) this.cambiarEstado(m);
  }

  private async cambiarEstado(m: Municipalidad): Promise<void> {
    const siguiente = m.status === 'ACTIVA' ? 'SUSPENDIDA' : 'ACTIVA';
    this.guardando = true;
    try {
      await firstValueFrom(this.service.cambiarEstado(m.id, siguiente));
      this.toast.success(siguiente === 'ACTIVA' ? 'Municipalidad reactivada.' : 'Municipalidad suspendida: su personal ya no podrá ingresar.');
      this.cargar();
    } catch (err) {
      this.toast.error(this.mensaje(err, 'No se pudo cambiar el estado.'));
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  private revisar(campo: CampoForm): string {
    const f = this.form;
    switch (campo) {
      case 'ruc':
        if (f.ruc.length >= 2 && !f.ruc.startsWith('20')) return 'El RUC de una municipalidad empieza con 20 (persona jurídica).';
        return REGEX_RUC.test(f.ruc.trim()) ? '' : 'El RUC debe tener 11 dígitos.';
      case 'razonSocial':
        return f.razonSocial.trim() ? '' : 'La razón social es obligatoria.';
      case 'email':
        return !f.email.trim() || REGEX_EMAIL.test(f.email.trim()) ? '' : 'Email inválido.';
      case 'telefono':
        return !f.telefono.trim() || REGEX_TELEFONO.test(f.telefono.trim()) ? '' : 'Teléfono inválido.';
      // lat y lng vienen del mapa: un solo mensaje, en 'lat'.
      case 'lat':
        return f.lat.trim() && f.lng.trim() ? '' : 'Marca la ubicación en el mapa.';
      case 'lng':
        return '';
      case 'ubigeo':
        return /^\d{6}$/.test(f.ubigeo) ? '' : 'Elige el departamento, la provincia y el distrito sede.';
      case 'password':
        // Obligatoria solo al crear; al editar, vacía = no cambiar la clave titular.
        if (!f.password) return f.id ? '' : 'Defina la clave de la cuenta titular.';
        return f.password.length >= MIN_PASSWORD ? '' : `Mínimo ${MIN_PASSWORD} caracteres.`;
    }
  }

  private abrir(form: FormMunicipalidad): void {
    this.form = form;
    this.logoPreview = form.logoUrl || null;
    this.errorLogo = '';
    this.busquedaLugar = '';
    this.lugares = [];
    this.errorLugar = '';
    this.errores = {};
    this.errorModal = '';
    this.paso = 0;
    this.modalAbierto = true;
    lockPageScroll(this.document);
  }

  private liberarPreview(): void {
    if (this.logoPreview?.startsWith('blob:')) URL.revokeObjectURL(this.logoPreview);
  }

  private formVacio(): FormMunicipalidad {
    return { id: null, ruc: '', razonSocial: '', email: '', telefono: '', direccion: '', logoUrl: '', lat: '', lng: '', ubigeo: '', tipo: 'DISTRITAL', password: '' };
  }

  private mensaje(err: unknown, porDefecto: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) return 'Ya existe una municipalidad con ese RUC.';
      if (err.status === 403) return 'No tiene permisos sobre esta municipalidad.';
      const data = err.error?.data ?? err.error;
      if (typeof data?.message === 'string') return data.message;
    }
    return porDefecto;
  }
}
