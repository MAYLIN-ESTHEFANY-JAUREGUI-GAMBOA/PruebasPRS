import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IncidentService } from '../../../../../core/services/incident';
import { AuthService } from '../../../../../core/auth/auth.service';
import { EntidadService, entidadADetalle } from '../../../../../core/services/entidad';
import { CivicToastService } from '../../../../../shared/services/civic-toast.service';
import { 
  Incident, 
  EntityDetail, 
  EmergencyType,
  TipoEmergencia,
  LinkedAlertDTO
} from '../../../../../core/models/incident';

export type ModoEscalamiento = 'NINGUNO' | 'APOYO' | 'DERIVAR' | 'TRANSFERIR' | 'DIVIDIR' | 'FUSIONAR';

export interface EscalamientoHistorialItem {
  tipo: ModoEscalamiento | 'SISTEMA';
  icono: string;
  titulo: string;
  detalle: string;
  fechaFormateada: string;
  badgeTexto: string;
  badgeClase: string;
}

export interface EntidadItemSelector {
  id: string;
  razonSocial: string;
  tipoEntidad: string;
  icono: string;
  colorChip: string;
  operadoresActivos: number;
  distanciaKm: number;
  tiempoEstimadoMin: number;
  esPrueba: boolean;
  esRecomendada: boolean;
  yaEnSala: boolean;
  sinOperadores: boolean;
  raw: EntityDetail;
}

@Component({
  selector: 'app-incident-escalation, app-emergencias-escalamiento',
  imports: [CommonModule, FormsModule],
  templateUrl: './incident-escalation.html',
  styleUrls: ['./incident-escalation.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IncidentEscalationComponent implements OnInit {
  private readonly emergenciaService = inject(IncidentService);
  private readonly authService = inject(AuthService);
  private readonly entidadService = inject(EntidadService);
  private readonly civicToast = inject(CivicToastService);

  private readonly STORAGE_LAST_ACTION_KEY = 'prs_last_escalation_action';

  readonly incident = input.required<Incident>({ alias: 'incidente' });
  readonly emergencyTypesList = input<{ value: EmergencyType; label: string; icono: string }[]>([], { alias: 'tiposEmergenciaLista' });
  readonly incidentAlerts = input<LinkedAlertDTO[]>([], { alias: 'alertasDelIncidente' });
  readonly myEntityId = input<string>('', { alias: 'miEntidadId' });
  readonly operationSuccess = output<ModoEscalamiento>({ alias: 'operacionExitosa' });

  // Getters para compatibilidad con código existente
  get incidente(): Incident { return this.incident(); }
  get tiposEmergenciaLista() { return this.emergencyTypesList(); }
  get alertasDelIncidente(): LinkedAlertDTO[] { return this.incidentAlerts(); }
  private _internalEntityId = '';
  get miEntidadId(): string { return this.myEntityId() || this._internalEntityId; }
  set miEntidadId(val: string) { this._internalEntityId = val; }
  get operacionExitosa() { return this.operationSuccess; }

  entidadesDisponibles: EntityDetail[] = []; 
  modoActivo: ModoEscalamiento = 'NINGUNO';
  procesando = false;
  entidadesFiltradas: EntityDetail[] = [];
  
  // Sugerencia de última acción del operador
  ultimaAccionOperador: ModoEscalamiento | null = null;

  // Confirmación reforzada para acciones críticas
  confirmacionDerivar = false;
  confirmacionTransferir = false;

  // Estados del Selector Propio de Entidades
  busquedaEntidad: string = '';
  filtroTipoEntidad: string = 'TODAS';
  ordenEntidad: 'CERCANIA' | 'NOMBRE' = 'CERCANIA';
  selectorEntidadExpandido: boolean = true;
  selectorTransferirExpandido: boolean = true;
  selectorDerivarExpandido: boolean = true;

  get entidadesOtras(): EntityDetail[] {
    return this.entidadesDisponibles.filter(e => e.id !== this.miEntidadId);
  }

  entidadesParaDerivar: EntityDetail[] = [];
  entidadesParaDividir: EntityDetail[] = [];
  
  formApoyo = { entidadDestinoId: '', motivo: '' };
  formDerivar = { nuevoTipo: '' as TipoEmergencia, entidadDestinoId: '', motivo: '' };
  formTransferir = { nuevaEntidadId: '', motivo: '' };
  formDividir = { alertasSeleccionadas: [] as string[], nuevoTipo: '' as TipoEmergencia, entidadDestinoId: '' };
  formFusionar = { idDuplicado: '', motivo: '' };

  readonly opcionesTipoDerivar: {
    value: TipoEmergencia;
    label: string;
    subtitulo: string;
    icono: string;
  }[] = [
    {
      value: 'SEGURIDAD',
      label: 'Seguridad',
      subtitulo: 'Policía / Serenazgo',
      icono: '👮'
    },
    {
      value: 'SALUD',
      label: 'Salud',
      subtitulo: 'SAMU / Hospitales',
      icono: '⚕️'
    },
    {
      value: 'INCENDIO',
      label: 'Incendio',
      subtitulo: 'Cuerpo de Bomberos',
      icono: '🔥'
    }
  ];

  seleccionarTipoDerivar(tipo: TipoEmergencia): void {
    this.formDerivar.nuevoTipo = tipo;
    this.onTipoDerivarChange(tipo);
  }

  // Disponibilidad de acciones
  get puedeDividir(): boolean {
    return (this.alertasDelIncidente?.length || 0) > 1;
  }

  get motivoDividirDeshabilitado(): string {
    return !this.puedeDividir ? 'Requiere al menos 2 alertas en este caso' : '';
  }

  get puedeFusionar(): boolean {
    return true;
  }

  ngOnInit(): void {
    this.miEntidadId = this.authService.getEntidadId() || '';
    this.cargarEntidades();
    this.cargarUltimaAccion();
  }

  private cargarUltimaAccion(): void {
    try {
      const userId = this.authService.getUserId() || 'operador';
      const guardada = localStorage.getItem(`t:${this.STORAGE_LAST_ACTION_KEY}_${userId}`);
      if (guardada && ['APOYO', 'DERIVAR', 'TRANSFERIR', 'DIVIDIR', 'FUSIONAR'].includes(guardada)) {
        this.ultimaAccionOperador = guardada as ModoEscalamiento;
      }
    } catch (e) {
      console.warn('No se pudo leer localStorage para última acción:', e);
    }
  }

  private registrarUltimaAccion(modo: ModoEscalamiento): void {
    try {
      const userId = this.authService.getUserId() || 'operador';
      localStorage.setItem(`t:${this.STORAGE_LAST_ACTION_KEY}_${userId}`, modo);
      this.ultimaAccionOperador = modo;
    } catch (e) {
      console.warn('No se pudo guardar en localStorage la última acción:', e);
    }
  }

  private cargarEntidades(): void {
    this.entidadService.listar().subscribe({
      next: (entidades) => {
        this.entidadesDisponibles = entidades.map(entidadADetalle);
      },
      error: (err) => {
        console.error('❌ Error al cargar la lista de entidades en escalamiento:', err);
      }
    });
  }

  setModo(modo: ModoEscalamiento): void {
    if (this.modoActivo === modo) {
      this.modoActivo = 'NINGUNO';
    } else {
      this.modoActivo = modo;
    }
    this.confirmacionDerivar = false;
    this.confirmacionTransferir = false;
    this.busquedaEntidad = '';
    this.filtroTipoEntidad = 'TODAS';
    this.ordenEntidad = 'CERCANIA';
    this.selectorEntidadExpandido = !this.formApoyo.entidadDestinoId;
    this.selectorTransferirExpandido = !this.formTransferir.nuevaEntidadId;
    this.selectorDerivarExpandido = !this.formDerivar.entidadDestinoId;
  }

  cancelarAccion(): void {
    this.modoActivo = 'NINGUNO';
    this.confirmacionDerivar = false;
    this.confirmacionTransferir = false;
    this.selectorEntidadExpandido = true;
    this.selectorTransferirExpandido = true;
    this.selectorDerivarExpandido = true;
    this.busquedaEntidad = '';
    this.filtroTipoEntidad = 'TODAS';
    this.resetFormularios();
  }

  private resetFormularios(): void {
    this.formApoyo = { entidadDestinoId: '', motivo: '' };
    this.formDerivar = { nuevoTipo: '' as TipoEmergencia, entidadDestinoId: '', motivo: '' };
    this.formTransferir = { nuevaEntidadId: '', motivo: '' };
    this.formDividir = { alertasSeleccionadas: [], nuevoTipo: '' as TipoEmergencia, entidadDestinoId: '' };
    this.formFusionar = { idDuplicado: '', motivo: '' };
  }

  getLabelModo(modo: ModoEscalamiento): { titulo: string, icono: string } {
    switch (modo) {
      case 'APOYO': return { titulo: 'Solicitar apoyo', icono: '🤝' };
      case 'DERIVAR': return { titulo: 'Derivar', icono: '🔄' };
      case 'TRANSFERIR': return { titulo: 'Transferir por error', icono: '⬅️' };
      case 'DIVIDIR': return { titulo: 'Dividir alertas', icono: '✂️' };
      case 'FUSIONAR': return { titulo: 'Fusionar', icono: '🔗' };
      default: return { titulo: '', icono: '' };
    }
  }

  // =========================================================================
  // LOGICA DEL SELECTOR PROPIO DE ENTIDADES (CON TARJETAS, BUSQUEDA Y FILTROS)
  // =========================================================================

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  mapearEntidadItem(e: EntityDetail): EntidadItemSelector {
    const nombre = e.businessName || '';
    const nombreLower = nombre.toLowerCase();
    const tipo = (e.entityType || '').toUpperCase();

    // Detección de entidades de prueba
    const esPrueba = nombreLower.includes('prueba') || 
                     nombreLower.includes('test') || 
                     nombreLower.includes('pruebita') ||
                     nombreLower.includes('madre (prueba)');

    // Detección de si ya está invitada o presente en la sala
    const responsables = this.incidente?.responsibleEntityIds || [];
    const yaEnSala = responsables.includes(e.id);

    // Detección de recomendadas según tipo de emergencia del incidente
    const tipoIncidente = (this.incidente?.emergencyType || '').toUpperCase();
    let esRecomendada = false;

    if (tipoIncidente.includes('SALUD') || tipoIncidente.includes('MEDICA')) {
      esRecomendada = tipo.includes('SALUD') || tipo.includes('HOSPITAL') || tipo.includes('AMBULANCIA') || tipo.includes('BOMBERO');
    } else if (tipoIncidente.includes('INCENDIO') || tipoIncidente.includes('EXPLOSION')) {
      esRecomendada = tipo.includes('BOMBERO') || tipo.includes('INCENDIO') || tipo.includes('SALUD');
    } else if (tipoIncidente.includes('ROBO') || tipoIncidente.includes('SEGURIDAD') || tipoIncidente.includes('VIOLENCIA')) {
      esRecomendada = tipo.includes('POLICIA') || tipo.includes('SEGURIDAD') || tipo.includes('SERENAZGO');
    } else if (tipoIncidente.includes('ACCIDENTE')) {
      esRecomendada = tipo.includes('SALUD') || tipo.includes('BOMBERO') || tipo.includes('POLICIA');
    } else {
      esRecomendada = tipo.includes('BOMBERO') || tipo.includes('POLICIA') || tipo.includes('SALUD');
    }

    // Ícono y color según tipo de entidad
    let icono = '🏢';
    let colorChip = 'bg-slate-100 text-slate-700 border-slate-200';

    if (tipo.includes('SALUD') || tipo.includes('HOSPITAL') || tipo.includes('MEDIC') || nombreLower.includes('hospital') || nombreLower.includes('posta')) {
      icono = '🏥';
      colorChip = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (tipo.includes('BOMBERO') || nombreLower.includes('bombero')) {
      icono = '🚒';
      colorChip = 'bg-orange-50 text-orange-700 border-orange-200';
    } else if (tipo.includes('POLICIA') || nombreLower.includes('comisar') || nombreLower.includes('pnp')) {
      icono = '🛡️';
      colorChip = 'bg-blue-50 text-blue-700 border-blue-200';
    } else if (tipo.includes('SERENAZGO') || nombreLower.includes('serenazgo')) {
      icono = '🚔';
      colorChip = 'bg-cyan-50 text-cyan-700 border-cyan-200';
    } else if (tipo.includes('RESCATE')) {
      icono = '🛟';
      colorChip = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (tipo.includes('MUNICIPALIDAD')) {
      icono = '🏛️';
      colorChip = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }

    // Cálculo o simulación de distancia (preparado para backend o Haversine)
    let distanciaKm = 2.5;
    if (e.distanciaKm != null) {
      distanciaKm = e.distanciaKm;
    } else {
      // Determinista por hash de ID para mantener consistencia mientras llega del back
      const h = this.hashString(e.id || nombre);
      distanciaKm = Math.round(((h % 65 + 10) / 10) * 10) / 10;
      // Ejemplos directos reconocibles:
      if (nombreLower.includes('rezola')) distanciaKm = 1.2;
      else if (nombreLower.includes('b49') || nombreLower.includes('bomberos')) distanciaKm = 2.8;
      else if (nombreLower.includes('san vicente') && nombreLower.includes('comisar')) distanciaKm = 3.1;
      else if (nombreLower.includes('posta')) distanciaKm = 5.4;
    }

    // Tiempo estimado en minutos (~4 min para 1.2 km, etc.)
    const tiempoEstimadoMin = e.tiempoEstimadoMin != null 
      ? e.tiempoEstimadoMin 
      : Math.max(3, Math.round(distanciaKm * 2.8));

    // Operadores activos (preparado para endpoint de presencia)
    let operadoresActivos = 0;
    if (e.operadoresActivos != null) {
      operadoresActivos = e.operadoresActivos;
    } else if (esPrueba || nombreLower.includes('posta') || nombreLower.includes('sis')) {
      operadoresActivos = 0;
    } else {
      const h = this.hashString(e.id || nombre);
      operadoresActivos = (h % 3) + 1; // 1, 2 o 3
      if (nombreLower.includes('rezola')) operadoresActivos = 3;
      else if (nombreLower.includes('b49')) operadoresActivos = 2;
      else if (nombreLower.includes('comisar')) operadoresActivos = 1;
    }

    return {
      id: e.id,
      razonSocial: e.businessName ?? '',
      tipoEntidad: e.entityType || 'General',
      icono,
      colorChip,
      operadoresActivos,
      distanciaKm,
      tiempoEstimadoMin,
      esPrueba,
      esRecomendada,
      yaEnSala,
      sinOperadores: operadoresActivos === 0,
      raw: e
    };
  }

  private procesarFiltroYOrden(lista: EntityDetail[]): EntidadItemSelector[] {
    const query = (this.busquedaEntidad || '').trim().toLowerCase();
    const filtroTipo = this.filtroTipoEntidad.toUpperCase();

    let items = lista.map(e => this.mapearEntidadItem(e));

    // Filtro por texto de búsqueda
    if (query) {
      items = items.filter(it => 
        it.razonSocial.toLowerCase().includes(query) ||
        it.tipoEntidad.toLowerCase().includes(query)
      );
    }

    // Filtro por chip de tipo
    if (filtroTipo !== 'TODAS') {
      items = items.filter(it => {
        const t = it.tipoEntidad.toUpperCase();
        const n = it.razonSocial.toUpperCase();
        if (filtroTipo === 'SALUD') return t.includes('SALUD') || t.includes('HOSPITAL') || n.includes('HOSPITAL') || n.includes('POSTA');
        if (filtroTipo === 'BOMBEROS') return t.includes('BOMBERO') || n.includes('BOMBERO');
        if (filtroTipo === 'POLICIA') return t.includes('POLICIA') || n.includes('COMISAR') || n.includes('PNP');
        if (filtroTipo === 'SERENAZGO') return t.includes('SERENAZGO') || n.includes('SERENAZGO');
        return t.includes(filtroTipo);
      });
    }

    // Ordenamiento
    if (this.ordenEntidad === 'CERCANIA') {
      items.sort((a, b) => a.distanciaKm - b.distanciaKm);
    } else {
      items.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));
    }

    return items;
  }

  // Listas divididas para el selector de "Solicitar Apoyo"
  get entidadesApoyoFiltradas(): EntidadItemSelector[] {
    return this.procesarFiltroYOrden(this.entidadesOtras);
  }

  get entidadesApoyoRecomendadas(): EntidadItemSelector[] {
    return this.entidadesApoyoFiltradas.filter(e => e.esRecomendada && !e.esPrueba && !e.yaEnSala);
  }

  get otrasEntidadesApoyo(): EntidadItemSelector[] {
    return this.entidadesApoyoFiltradas.filter(e => !e.esRecomendada && !e.esPrueba && !e.yaEnSala);
  }

  get entidadesApoyoEnSala(): EntidadItemSelector[] {
    return this.entidadesApoyoFiltradas.filter(e => e.yaEnSala);
  }

  get entidadesApoyoPrueba(): EntidadItemSelector[] {
    return this.entidadesApoyoFiltradas.filter(e => e.esPrueba && !e.yaEnSala);
  }

  get entidadSeleccionadaApoyo(): EntidadItemSelector | null {
    if (!this.formApoyo.entidadDestinoId) return null;
    const raw = this.entidadesOtras.find(e => e.id === this.formApoyo.entidadDestinoId);
    return raw ? this.mapearEntidadItem(raw) : null;
  }

  seleccionarEntidadApoyo(e: EntidadItemSelector): void {
    if (e.yaEnSala) return;
    this.formApoyo.entidadDestinoId = e.id;
    this.selectorEntidadExpandido = false;
  }

  cambiarEntidadApoyo(): void {
    this.selectorEntidadExpandido = true;
  }

  // Selector para "Transferir por error"
  get entidadesTransferirFiltradas(): EntidadItemSelector[] {
    return this.procesarFiltroYOrden(this.entidadesOtras);
  }

  get entidadesTransferirRecomendadas(): EntidadItemSelector[] {
    return this.entidadesTransferirFiltradas.filter(e => e.esRecomendada && !e.esPrueba);
  }

  get otrasEntidadesTransferir(): EntidadItemSelector[] {
    return this.entidadesTransferirFiltradas.filter(e => !e.esRecomendada && !e.esPrueba);
  }

  get entidadesTransferirPrueba(): EntidadItemSelector[] {
    return this.entidadesTransferirFiltradas.filter(e => e.esPrueba);
  }

  get entidadSeleccionadaTransferir(): EntidadItemSelector | null {
    if (!this.formTransferir.nuevaEntidadId) return null;
    const raw = this.entidadesOtras.find(e => e.id === this.formTransferir.nuevaEntidadId);
    return raw ? this.mapearEntidadItem(raw) : null;
  }

  seleccionarEntidadTransferir(e: EntidadItemSelector): void {
    this.formTransferir.nuevaEntidadId = e.id;
    this.selectorTransferirExpandido = false;
  }

  cambiarEntidadTransferir(): void {
    this.selectorTransferirExpandido = true;
  }

  // Selector para "Derivar"
  get entidadesDerivarFiltradas(): EntidadItemSelector[] {
    return this.procesarFiltroYOrden(this.entidadesParaDerivar);
  }

  get entidadesDerivarRecomendadas(): EntidadItemSelector[] {
    return this.entidadesDerivarFiltradas.filter(e => !e.esPrueba);
  }

  get entidadesDerivarPrueba(): EntidadItemSelector[] {
    return this.entidadesDerivarFiltradas.filter(e => e.esPrueba);
  }

  get entidadSeleccionadaDerivar(): EntidadItemSelector | null {
    if (!this.formDerivar.entidadDestinoId) return null;
    const raw = this.entidadesParaDerivar.find(e => e.id === this.formDerivar.entidadDestinoId);
    return raw ? this.mapearEntidadItem(raw) : null;
  }

  seleccionarEntidadDerivar(e: EntidadItemSelector): void {
    this.formDerivar.entidadDestinoId = e.id;
    this.selectorDerivarExpandido = false;
  }

  cambiarEntidadDerivar(): void {
    this.selectorDerivarExpandido = true;
  }

  // --- HISTORIAL DE ESCALAMIENTOS PARA ESTE CASO ---
  get historialEscalamientos(): EscalamientoHistorialItem[] {
    const items: EscalamientoHistorialItem[] = [];

    // 1. Entidades de apoyo activas / colaboradoras
    const idsResponsables = this.incidente?.responsibleEntityIds || [];
    const otrasEntidadesAsignadas = idsResponsables.filter(id => id !== this.miEntidadId);
    
    for (const entidadId of otrasEntidadesAsignadas) {
      const ent = this.entidadesDisponibles.find(e => e.id === entidadId);
      const nombre = ent?.businessName || `Entidad ID: ${entidadId.substring(0, 8)}...`;
      items.push({
        tipo: 'APOYO',
        icono: '🤝',
        titulo: `Apoyo activo · ${nombre}`,
        detalle: 'Institución invitada y conectada a la sala de crisis.',
        fechaFormateada: 'Activo en este incidente',
        badgeTexto: 'Colaborador',
        badgeClase: 'bg-indigo-100 text-indigo-800 border-indigo-200'
      });
    }

    // 2. Eventos relevantes de la bitácora
    const eventos = this.incidente?.logEvents || [];
    for (const ev of eventos) {
      const accionUpper = (ev.action || '').toUpperCase();
      const detalle = ev.detail || '';

      if (accionUpper.includes('APOYO') || accionUpper.includes('SALA_CRISIS')) {
        items.push({
          tipo: 'APOYO',
          icono: '🤝',
          titulo: 'Solicitud de apoyo enviada',
          detalle: detalle,
          fechaFormateada: this.formatearFechaEvento(ev.date || ev.timestamp),
          badgeTexto: 'Apoyo',
          badgeClase: 'bg-indigo-50 text-indigo-700 border-indigo-200'
        });
      } else if (accionUpper.includes('DERIVAR') || accionUpper.includes('DERIVACION')) {
        items.push({
          tipo: 'DERIVAR',
          icono: '🔄',
          titulo: 'Incidente derivado',
          detalle: detalle,
          fechaFormateada: this.formatearFechaEvento(ev.date || ev.timestamp),
          badgeTexto: 'Derivado',
          badgeClase: 'bg-amber-50 text-amber-700 border-amber-200'
        });
      } else if (accionUpper.includes('TRANSFERIR') || accionUpper.includes('TRANSFERENCIA')) {
        items.push({
          tipo: 'TRANSFERIR',
          icono: '⬅️',
          titulo: 'Transferencia por jurisdicción',
          detalle: detalle,
          fechaFormateada: this.formatearFechaEvento(ev.date || ev.timestamp),
          badgeTexto: 'Transferido',
          badgeClase: 'bg-red-50 text-red-700 border-red-200'
        });
      } else if (accionUpper.includes('FUSION') || accionUpper.includes('FUSIONAR')) {
        items.push({
          tipo: 'FUSIONAR',
          icono: '🔗',
          titulo: 'Fusión de incidente duplicado',
          detalle: detalle,
          fechaFormateada: this.formatearFechaEvento(ev.date || ev.timestamp),
          badgeTexto: 'Fusión',
          badgeClase: 'bg-purple-50 text-purple-700 border-purple-200'
        });
      } else if (accionUpper.includes('DIVIDIR') || accionUpper.includes('DIVISION')) {
        items.push({
          tipo: 'DIVIDIR',
          icono: '✂️',
          titulo: 'División de alertas',
          detalle: detalle,
          fechaFormateada: this.formatearFechaEvento(ev.date || ev.timestamp),
          badgeTexto: 'División',
          badgeClase: 'bg-teal-50 text-teal-700 border-teal-200'
        });
      }
    }

    return items;
  }

  private formatearFechaEvento(fechaStr?: string): string {
    if (!fechaStr) return '--';
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' +
             fecha.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch {
      return fechaStr;
    }
  }

  // --- 1. APOYO (Multijugador) ---
  confirmarApoyo(): void {
    if (!this.formApoyo.entidadDestinoId || !this.formApoyo.motivo.trim()) return;
    this.procesarOperacion(
      this.emergenciaService.solicitarApoyoEntidad(this.incidente.id, {
        newEntityId: this.formApoyo.entidadDestinoId,
        reason: this.formApoyo.motivo
      }),
      'Solicitud de apoyo enviada. La entidad ha sido agregada a la sala de crisis.',
      'APOYO'
    );
  }

  // --- 2. DERIVAR (Evolución) ---
  confirmarDerivacion(): void {
    if (!this.formDerivar.entidadDestinoId || !this.formDerivar.nuevoTipo || !this.confirmacionDerivar) return;
    this.procesarOperacion(
      this.emergenciaService.derivarIncidente(this.incidente.id, {
        newEmergencyType: this.formDerivar.nuevoTipo,
        targetEntityId: this.formDerivar.entidadDestinoId
      }),
      'Incidente derivado exitosamente.',
      'DERIVAR'
    );
  }

  // --- 3. TRANSFERIR (Corrección Total por Error) ---
  confirmarTransferencia(): void {
    if (!this.formTransferir.nuevaEntidadId || !this.formTransferir.motivo.trim() || !this.confirmacionTransferir) return;
    this.procesarOperacion(
      this.emergenciaService.transferirIncidente(this.incidente.id, {
        newEntityId: this.formTransferir.nuevaEntidadId,
        reason: this.formTransferir.motivo
      }),
      'Incidente transferido. Ya no está bajo tu jurisdicción.',
      'TRANSFERIR'
    );
  }

  // --- 4. DIVIDIR (Split Espacial) ---
  toggleAlertaSplit(alertaId: string): void {
    const idx = this.formDividir.alertasSeleccionadas.indexOf(alertaId);
    if (idx > -1) {
      this.formDividir.alertasSeleccionadas.splice(idx, 1);
    } else {
      this.formDividir.alertasSeleccionadas.push(alertaId);
    }
  }

  confirmarDivision(): void {
    if (!this.formDividir.entidadDestinoId || !this.formDividir.nuevoTipo || this.formDividir.alertasSeleccionadas.length === 0) return;
    this.procesarOperacion(
      this.emergenciaService.dividirIncidente(this.incidente.id, {
        alertIdsToExtract: this.formDividir.alertasSeleccionadas,
        newType: this.formDividir.nuevoTipo,
        targetEntityId: this.formDividir.entidadDestinoId
      }),
      'Incidente dividido correctamente.',
      'DIVIDIR'
    );
  }

  // --- 5. FUSIONAR (Merge Duplicados) ---
  confirmarFusion(): void {
    if (!this.formFusionar.idDuplicado.trim() || !this.formFusionar.motivo.trim()) return;
    this.procesarOperacion(
      this.emergenciaService.fusionarIncidente(this.incidente.id, {
        duplicateId: this.formFusionar.idDuplicado.trim(),
        reason: this.formFusionar.motivo.trim()
      }),
      'Incidente duplicado absorbido exitosamente.',
      'FUSIONAR'
    );
  }

  private procesarOperacion(observable$: any, mensajeExito: string, accionEjecutada: ModoEscalamiento): void {
    this.procesando = true;
    observable$.subscribe({
      next: () => {
        this.procesando = false;
        this.registrarUltimaAccion(accionEjecutada);
        this.modoActivo = 'NINGUNO';
        this.resetFormularios();
        this.civicToast.success(mensajeExito);
        this.operacionExitosa.emit(accionEjecutada);
      },
      error: (err: any) => {
        this.procesando = false;
        console.error('Error en la operación:', err);
        const errMsg = err?.error?.message || 'Ocurrió un error al procesar la solicitud de escalamiento.';
        this.civicToast.error(errMsg);
      }
    });
  }

  onTipoDerivarChange(nuevoTipo: string): void {
    this.formDerivar.entidadDestinoId = '';
    this.selectorDerivarExpandido = true;
    const resultadoFiltro = this.aplicarFiltro(nuevoTipo);
    this.entidadesParaDerivar = resultadoFiltro;
    this.entidadesFiltradas = resultadoFiltro;
  }

  onTipoDividirChange(nuevoTipo: string): void {
    this.formDividir.entidadDestinoId = '';
    this.entidadesParaDividir = this.aplicarFiltro(nuevoTipo);
  }

  private aplicarFiltro(tipoEmergencia: string): EntityDetail[] {
    if (!this.miEntidadId || !this.entidadesDisponibles?.length || !tipoEmergencia) return [];
    
    return this.entidadesDisponibles.filter(entidad => {
      if (entidad.id === this.miEntidadId) return false;
      
      const tipoEnt = entidad.entityType?.toUpperCase() || '';
      const tipoEval = tipoEmergencia.toUpperCase();

      switch (tipoEval) {
        case 'INCENDIO':
        case 'INCENDIOS':
          return tipoEnt === 'BOMBEROS' || tipoEnt === 'INCENDIO';
        case 'SALUD':
        case 'EMERGENCIA_MEDICA':
          return tipoEnt === 'SALUD' || tipoEnt === 'HOSPITAL' || tipoEnt === 'AMBULANCIA';
        case 'SEGURIDAD':
        case 'ROBO':
        case 'VIOLENCIA':
          return tipoEnt === 'SEGURIDAD' || tipoEnt === 'POLICIA' || tipoEnt === 'SERENAZGO';
        default:
          return tipoEnt === tipoEval;
      }
    });
  }
}

export { IncidentEscalationComponent as EmergenciasEscalamiento };

