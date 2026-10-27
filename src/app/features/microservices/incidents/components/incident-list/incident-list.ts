import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  SimpleChanges,
  input,
  output
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EmergencyType,
  IncidentSeverity,
  IncidentStatus,
  IncidentWithEntities
} from '../../../../../core/models/incident';
import { iconoMaterialTipoEmergencia } from '../../../../../shared/utils/tipo-emergencia-ui';

export type IncidentFilterStatus = IncidentStatus | 'TODOS';
export type IncidentFilterType = EmergencyType | 'TODOS';
export type IncidentFilterSeverity = IncidentSeverity | 'TODOS';
export type IncidentTab = 'PENDIENTES' | 'MIS_INCIDENTES' | 'HISTORIAL';

// Alias retrocompatibles
export type FiltroEstado = IncidentFilterStatus;
export type FiltroTipoEmergencia = IncidentFilterType;
export type FiltroGravedad = IncidentFilterSeverity;
export type PestanaListado = IncidentTab;

@Component({
  selector: 'app-incident-list, app-emergencias-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './incident-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IncidentListComponent implements OnChanges {
  // Signal Inputs con alias
  readonly isAdmin = input<boolean>(false, { alias: 'esAdmin' });
  readonly currentEntityType = input<string | null>(null, { alias: 'tipoEntidadActual' });
  readonly operatorId = input<string | null>(null, { alias: 'operadorId' });
  readonly emergencyTypes = input<ReadonlyArray<{ value: EmergencyType; label: string }>>([], { alias: 'tiposEmergencia' });
  readonly incidentStatuses = input<ReadonlyArray<{ value: IncidentFilterStatus; label: string }>>([], { alias: 'estadosIncidente' });
  readonly entityTypes = input<ReadonlyArray<{ value: string; label: string }>>([], { alias: 'tiposEntidad' });
  readonly severities = input<ReadonlyArray<{ value: IncidentFilterSeverity; label: string }>>([], { alias: 'gravedades' });
  readonly incidents = input<IncidentWithEntities[]>([], { alias: 'incidentes' });
  readonly isLoading = input<boolean>(false, { alias: 'cargando' });
  readonly hasLoadingError = input<boolean>(false, { alias: 'errorCarga' });
  readonly notificationsCount = input<number>(0, { alias: 'notificacionesCount' });

  // Signal Outputs con alias
  readonly refresh = output<void>({ alias: 'refrescar' });
  readonly detailSelected = output<IncidentWithEntities>({ alias: 'detalleSeleccionado' });
  readonly createIncident = output<void>({ alias: 'crearIncidente' });
  readonly openNotifications = output<void>({ alias: 'abrirNotificaciones' });

  // Getters para retrocompatibilidad en plantilla
  get esAdmin(): boolean { return this.isAdmin(); }
  get tipoEntidadActual(): string | null { return this.currentEntityType(); }
  get operadorId(): string | null { return this.operatorId(); }
  get tiposEmergencia() { return this.emergencyTypes(); }
  get estadosIncidente() { return this.incidentStatuses(); }
  get tiposEntidad() { return this.entityTypes(); }
  get gravedades() { return this.severities(); }
  get incidentes() { return this.incidents(); }
  get cargando(): boolean { return this.isLoading(); }
  get errorCarga(): boolean { return this.hasLoadingError(); }
  get notificacionesCount(): number { return this.notificationsCount(); }
  get refrescar() { return this.refresh; }
  get detalleSeleccionado() { return this.detailSelected; }
  get crearIncidente() { return this.createIncident; }
  get abrirNotificaciones() { return this.openNotifications; }

  activeTab: IncidentTab = 'PENDIENTES';
  get pestanaListado(): IncidentTab { return this.activeTab; }
  set pestanaListado(v: IncidentTab) { this.activeTab = v; }

  filteredIncidents: any[] = [];
  get incidentesFiltrados(): any[] { return this.filteredIncidents; }
  set incidentesFiltrados(val: any[]) { this.filteredIncidents = val; }

  typeFilter: IncidentFilterType = 'TODOS';
  get filtroTipo(): IncidentFilterType { return this.typeFilter; }
  set filtroTipo(v: IncidentFilterType) { this.typeFilter = v; }

  statusFilter: IncidentFilterStatus = 'TODOS';
  get filtroEstado(): IncidentFilterStatus { return this.statusFilter; }
  set filtroEstado(v: IncidentFilterStatus) { this.statusFilter = v; }

  entityTypeFilter = 'TODOS';
  get filtroTipoEntidad(): string { return this.entityTypeFilter; }
  set filtroTipoEntidad(v: string) { this.entityTypeFilter = v; }

  severityFilter: IncidentFilterSeverity = 'TODOS';
  get filtroGravedad(): IncidentFilterSeverity { return this.severityFilter; }
  set filtroGravedad(v: IncidentFilterSeverity) { this.severityFilter = v; }

  searchTerm = '';
  get busqueda(): string { return this.searchTerm; }
  set busqueda(v: string) { this.searchTerm = v; }

  pendingCount = 0;
  myIncidentsCount = 0;
  historyCount = 0;

  get conteoPendientes(): number { return this.pendingCount; }
  get conteoMisIncidentes(): number { return this.myIncidentsCount; }
  get conteoHistorial(): number { return this.historyCount; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['incidents'] || changes['incidentes'] || changes['operatorId'] || changes['operadorId']) {
      this.recalculateCounts();
      this.applyFilters();
    }
  }

  changeTab(tab: IncidentTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.applyFilters();
  }

  cambiarPestana(tab: IncidentTab): void {
    this.changeTab(tab);
  }

  isPendingIncident(inc: IncidentWithEntities): boolean {
    const hasOperator = !!(inc.assignedOperator && (inc.assignedOperator.id || inc.assignedOperator._id));
    return !hasOperator || inc.currentStatus === 'VERIFICACION_PENDIENTE';
  }

  esIncidentePendiente(inc: IncidentWithEntities): boolean {
    return this.isPendingIncident(inc);
  }

  isAssignedToOperator(inc: IncidentWithEntities): boolean {
    const hasOperator = !!(inc.assignedOperator && (inc.assignedOperator.id || inc.assignedOperator._id));
    if (!hasOperator) return false;

    if (this.isAdmin()) {
      return inc.currentStatus !== 'VERIFICACION_PENDIENTE';
    }

    const opId = inc.assignedOperator?.id || inc.assignedOperator?._id;
    return !!this.operatorId() && opId === this.operatorId();
  }

  esIncidenteAsignadoAlOperador(inc: IncidentWithEntities): boolean {
    return this.isAssignedToOperator(inc);
  }

  private recalculateCounts(): void {
    let pending = 0;
    let mine = 0;
    let hist = 0;
    const currentList = this.incidents();

    for (const inc of currentList) {
      const isClosed = inc.currentStatus === 'CERRADO' || inc.currentStatus === 'ELIMINADO' || inc.currentStatus === 'RESUELTO';
      if (isClosed) {
        hist++;
      } else if (this.isPendingIncident(inc)) {
        pending++;
      } else if (this.isAssignedToOperator(inc)) {
        mine++;
      }
    }
    this.pendingCount = pending;
    this.myIncidentsCount = mine;
    this.historyCount = hist;
  }

  applyFilters(): void {
    const type = this.typeFilter;
    const status = this.statusFilter;
    const entityType = this.entityTypeFilter;
    const severity = this.severityFilter;
    const text = this.searchTerm.trim().toLowerCase();

    const currentList = this.incidents();

    this.filteredIncidents = currentList.filter((inc) => {
      // 1. Filtro por pestaña activa
      if (this.activeTab === 'PENDIENTES') {
        if (!this.isPendingIncident(inc) || inc.currentStatus === 'CERRADO' || inc.currentStatus === 'ELIMINADO' || inc.currentStatus === 'RESUELTO') return false;
      } else if (this.activeTab === 'MIS_INCIDENTES') {
        if (!this.isAssignedToOperator(inc) || inc.currentStatus === 'CERRADO' || inc.currentStatus === 'ELIMINADO' || inc.currentStatus === 'RESUELTO') return false;
      } else if (this.activeTab === 'HISTORIAL') {
        if (inc.currentStatus !== 'CERRADO' && inc.currentStatus !== 'ELIMINADO' && inc.currentStatus !== 'RESUELTO') return false;
      }

      // 2. Filtros secundarios
      if (type !== 'TODOS' && inc.emergencyType !== type) return false;
      if (status !== 'TODOS' && inc.currentStatus !== status) return false;
      if (severity !== 'TODOS' && inc.severity !== severity) return false;
      if (entityType !== 'TODOS') {
        const hasType = (inc.responsibleEntities ?? []).some(e => e.entityType === entityType);
        if (!hasType) return false;
      }
      if (text) {
        const code = (inc.trackingCode ?? '').toLowerCase();
        const address = (inc.location?.address ?? '').toString().toLowerCase();
        const entities = (inc.responsibleEntities ?? []).map(e => (e.businessName ?? '').toLowerCase()).join(' ');
        const op = (inc.assignedOperator?.fullName ?? '').toLowerCase();
        if (!code.includes(text) && !address.includes(text) && !entities.includes(text) && !op.includes(text)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(inc => ({
        ...inc,
        _iconoTipo: this.getEmergencyIcon(inc.emergencyType),
        _etiquetaTipo: this.getEmergencyLabel(inc.emergencyType),
        _claseGravedadVisual: this.getVisualSeverityClass(inc),
        _etiquetaGravedadVisual: this.getVisualSeverityLabel(inc),
        _claseEstado: this.getStatusClass(inc.currentStatus),
        _etiquetaEstado: this.getStatusLabel(inc.currentStatus),
        _fechaFormateada: this.formatDate(inc.createdAt),
        _esPendiente: this.isPendingIncident(inc)
      }));
  }

  aplicarFiltros(): void {
    this.applyFilters();
  }

  loadData(): void {
    this.refresh.emit();
  }

  cargar(): void {
    this.loadData();
  }

  clearFilters(): void {
    this.typeFilter = 'TODOS';
    this.statusFilter = 'TODOS';
    this.entityTypeFilter = 'TODOS';
    this.severityFilter = 'TODOS';
    this.searchTerm = '';
    this.applyFilters();
  }

  limpiarFiltros(): void {
    this.clearFilters();
  }

  openDetail(incident: IncidentWithEntities): void {
    this.detailSelected.emit(incident);
  }

  abrirDetalle(incidente: IncidentWithEntities): void {
    this.openDetail(incidente);
  }

  getVisualSeverityLabel(inc: IncidentWithEntities): string {
    if (inc.currentStatus === 'VERIFICACION_PENDIENTE') return 'Pendiente';
    return inc.severity;
  }

  etiquetaGravedadVisual(inc: IncidentWithEntities): string {
    return this.getVisualSeverityLabel(inc);
  }

  getVisualSeverityClass(inc: IncidentWithEntities): string {
    if (inc.currentStatus === 'VERIFICACION_PENDIENTE') {
      return 'bg-amber-50 text-amber-700 border-amber-300 border-dashed';
    }
    return this.getSeverityClass(inc.severity);
  }

  claseGravedadVisual(inc: IncidentWithEntities): string {
    return this.getVisualSeverityClass(inc);
  }

  getEmergencyLabel(type: EmergencyType): string {
    return this.emergencyTypes().find(t => t.value === type)?.label ?? type;
  }

  etiquetaTipo(type: EmergencyType): string {
    return this.getEmergencyLabel(type);
  }

  getEmergencyIcon(type: EmergencyType): string {
    return iconoMaterialTipoEmergencia(type);
  }

  iconoTipo(type: EmergencyType): string {
    return this.getEmergencyIcon(type);
  }

  getStatusLabel(status: IncidentStatus): string {
    return this.incidentStatuses().find(e => e.value === status)?.label ?? status;
  }

  etiquetaEstado(status: IncidentStatus): string {
    return this.getStatusLabel(status);
  }

  getStatusClass(status: IncidentStatus): string {
    switch (status) {
      case 'NUEVO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'EN_ATENCION': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'VERIFICACION_PENDIENTE': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'CERRADO': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'ELIMINADO': return 'bg-gray-100 text-gray-600 border-gray-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  claseEstado(status: IncidentStatus): string {
    return this.getStatusClass(status);
  }

  getSeverityClass(severity: IncidentSeverity): string {
    switch (severity) {
      case 'ALTA': return 'bg-red-100 text-red-700 border-red-200';
      case 'MEDIA': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'BAJA': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  }

  claseGravedad(severity: IncidentSeverity): string {
    return this.getSeverityClass(severity);
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  formatearFecha(dateStr?: string | null): string {
    return this.formatDate(dateStr);
  }

  countByStatus(status: IncidentStatus): number {
    return this.incidents().filter(i => i.currentStatus === status).length;
  }

  conteoPorEstado(status: IncidentStatus): number {
    return this.countByStatus(status);
  }

  // --- trackBy functions para evitar re-creación de DOM ---
  trackByIncidenteId(_: number, inc: any): string {
    return inc?.id || String(_);
  }

  trackByValue(_: number, item: any): string {
    return item?.value || String(_);
  }
}

/** Alias retrocompatible */
export { IncidentListComponent as EmergenciasList };

