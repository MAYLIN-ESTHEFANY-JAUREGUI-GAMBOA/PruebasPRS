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
import { finalize } from 'rxjs/operators';

import { UsuarioAdmin, nombreCompletoUsuario } from '../../../core/models/usuario.model';
import { UsuarioAdminService } from '../../../core/services/usuario-admin';
import { CivicToastService } from '../../../shared/services/civic-toast.service';
import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';

type FiltroSolicitud = 'PENDIENTE_APROBACION' | 'RECHAZADO';
type FiltroEspera = 'todos' | 'antiguos' | 'recientes';
type FiltroReniec = 'todos' | 'coincide' | 'no-coincide' | 'error' | 'pendiente';
type SemaforoVerificacion = 'ok' | 'warn' | 'fail' | 'pending';

interface GrupoCola {
  clave: string;
  titulo: string;
  items: UsuarioAdmin[];
}

interface ConfirmacionModal {
  titulo: string;
  mensaje: string;
  confirmarLabel: string;
  peligro?: boolean;
  accion: () => void;
}

interface ItemChecklist {
  clave: string;
  titulo: string;
  detalle: string;
  estado: SemaforoVerificacion;
}

const MOTIVO_MIN = 8;
const MOTIVO_MAX = 400;

@Component({
  selector: 'app-solicitudes-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solicitudes-registro.html',
  styleUrl: './solicitudes-registro.css'
})
export class SolicitudesRegistro implements OnInit, OnDestroy {

  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly toast = inject(CivicToastService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly document = inject(DOCUMENT);

  pendientes: UsuarioAdmin[] = [];
  rechazadas: UsuarioAdmin[] = [];
  cargando = false;
  accionando = false;
  errorCarga = '';
  filtro: FiltroSolicitud = 'PENDIENTE_APROBACION';
  filtroEspera: FiltroEspera = 'todos';
  filtroReniec: FiltroReniec = 'todos';
  filtrosAbiertos = false;
  busqueda = '';
  seleccionada: UsuarioAdmin | null = null;
  motivoRechazo = '';
  rechazoTocado = false;
  mostrarRechazo = false;
  fotoAmpliada = false;
  modalConfirmacion: ConfirmacionModal | null = null;
  fotosRotas = new Set<string>();
  readonly motivoMax = MOTIVO_MAX;
  readonly motivoMin = MOTIVO_MIN;

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    unlockPageScroll(this.document);
  }

  get solicitudesFiltradas(): UsuarioAdmin[] {
    const fuente = this.filtro === 'RECHAZADO' ? this.rechazadas : this.pendientes;
    const q = this.busqueda.trim().toLowerCase();
    return fuente.filter(s => {
      if (this.filtroEspera === 'antiguos' && this.diasEspera(s) < 3) return false;
      if (this.filtroEspera === 'recientes' && this.diasEspera(s) >= 1) return false;
      if (this.filtroReniec !== 'todos' && this.claveReniec(s.verificacionReniecEstado) !== this.filtroReniec) {
        return false;
      }
      if (!q) return true;
      const haystack = [this.nombre(s), s.dni, s.email ?? '', s.telefono ?? ''].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  get gruposCola(): GrupoCola[] {
    const items = this.solicitudesFiltradas;
    if (this.filtro === 'RECHAZADO') {
      return this.agruparPorRecencia(items);
    }
    return this.agruparPorEspera(items);
  }

  get hayFiltroCola(): boolean {
    return this.hayFiltrosExtra || this.busqueda.trim().length > 0;
  }

  get hayFiltrosExtra(): boolean {
    return this.filtroEspera !== 'todos' || this.filtroReniec !== 'todos';
  }

  get conteoFiltrosActivos(): number {
    return (this.filtroEspera !== 'todos' ? 1 : 0) + (this.filtroReniec !== 'todos' ? 1 : 0);
  }

  get conteoPendientes(): number {
    return this.pendientes.length;
  }

  get conteoRechazadas(): number {
    return this.rechazadas.length;
  }

  get conteoUrgentes(): number {
    return this.pendientes.filter(s => this.diasEspera(s) >= 3).length;
  }

  get conteoRecientes(): number {
    return this.pendientes.filter(s => this.diasEspera(s) < 1).length;
  }

  get motivoInvalido(): boolean {
    return this.motivoRechazo.trim().length < MOTIVO_MIN;
  }

  get motivoRestante(): number {
    return Math.max(0, MOTIVO_MAX - this.motivoRechazo.length);
  }

  etiquetaCheck(estado: SemaforoVerificacion): string {
    switch (estado) {
      case 'ok': return 'Cumple';
      case 'fail': return 'No cumple';
      case 'warn': return 'Revisar';
      default: return 'Pendiente';
    }
  }

  etiquetaOpcion(s: UsuarioAdmin): string {
    const partes = [this.nombre(s), `DNI ${s.dni}`, this.esperaRelativa(s)];
    if (this.esUrgente(s)) partes.push('lleva más de 3 días');
    partes.push(this.etiquetaReniec(s.verificacionReniecEstado));
    return partes.join(', ');
  }

  /** Criterios de la lista que no cumplen (o no se pudieron verificar). */
  get checksPorRevisar(): number {
    return this.checklist.filter(c => c.estado !== 'ok').length;
  }

  get checklist(): ItemChecklist[] {
    const u = this.seleccionada;
    if (!u) return [];

    const fotoOk = this.tieneFoto(u);
    const reniec = this.semaforoReniec(u.verificacionReniecEstado);

    return [
      {
        clave: 'foto',
        titulo: 'Selfie de identidad',
        detalle: fotoOk
          ? 'Hay una foto para contrastar el rostro con los datos.'
          : 'La solicitud no incluye foto. Revise con más rigor antes de aprobar.',
        estado: fotoOk ? 'ok' : 'fail'
      },
      {
        clave: 'reniec',
        titulo: 'Verificación RENIEC',
        detalle: this.detalleReniec(u.verificacionReniecEstado),
        estado: reniec
      }
    ];
  }

  cargar(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.refrescarVista();

    this.usuarioAdminService.listarColaRegistro().pipe(
      finalize(() => {
        this.ngZone.run(() => {
          this.cargando = false;
          this.refrescarVista();
        });
      })
    ).subscribe({
      next: cola => {
        this.ngZone.run(() => {
          this.pendientes = cola.pendientes;
          this.rechazadas = cola.rechazadas;
          this.reconciliarSeleccion();
          this.refrescarVista();
        });
      },
      error: (err: unknown) => {
        this.ngZone.run(() => {
          this.errorCarga = err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes.';
          this.pendientes = [];
          this.rechazadas = [];
          this.seleccionada = null;
          this.refrescarVista();
        });
      }
    });
  }

  cambiarFiltro(filtro: FiltroSolicitud): void {
    if (this.filtro === filtro) return;
    this.filtro = filtro;
    this.filtroEspera = 'todos';
    this.filtroReniec = 'todos';
    this.cerrarRechazo();
    this.seleccionada = this.esEscritorio() ? (this.solicitudesFiltradas[0] ?? null) : null;
    this.refrescarVista();
  }

  verPendientes(): void {
    this.filtro = 'PENDIENTE_APROBACION';
    this.filtroEspera = 'todos';
    this.filtroReniec = 'todos';
    this.cerrarRechazo();
    this.seleccionada = this.esEscritorio() ? (this.solicitudesFiltradas[0] ?? null) : null;
    this.refrescarVista();
  }

  verEspera(espera: FiltroEspera): void {
    this.filtro = 'PENDIENTE_APROBACION';
    this.filtroEspera = espera;
    this.cerrarRechazo();
    this.seleccionada = this.esEscritorio() ? (this.solicitudesFiltradas[0] ?? null) : null;
    this.refrescarVista();
  }

  fijarFiltroEspera(filtro: FiltroEspera): void {
    this.filtroEspera = filtro;
    this.refrescarVista();
  }

  fijarFiltroReniec(filtro: FiltroReniec): void {
    this.filtroReniec = filtro;
    this.refrescarVista();
  }

  toggleFiltros(): void {
    this.filtrosAbiertos = !this.filtrosAbiertos;
  }

  limpiarFiltrosCola(): void {
    this.busqueda = '';
    this.filtroEspera = 'todos';
    this.filtroReniec = 'todos';
    this.refrescarVista();
  }

  seleccionar(u: UsuarioAdmin): void {
    if (this.seleccionada?.id === u.id) return;
    this.seleccionada = u;
    this.cerrarRechazo();
    this.fotoAmpliada = false;
    this.refrescarVista();
    queueMicrotask(() => this.scrollSeleccionada());
  }

  volverACola(): void {
    this.seleccionada = null;
    this.cerrarRechazo();
    this.refrescarVista();
  }

  nombre(u: UsuarioAdmin): string {
    return nombreCompletoUsuario(u);
  }

  iniciales(u: UsuarioAdmin): string {
    const n = (u.nombres ?? '').trim();
    const a = (u.apellidos ?? '').trim();
    const i1 = n.charAt(0);
    const i2 = a.charAt(0) || n.charAt(1) || '';
    return (i1 + i2).toUpperCase() || '—';
  }

  tieneFoto(u: UsuarioAdmin): boolean {
    return !!u.fotoPerfilUrl && !this.fotosRotas.has(u.id);
  }

  esUrgente(u: UsuarioAdmin): boolean {
    return this.filtro === 'PENDIENTE_APROBACION' && this.diasEspera(u) >= 3;
  }

  onFotoError(id: string): void {
    this.fotosRotas.add(id);
    this.refrescarVista();
  }

  etiquetaReniec(estado?: string | null): string {
    switch ((estado ?? 'NO_CONSULTADO').toUpperCase()) {
      case 'COINCIDE': return 'RENIEC coincide';
      case 'NO_COINCIDE': return 'RENIEC no coincide';
      case 'ERROR': return 'Error RENIEC';
      default: return 'RENIEC pendiente';
    }
  }

  etiquetaReniecCorta(estado?: string | null): string {
    switch ((estado ?? 'NO_CONSULTADO').toUpperCase()) {
      case 'COINCIDE': return 'Coincide';
      case 'NO_COINCIDE': return 'No coincide';
      case 'ERROR': return 'Error';
      default: return 'Sin consulta';
    }
  }

  claveReniec(estado?: string | null): Exclude<FiltroReniec, 'todos'> {
    switch ((estado ?? 'NO_CONSULTADO').toUpperCase()) {
      case 'COINCIDE': return 'coincide';
      case 'NO_COINCIDE': return 'no-coincide';
      case 'ERROR': return 'error';
      default: return 'pendiente';
    }
  }

  esperaRelativa(u: UsuarioAdmin): string {
    const raw = u.registroSolicitadoEn ?? u.creadoEn;
    if (!raw) return 'Sin fecha';
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return 'Sin fecha';
    const delta = Date.now() - ms;
    if (delta < 45_000) return 'Ahora';
    if (delta < 3_600_000) return `Hace ${Math.max(1, Math.round(delta / 60_000))} min`;
    if (delta < 86_400_000) return `Hace ${Math.max(1, Math.round(delta / 3_600_000))} h`;
    const dias = Math.round(delta / 86_400_000);
    if (dias === 1) return 'Ayer';
    if (dias < 14) return `Hace ${dias} días`;
    return new Date(ms).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  fechaCompleta(raw?: string | null): string {
    if (!raw) return '—';
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  confirmarAprobar(u: UsuarioAdmin): void {
    if (this.accionando) return;
    this.abrirConfirmacion({
      titulo: '¿Habilitar esta cuenta?',
      mensaje: `${this.nombre(u)} (DNI ${u.dni}) podrá ingresar a la app de emergencias. Confirme que la selfie corresponde a la persona.`,
      confirmarLabel: 'Aprobar y habilitar',
      accion: () => this.aprobar(u)
    });
  }

  abrirRechazo(): void {
    if (!this.seleccionada || this.accionando) return;
    this.mostrarRechazo = true;
    this.rechazoTocado = false;
    this.bloquearScroll(true);
    queueMicrotask(() => {
      this.document.getElementById('motivo-rechazo')?.focus();
    });
  }

  cerrarRechazo(): void {
    this.mostrarRechazo = false;
    this.motivoRechazo = '';
    this.rechazoTocado = false;
    if (!this.modalConfirmacion && !this.fotoAmpliada) {
      this.bloquearScroll(false);
    }
  }

  confirmarRechazo(u: UsuarioAdmin): void {
    this.rechazoTocado = true;
    if (this.motivoInvalido) {
      this.document.getElementById('motivo-rechazo')?.focus();
      return;
    }
    this.rechazar(u);
  }

  abrirFoto(): void {
    if (this.seleccionada && this.tieneFoto(this.seleccionada)) {
      this.fotoAmpliada = true;
      this.bloquearScroll(true);
      queueMicrotask(() => {
        (this.document.querySelector('.sol-lightbox__close') as HTMLElement | null)?.focus();
      });
    }
  }

  cerrarFoto(): void {
    this.fotoAmpliada = false;
    if (!this.modalConfirmacion && !this.mostrarRechazo) this.bloquearScroll(false);
  }

  abrirConfirmacion(config: ConfirmacionModal): void {
    this.modalConfirmacion = config;
    this.bloquearScroll(true);
    queueMicrotask(() => {
      (this.document.getElementById('sol-confirm-modal') as HTMLElement | null)?.focus();
    });
  }

  cerrarConfirmacion(): void {
    this.modalConfirmacion = null;
    if (!this.fotoAmpliada && !this.mostrarRechazo) this.bloquearScroll(false);
  }

  confirmarAccion(): void {
    const accion = this.modalConfirmacion?.accion;
    this.cerrarConfirmacion();
    accion?.();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalConfirmacion) {
      this.cerrarConfirmacion();
      return;
    }
    if (this.fotoAmpliada) {
      this.cerrarFoto();
      return;
    }
    if (this.mostrarRechazo) {
      this.cerrarRechazo();
    }
  }

  navegarTabs(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    const destino: FiltroSolicitud = event.key === 'ArrowRight' || event.key === 'End'
      ? 'RECHAZADO'
      : 'PENDIENTE_APROBACION';
    this.cambiarFiltro(destino);
    queueMicrotask(() => {
      const id = destino === 'RECHAZADO' ? 'sol-tab-rechazadas' : 'sol-tab-pendientes';
      this.document.getElementById(id)?.focus();
    });
  }

  navegarCola(event: KeyboardEvent): void {
    const items = this.solicitudesFiltradas;
    if (!items.length) return;
    const idx = Math.max(0, items.findIndex(s => s.id === this.seleccionada?.id));
    let next = idx;
    if (event.key === 'ArrowDown') next = Math.min(items.length - 1, idx + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, idx - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const destino = items[next];
    this.seleccionar(destino);
    queueMicrotask(() => this.document.getElementById(`sol-item-${destino.id}`)?.focus());
  }

  private aprobar(u: UsuarioAdmin): void {
    if (this.accionando) return;
    this.accionando = true;
    this.usuarioAdminService.aprobarRegistro(u.id).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.toast.success(`Cuenta de ${this.nombre(u)} habilitada.`);
          this.accionando = false;
          this.seleccionada = null;
          this.cargar();
        });
      },
      error: (err: unknown) => {
        this.ngZone.run(() => {
          this.toast.error(err instanceof Error ? err.message : 'No se pudo aprobar.');
          this.accionando = false;
          this.refrescarVista();
        });
      }
    });
  }

  private rechazar(u: UsuarioAdmin): void {
    if (this.accionando) return;
    const motivo = this.motivoRechazo.trim();
    this.accionando = true;
    this.usuarioAdminService.rechazarRegistro(u.id, motivo).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.toast.success('Solicitud rechazada.');
          this.accionando = false;
          this.cerrarRechazo();
          this.seleccionada = null;
          this.cargar();
        });
      },
      error: (err: unknown) => {
        this.ngZone.run(() => {
          this.toast.error(err instanceof Error ? err.message : 'No se pudo rechazar.');
          this.accionando = false;
          this.refrescarVista();
        });
      }
    });
  }

  private reconciliarSeleccion(): void {
    const lista = this.solicitudesFiltradas;
    if (this.seleccionada) {
      const sigue = lista.find(s => s.id === this.seleccionada?.id);
      this.seleccionada = sigue ?? (this.esEscritorio() ? lista[0] ?? null : null);
    } else if (this.esEscritorio()) {
      this.seleccionada = lista[0] ?? null;
    }
    if (!this.seleccionada) this.cerrarRechazo();
  }

  private esEscritorio(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;
  }

  private diasEspera(u: UsuarioAdmin): number {
    const raw = u.registroSolicitadoEn ?? u.creadoEn;
    if (!raw) return 0;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return 0;
    return Math.max(0, (Date.now() - ms) / 86_400_000);
  }

  private agruparPorEspera(items: UsuarioAdmin[]): GrupoCola[] {
    const urgentes: UsuarioAdmin[] = [];
    const semana: UsuarioAdmin[] = [];
    const recientes: UsuarioAdmin[] = [];
    for (const u of items) {
      const dias = this.diasEspera(u);
      if (dias >= 3) urgentes.push(u);
      else if (dias >= 1) semana.push(u);
      else recientes.push(u);
    }
    return [
      { clave: 'urgente', titulo: 'Llevan más de 3 días', items: urgentes },
      { clave: 'semana', titulo: 'Esta semana', items: semana },
      { clave: 'recientes', titulo: 'Últimas 24 horas', items: recientes }
    ].filter(g => g.items.length > 0);
  }

  private agruparPorRecencia(items: UsuarioAdmin[]): GrupoCola[] {
    const hoy: UsuarioAdmin[] = [];
    const semana: UsuarioAdmin[] = [];
    const anteriores: UsuarioAdmin[] = [];
    for (const u of items) {
      const dias = this.diasEspera(u);
      if (dias < 1) hoy.push(u);
      else if (dias < 7) semana.push(u);
      else anteriores.push(u);
    }
    return [
      { clave: 'hoy', titulo: 'Hoy', items: hoy },
      { clave: 'semana', titulo: 'Esta semana', items: semana },
      { clave: 'anteriores', titulo: 'Anteriores', items: anteriores }
    ].filter(g => g.items.length > 0);
  }

  private scrollSeleccionada(): void {
    const id = this.seleccionada?.id;
    if (!id) return;
    this.document.getElementById(`sol-item-${id}`)?.scrollIntoView({
      block: 'nearest',
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth'
    });
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  semaforoReniec(estado?: string | null): SemaforoVerificacion {
    switch ((estado ?? 'NO_CONSULTADO').toUpperCase()) {
      case 'COINCIDE': return 'ok';
      case 'NO_COINCIDE': return 'fail';
      case 'ERROR': return 'warn';
      default: return 'pending';
    }
  }

  private detalleReniec(estado?: string | null): string {
    switch ((estado ?? 'NO_CONSULTADO').toUpperCase()) {
      case 'COINCIDE': return 'Los datos coinciden con el padrón de RENIEC.';
      case 'NO_COINCIDE': return 'Los datos no coinciden. Contraste la selfie con el DNI con cuidado.';
      case 'ERROR': return 'No se pudo consultar RENIEC. Verifique identidad de forma manual.';
      default: return 'Aún no hay consulta a RENIEC para esta solicitud.';
    }
  }

  private bloquearScroll(bloquear: boolean): void {
    if (bloquear) lockPageScroll(this.document);
    else unlockPageScroll(this.document);
  }

  private refrescarVista(): void {
    try {
      this.cdr.detectChanges();
    } catch {
      /* noop */
    }
  }
}
