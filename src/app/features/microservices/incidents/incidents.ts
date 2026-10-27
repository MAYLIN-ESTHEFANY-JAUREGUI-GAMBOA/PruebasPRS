import { CommonModule, DOCUMENT } from '@angular/common';



import {



  ChangeDetectionStrategy,



  ChangeDetectorRef,



  HostListener,



  Component,



  NgZone,



  OnInit,



  inject



} from '@angular/core';



import { FormsModule } from '@angular/forms';



import { AuthService, ROLES } from '../../../core/auth/auth.service';



import {



  LinkedAlertDTO,



  EntityDetail,



  IncidentStatus,



  Incident,



  IncidentWithEntities,



  IncidentSeverity,



  SistemaCastigos,



  EmergencyType,



  Incidente,



  AlertaVinculadaDTO,



  EntidadDetalle,



  EstadoIncidente,



  IncidenteConEntidades,



  PrioridadAlerta,



  TipoEmergencia,



  CitizenProfile,



  GroupedReporter



} from '../../../core/models/incident';



import { concatMap, catchError } from 'rxjs/operators';



import { of, forkJoin } from 'rxjs';



import { buildApiUrl, API_PATHS } from '../../../core/config/api-config';



import { IncidentService, EmergenciaService } from '../../../core/services/incident';



import { RecursoOperativoService } from '../../../core/services/recurso-operativo';



import { EntidadService, entidadADetalle } from '../../../core/services/entidad';



import { UsuarioAdminService } from '../../../core/services/usuario-admin';



import { IncidentExcelService } from '../../../core/reports/incidents/incident-excel.service';



import { IncidentPdfService } from '../../../core/reports/incidents/incident-pdf.service';



import { ReportBrandingService } from '../../../shared/reports/report-branding.service';



import { CivicToastService } from '../../../shared/services/civic-toast.service';



import { castigoResponseToSistemaCastigos, CastigoHistorialEntry, etiquetaNivelCastigo } from '../../../core/models/usuario.model';



import { SancionChip } from '../../../shared/components/sancion-chip/sancion-chip';



import { RecursoOperativo } from '../../../core/models/recurso-operativo.model';



import { OsmMap, GeoPunto, MapaLinea, MapaMarcador } from '../../../shared/components/osm-map/osm-map';



import { IncidentCommunicationsComponent, EmergenciasChat } from './components/incident-communications/incident-communications';



import { IncidentEscalationComponent, EmergenciasEscalamiento } from './components/incident-escalation/incident-escalation';



import { IncidentCreateComponent, EmergenciasCrear } from './components/incident-create/incident-create';



import { IncidentHistoryComponent, EmergenciasHistorial } from './components/incident-history/incident-history';



import { lockPageScroll, unlockPageScroll } from '../../../shared/utils/modal-scroll-lock';



import { etiquetaTipoEmergencia, iconoTipoEmergencia } from '../../../shared/utils/tipo-emergencia-ui';



type FiltroGravedad = PrioridadAlerta | 'TODOS';







/** Tipos de entidad conocidos para el filtro (mantener sincronizado con el panel de entidades). */



const TIPOS_ENTIDAD_CONOCIDOS: ReadonlyArray<{ value: string; label: string }> = [



  { value: 'TODOS', label: 'Todos' },



  { value: 'POLICIA', label: 'Policia' },



  { value: 'BOMBEROS', label: 'Bomberos' },



  { value: 'SALUD', label: 'Salud' },



  { value: 'SEGURIDAD', label: 'Seguridad' },



  { value: 'RESCATE', label: 'Rescate' },



  { value: 'MUNICIPALIDAD', label: 'Municipalidad' }



];







// Arreglo real que el HTML sÃ­ puede recorrer



 // Opcional: Puedes definir esta interfaz para mayor tipado



interface DatosIcono {



  icono: string;



  color: string;



}











@Component({



  selector: 'app-incidents, app-emergencias',



  imports: [



    CommonModule,



    FormsModule,



    OsmMap,



    IncidentCommunicationsComponent,



    IncidentCreateComponent,



    IncidentEscalationComponent,



    IncidentHistoryComponent,



    SancionChip



  ],



  templateUrl: './incidents.html',



  styleUrl: './incidents.css',



  changeDetection: ChangeDetectionStrategy.OnPush



})



export class IncidentsComponent implements OnInit {







  private readonly entidadService = inject(EntidadService)



  private readonly recursoOperativoService = inject(RecursoOperativoService);



  private readonly emergenciaService = inject(EmergenciaService);



  private readonly authService = inject(AuthService);



  private readonly usuarioAdminService = inject(UsuarioAdminService);



  private readonly incidentePdf = inject(IncidentPdfService);



  private readonly incidenteExcel = inject(IncidentExcelService);



  exportandoReporte = false;



  readonly puedeExportar = inject(ReportBrandingService).puedeExportar();



  private readonly civicToast = inject(CivicToastService);



  private readonly cdr = inject(ChangeDetectorRef);



  private readonly ngZone = inject(NgZone);



  private readonly document = inject(DOCUMENT);



  /** Estado de la sesion actual (lo lee la vista para ocultar/mostrar columnas). */



  get esAdmin(): boolean {



    return this.authService.isAdmin();



  }



  /** Personal municipal y analistas solo leen: se ocultan las acciones operativas. */



  readonly puedeAtender = this.authService.puedeAtender;



  readonly tipoEntidadActual = this.authService.getTipoEntidad();



  get miEntidadId(): string {



    return this.authService.getEntidadId() || '';



  }



  get operadorId(): string | null {



    return this.authService.getUserId();



  }



  /** catalogos de UI (vienen del servicio). */



  readonly tiposEmergencia = this.emergenciaService.tiposEmergencia;



  readonly estadosIncidente = this.emergenciaService.estadosIncidente;



  readonly tiposEntidad = TIPOS_ENTIDAD_CONOCIDOS;



  readonly gravedades: ReadonlyArray<{ value: FiltroGravedad; label: string }> = [



    { value: 'TODOS', label: 'Todas' },



    { value: 'ALTA',  label: 'Alta'  },



    { value: 'MEDIA', label: 'Media' },



    { value: 'BAJA',  label: 'Baja'  }



  ];







  // Variables de configuracion del mapa



  mapCenter: GeoPunto = { lat: -12.046374, lng: -77.042793 }; // Centro inicial por defecto (ej. Lima)



  mapZoom = 13;



  isDragging = false;



  recursosEnMapa: { id: string; posicion: GeoPunto; identificador: string }[] = [];



  /** Rutas unidad → emergencia (OSRM); si el servicio de rutas falla, línea recta discontinua. */



  rutasDespacho: MapaLinea[] = [];







  get marcadoresMapa(): MapaMarcador[] {



    const incidente: MapaMarcador[] = this.incidenteBaseSeleccionado?.location



      ? [{ ...this.mapCenter, titulo: this.incidenteBaseSeleccionado.trackingCode ?? 'Punto de emergencia', color: '#dc2626', etiqueta: '!' }]



      : [];



    return [...incidente, ...this.recursosEnMapa.map(r => ({



      ...r.posicion, id: r.id, titulo: r.identificador, popup: r.identificador, color: '#2563eb', etiqueta: '🚑'



    }))];



  }







  /** Ruta en auto por calles con el servidor público de OSRM (sin API key). */



  private async trazarRuta(origen: GeoPunto, destino: GeoPunto): Promise<void> {



    let puntos: GeoPunto[] = [origen, destino];



    let discontinua = true;



    try {



      const url = `https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;



      const data = await (await fetch(url)).json();



      const coords: [number, number][] | undefined = data?.routes?.[0]?.geometry?.coordinates;



      if (coords?.length) { puntos = coords.map(([lng, lat]) => ({ lat, lng })); discontinua = false; }



    } catch { /* sin ruta por calles: queda la línea recta */ }



    this.rutasDespacho = [...this.rutasDespacho, { puntos, color: '#2563eb', grosor: 5, discontinua }];



    this.cdr.detectChanges();



  }







  // VARIABLES DE pestañas Y DESPACHO



  pestanaActiva: 'LOBBY' | 'DETALLE' | 'DESPACHO' | 'BITACORA' | 'EVIDENCIAS' | 'ESCALAMIENTO' | 'ALERTAS' | 'CASTIGOS' = 'LOBBY';







  cambiarPestana(pestana: 'LOBBY' | 'DETALLE' | 'DESPACHO' | 'BITACORA' | 'EVIDENCIAS' | 'ESCALAMIENTO' | 'ALERTAS' | 'CASTIGOS') {



    this.pestanaActiva = pestana;



    this.bannerAyudaVisible = true; // reactivamos el banner al cambiar pestaña



    



    if (pestana === 'DESPACHO') {



      this.cargarRecursosDisponibles();



    } 



    else if (pestana === 'ESCALAMIENTO') {



      this.cargarEntidadesParaDerivacion();



    } else if (pestana === 'CASTIGOS') {



      this.initializePenaltyTab();



    }



  }







  alertasVinculadas: AlertaVinculadaDTO[] = [];



  penaltiesByReporterId: Record<string, SistemaCastigos> = {};







  tiposEmergenciaLista: { value: TipoEmergencia, label: string, icono: string }[] = [



    { value: 'INCENDIO', label: 'Incendio', icono: '🔥' },



    { value: 'SALUD', label: 'Salud', icono: '⚕️' },



    { value: 'SEGURIDAD', label: 'Seguridad', icono: '👮' }



  ];







  // VARIABLES PARA DERIVAR Y SOLICITAR APOYO



  listaTiposEmergencia = this.emergenciaService.tiposEmergencia;







  listaEntidadesDisponibles: EntidadDetalle[] = [];



  readonly entidadesMap = new Map<string, string>();



  



  /** Datos. */



  recursosDisponibles: (RecursoOperativo & { metricasCache?: { distancia: string, eta: string } })[] = [];



  incidentes: IncidenteConEntidades[] = [];



  



  // --- LOBBY & FILTER STATE ---



  incidentesFiltrados: any[] = [];



  filtroActual: 'verificar' | 'atencion' | 'cerrado' | null = null;



  busquedaLobby: string = '';



  conteoVerificar = 0;



  conteoAtencion = 0;



  conteoCerrado = 0;







  private readonly grupoDeEstado: Record<string, 'verificar' | 'atencion' | 'cerrado'> = { 



    NUEVO: 'verificar', 



    VERIFICACION_PENDIENTE: 'verificar', 



    EN_ATENCION: 'atencion', 



    CERRADO: 'cerrado',



    ELIMINADO: 'cerrado',



    RESUELTO: 'cerrado'



  };







  puedeOperarIncidente(inc: any = this.incidenteSeleccionado): boolean {



    if (!inc) return false;







    const entidadId = this.miEntidadId;



    const municipalidadId = this.authService.getMunicipalidadId();







    // Debe pertenecer a una de las entidades responsables del incidente



    const esDeMiEntidad = !!entidadId && (



      inc.responsibleEntityIds?.includes(entidadId) ||



      inc.responsibleEntities?.some((e: any) => e.id === entidadId || e._id === entidadId)



    );







    // Debe coincidir con la municipalidad asignada al incidente (si aplica)



    const coincideMuni = !inc.municipalityId || !municipalidadId || inc.municipalityId === municipalidadId;







    // Regla de Negocio: Un SUPER_ADMIN / ADMIN puede supervisar pero solo puede operar si pertenece a la entidad y municipalidad



    if (this.esAdmin) {



      return esDeMiEntidad && coincideMuni;



    }







    // Personal operativo regular



    return esDeMiEntidad && coincideMuni;



  }







  esOperadorAsignadoOApoyo(inc: any): boolean {



    if (this.esAdmin) return true;







    const userId = this.operadorId;



    const entidadId = this.miEntidadId;



    const userDisplayName = this.authService.getDisplayName();







    // 1. Operador asignado directamente al incidente



    const op = inc.assignedOperator;



    if (op) {



      const opId = op.id || op._id;



      if (userId && (opId === userId || op.userUid === userId)) return true;



      if (entidadId && (opId === entidadId || op.entidadId === entidadId)) return true;



      if (userDisplayName && op.fullName && userDisplayName.trim().toLowerCase() === op.fullName.trim().toLowerCase()) return true;



    }







    // 2. Operador involucrado en la bitacora o historial de eventos (ej. tomo accion, notas, apoyo)



    const eventos = inc.logEvents || inc.eventLog || inc.bitacoraEventos || [];



    if (userId && eventos.some((e: any) => e.operatorId === userId || e.userUid === userId || e.operadorId === userId)) {



      return true;



    }







    // 3. Operador asignado a una de las unidades despachadas



    const unidades = inc.assignedUnits || inc.unidadesAsignadas || [];



    if (userId && unidades.some((u: any) => u.operatorUid === userId || u.userId === userId || u.operadorId === userId)) {



      return true;



    }







    return false;



  }







  esIncidenteAsignadoAlOperador(inc: any): boolean {



    return this.esOperadorAsignadoOApoyo(inc);



  }







  esVisibleParaUsuarioActual(inc: any): boolean {



    if (this.esAdmin) return true;







    const entidadId = this.miEntidadId;



    const esDeMiEntidad = !entidadId ||



      inc.responsibleEntityIds?.includes(entidadId) ||



      inc.responsibleEntities?.some((e: any) => e.id === entidadId || e._id === entidadId);







    // Si no corresponde a la entidad del usuario, no es visible



    if (!esDeMiEntidad) return false;







    // Administradores de entidad supervisan todos los casos de su entidad



    if (this.authService.isEntidadAdmin()) return true;







    const g = this.grupoDeEstado[inc.currentStatus];







    // 1. Por verificar: incidente pertenece a la entidad pero NO tiene operador designado



    if (g === 'verificar') {



      const tieneOperador = !!(



        inc.assignedOperator &&



        (inc.assignedOperator.id || inc.assignedOperator._id || inc.assignedOperator.userUid || inc.assignedOperator.fullName)



      );



      if (!tieneOperador) return true;



      // Si ya tiene operador asignado, solo lo ve el asignado o de apoyo



      return this.esOperadorAsignadoOApoyo(inc);



    }







    // 2. En atencion y Cerrados: SOLO el operador que verifico/tomo el caso o fue agregado como apoyo



    return this.esOperadorAsignadoOApoyo(inc);



  }







  aplicarFiltrosLobby(): void {



    const q = this.busquedaLobby.trim().toLowerCase();



    



    const incidentesVisibles = this.incidentes.filter(inc => this.esVisibleParaUsuarioActual(inc));



    console.log(`[LOBBY] Incidentes recibidos: ${this.incidentes.length}, visibles para usuario: ${incidentesVisibles.length}, filtroActual: ${this.filtroActual || 'TODOS'}`);







    this.incidentesFiltrados = incidentesVisibles.filter(inc => {



      const g = this.grupoDeEstado[inc.currentStatus];



      const passFilter = !this.filtroActual || g === this.filtroActual;



      



      const codigo = (inc.trackingCode ?? '').toLowerCase();



      const dir = (inc.location?.address ?? '').toString().toLowerCase();



      const op = (inc.assignedOperator?.fullName ?? '').toLowerCase();



      



      const passSearch = !q || codigo.includes(q) || dir.includes(q) || op.includes(q);



      



      return passFilter && passSearch;



    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())



    .map(inc => ({



      ...inc,



      _iconoTipo: this.iconoTipo(inc.emergencyType),



      _etiquetaTipo: this.etiquetaTipo(inc.emergencyType),



      _claseGravedadVisual: this.claseGravedadVisual(inc as any),



      _etiquetaGravedadVisual: this.etiquetaGravedadVisual(inc as any),



      _claseEstado: this.claseEstado(inc.currentStatus),



      _etiquetaEstado: this.etiquetaEstado(inc.currentStatus),



      _fechaFormateada: this.formatearFecha(inc.createdAt)



    }));







    this.conteoVerificar = incidentesVisibles.filter(i => this.grupoDeEstado[i.currentStatus] === 'verificar').length;



    this.conteoAtencion = incidentesVisibles.filter(i => this.grupoDeEstado[i.currentStatus] === 'atencion').length;



    this.conteoCerrado = incidentesVisibles.filter(i => this.grupoDeEstado[i.currentStatus] === 'cerrado').length;



  }







  setFiltro(filtro: 'verificar' | 'atencion' | 'cerrado' | null): void {



    this.filtroActual = (this.filtroActual === filtro) ? null : filtro;



    this.aplicarFiltrosLobby();



  }







  cargando = false;



  errorCarga = false;



  abriendoDetalle: boolean = false;



  /** Modal crear incidencia. */



  modalCrearAbierto = false;



  guardandoIncidente = false;







  /** Modal de detalle. */



  private _incidenteSeleccionado: IncidenteConEntidades | null = null;



  get incidenteSeleccionado(): IncidenteConEntidades | null {



    return this._incidenteSeleccionado;



  }



  set incidenteSeleccionado(val: IncidenteConEntidades | null) {



    if (val) {



      this._incidenteSeleccionado = {



        ...val,



        _iconoTipo: this.iconoTipo(val.emergencyType),



        _etiquetaTipo: this.etiquetaTipo(val.emergencyType),



        _claseGravedadVisual: this.claseGravedadVisual(val as any),



        _etiquetaGravedadVisual: this.etiquetaGravedadVisual(val as any),



        _claseEstado: this.claseEstado(val.currentStatus),



        _etiquetaEstado: this.etiquetaEstado(val.currentStatus),



        _fechaFormateada: this.formatearFecha(val.createdAt)



      } as any;



    } else {



      this._incidenteSeleccionado = null;



    }



  }



  private _incidenteBaseSeleccionado: Incidente | null = null;



  get incidenteBaseSeleccionado(): Incidente | null {



    return this._incidenteBaseSeleccionado;



  }



  set incidenteBaseSeleccionado(val: Incidente | null) {



    if (val) {



      const rawEvents = ((val.logEvents ?? (val as any).eventLog ?? (val as any).bitacoraEventos ?? []) as any[]);



      const eventosNormalizados = rawEvents.map((e: any) => {



        const fecha = e.date || e.timestamp || e.fecha || e.createdAt || '';



        const detalle = e.detail || e.detalle || '';



        const origen = e.origin || e.origen || e.source || 'SISTEMA';



        const operador = e.operatorId || e.operadorId || e.userUid || null;



        return {



          ...e,



          date: fecha,



          timestamp: fecha,



          action: e.action || e.accion || '',



          detail: detalle,



          detalle: detalle,



          origin: origen,



          source: origen,



          origen: origen,



          operatorId: operador,



          operadorId: operador



        };



      });







      this._incidenteBaseSeleccionado = {



        ...val,



        logEvents: eventosNormalizados,



        consolidatedEvidence: val.consolidatedEvidence?.map((e: any) => ({



          ...e,



          _fechaFormateada: this.formatearFecha(e.creadoEn || e.createdAt),



          _codigoAlerta: this.obtenerCodigoAlerta(e.sourceAlertId)



        })) as any



      };



    } else {



      this._incidenteBaseSeleccionado = null;



    }



    this.actualizarListasDerivadas();



  }







  unidadesActivasLista: any[] = [];



  bitacoraOrdenadaLista: any[] = [];







  private actualizarListasDerivadas() {



    if (!this._incidenteBaseSeleccionado) {



      this.unidadesActivasLista = [];



      this.bitacoraOrdenadaLista = [];



      return;



    }



    



    if (this._incidenteBaseSeleccionado.assignedUnits) {



      const eventos = this._incidenteBaseSeleccionado.logEvents || [];



      this.unidadesActivasLista = this._incidenteBaseSeleccionado.assignedUnits.map((unidad: any) => {



        const evento = [...eventos].reverse().find(e => e.action === 'DESPACHO_UNIDAD' && e.metadata?.['unidadId'] === unidad.resourceId);



        return {



          id: unidad.resourceId,



          identificador: evento?.metadata?.['identificador'] || 'Unidad ' + unidad.resourceId.substring(0,5),



          estadoActual: unidad.currentStatus



        };



      });



    } else {



      this.unidadesActivasLista = [];



    }







    if (this._incidenteBaseSeleccionado.logEvents) {



      this.bitacoraOrdenadaLista = [...this._incidenteBaseSeleccionado.logEvents]



        .sort((a: any, b: any) => {



          const tA = (a.date || a.timestamp) ? new Date(a.date || a.timestamp).getTime() : 0;



          const tB = (b.date || b.timestamp) ? new Date(b.date || b.timestamp).getTime() : 0;



          return tB - tA;



        })



        .map((evento: any) => {



          const fechaVal = evento.date || evento.timestamp;



          return {



            ...evento,



            iconoDatos: this.obtenerDatosBitacora(evento.action),



            fechaFormateada: this.formatearFecha(fechaVal),



            horaFormateada: this.formatearHora(fechaVal),



            accionFormateada: evento.action ? evento.action.replace(/_/g, ' ') : ''



          };



        });



    } else {



      this.bitacoraOrdenadaLista = [];



    }



  }



  



  chatAbierto = false;



  incidenteChat: IncidenteConEntidades | null = null;



  



  procesandoAccion = false;



  verificando = false;



  cerrando = false;



  notaOperador = '';



  resolucionCierre = '';



  motivoReapertura = '';



  gravedadSeleccionada: PrioridadAlerta = 'ALTA';







  // --- NOTIFICACIONES ---



  notificaciones: any[] = [];



  historialAbierto = false;



  toastActual: any = null;



  toastTimeout: any;







  // TUTORIAL / GUIA



  tutorialAbierto = false;



  bannerAyudaVisible = true;



  readonly tipsPorPestana: Record<string, { short: string, full: [string, string][] }> = {



    LOBBY: {



      short: 'Aquí ves los incidentes nuevos de toda la entidad y únicamente los incidentes que tú estás atendiendo o cerraste.',



      full: [



        ['Por verificar', 'Son emergencias nuevas que acaban de entrar y que cualquier operador de tu entidad puede tomar. ¡Sé rápido!'],



        ['En atención (Míos)', 'Una vez verificas o tomas un incidente, se te asigna. Nadie más en tu entidad lo verá en su lista, es tu responsabilidad.'],



        ['Cerrados (Míos)', 'Historial de los incidentes que tú mismo cerraste o finalizaste.']



      ]



    },



    DETALLE: {



      short: 'Aquí ves el resumen del caso: estado, gravedad, ubicación y las acciones que puedes tomar ahora mismo.',



      full: [



        ['Estado y gravedad', 'Los badges de arriba muestran en qué fase está el caso y qué tan crítico es. Cámbialos desde "Acciones operativas", nunca editando directamente.'],



        ['Mapa de contexto', 'Es una vista rápida de la ubicación. Para mover unidades o confirmar despacho, usa la pestaña Despacho.'],



        ['Acciones operativas', 'Verifica la gravedad real, registra novedades en la bitácora o cierra el incidente cuando el caso termine.']



      ]



    },



    DESPACHO: {



      short: 'Arrastra unidades desde la lista lateral hacia el mapa para asignarlas al incidente en tiempo real.',



      full: [



        ['Mapa interactivo', 'El punto rojo es el incidente. Arrastra un ícono de unidad hasta ahí para proponer su asignación.'],



        ['Unidades disponibles', 'Filtra por distancia y estado. Solo puedes asignar unidades marcadas como "Disponible".'],



        ['Confirmar despacho', 'Nada se notifica a la unidad hasta que presiones "Confirmar despacho".']



      ]



    },



    ESCALAMIENTO: {



      short: 'Usa esta pestaña cuando el caso necesita ser atendido por otra institución, no por tu entidad.',



      full: [



        ['Entidad receptora', 'Selecciona la institución competente: Bomberos, PNP, MINSA o Defensa Civil.'],



        ['Motivo', 'Explica brevemente por qué se deriva; queda registrado en la bitácora del caso.'],



        ['Datos adjuntos', 'Las alertas y evidencias viajan automáticamente, no necesitas volver a cargarlas.']



      ]



    },



    BITACORA: {



      short: 'Línea de tiempo con todo lo que ha pasado en el incidente: acciones humanas y eventos automáticos del sistema.',



      full: [



        ['Puntos azules', 'Acciones realizadas por un operador (tú u otro miembro del equipo).'],



        ['Puntos grises', 'Eventos generados automáticamente por el sistema, como la creación del caso.'],



        ['Uso recomendado', 'Revisa la bitácora antes de escalar o cerrar un caso para no repetir pasos ya hechos.']



      ]



    },



    EVIDENCIAS: {



      short: 'Galería con fotos, audios, videos o textos enviados por el ciudadano que reportó la emergencia.',



      full: [



        ['Tipos de archivo', 'Cada tarjeta indica si es imagen, audio, video o transcripción de texto.'],



        ['Uso en reportes', 'Estas evidencias se incluyen automáticamente en el PDF/Excel exportado desde el encabezado.']



      ]



    },



    ALERTAS: {



      short: 'Muestra las alertas ciudadanas originales que dieron pie a este incidente y qué tan confiable es cada alertante.',



      full: [



        ['Datos del alertante', 'Nombre, DNI, teléfono y correo del ciudadano, cuando están disponibles.'],



        ['Confiabilidad del perfil', 'Verde: sin advertencias. Ámbar: advertencias previas. Rojo: perfil bloqueado por abuso del sistema.'],



        ['Alertas anónimas', 'Algunas alertas no tienen datos de usuario; aun así son válidas para la atención.']



      ]



    }



  ,



    CASTIGOS: {



      short: 'Aplica sanciones o bloqueos a alertantes por reportes falsos, mal uso de la plataforma o conducta inapropiada en el chat.',



      full: [



        ['Graduación de faltas', 'El sistema aplica una escala progresiva: Aviso → Bloqueo temporal → Bloqueo permanente.'],



        ['Tipos de infracción', 'Registra si la sanción corresponde a falsa alarma, mal uso o conducta en el chat.'],



        ['Historial del ciudadano', 'Revisa las infracciones y sanciones previas acumuladas por el usuario.']



      ]



    }



  };







  toggleTutorial(): void {



    this.tutorialAbierto = !this.tutorialAbierto;



  }







  cerrarBannerAyuda(): void {



    this.bannerAyudaVisible = false;



  }







  toggleHistorial(): void {



    console.log('toggleHistorial() llamado. historialAbierto era:', this.historialAbierto);



    this.historialAbierto = !this.historialAbierto;



    console.log('Ahora historialAbierto es:', this.historialAbierto);



    this.cdr.detectChanges();



  }







  cerrarToast(): void {



    this.toastActual = null;



    if (this.toastTimeout) {



      clearTimeout(this.toastTimeout);



    }



  }







  mostrarToast(notificacion: any): void {



    this.toastActual = notificacion;



    if (this.toastTimeout) {



      clearTimeout(this.toastTimeout);



    }



    this.toastTimeout = setTimeout(() => {



      this.toastActual = null;



      this.cdr.detectChanges();



    }, 4000);



  }











  eventSource: EventSource | null = null;







  private readonly STORAGE_NOTI_KEY = 'prs_buzon_notificaciones';



  private audioCtx: AudioContext | null = null;







  reproducirSonidoAlerta(): void {



    try {



      if (typeof window === 'undefined') return;



      if (!this.audioCtx) {



        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;



        if (AudioContextClass) {



          this.audioCtx = new AudioContextClass();



        }



      }



      if (!this.audioCtx) return;







      if (this.audioCtx.state === 'suspended') {



        this.audioCtx.resume();



      }







      const now = this.audioCtx.currentTime;



      const osc1 = this.audioCtx.createOscillator();



      const gain = this.audioCtx.createGain();







      osc1.type = 'sine';



      osc1.frequency.setValueAtTime(784, now); // G5



      osc1.frequency.setValueAtTime(1046.5, now + 0.15); // C6







      gain.gain.setValueAtTime(0.2, now);



      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);







      osc1.connect(gain);



      gain.connect(this.audioCtx.destination);







      osc1.start(now);



      osc1.stop(now + 0.45);



    } catch (e) {



      console.warn('Audio play blocked:', e);



    }



  }







  guardarNotificacionesStorage(): void {



    try {



      if (typeof localStorage !== 'undefined') {



        const maxGuardadas = this.notificaciones.slice(0, 30);



        localStorage.setItem(this.STORAGE_NOTI_KEY, JSON.stringify(maxGuardadas));



      }



    } catch {



      // Ignorar errores de almacenamiento



    }



  }







  cargarNotificacionesStorage(): void {



    try {



      if (typeof localStorage !== 'undefined') {



        const raw = localStorage.getItem(this.STORAGE_NOTI_KEY);



        if (raw) {



          const parsed = JSON.parse(raw);



          if (Array.isArray(parsed)) {



            this.notificaciones = parsed;



          }



        }



      }



    } catch {



      this.notificaciones = [];



    }



  }







  ngOnInit(): void {



    console.log('ID extraído en el Padre:', this.miEntidadId);



    this.cargarNotificacionesStorage();



    this.cargarEntidadesParaDerivacion();



    this.cargar();



    this.initSSE();



  }







  initSSE(): void {



    // ponytail: EventSource basico enviando el token en URL (soportado por Spring Security WebFlux al habilitar allowUriQueryParameter)



    const token = this.authService.getToken();



    const sseUrl = buildApiUrl(`${API_PATHS.incident}/stream?access_token=${token}`);



    this.eventSource = new EventSource(sseUrl);



    this.eventSource.addEventListener('incidente-event', (event: any) => {



      this.ngZone.run(() => {



        const nuevo = JSON.parse(event.data);



        const idx = this.incidentes.findIndex(i => i.id === nuevo.id);



        



        let tituloStr = "Incidente Actualizado";



        if (idx < 0) {



          tituloStr = "Nuevo Incidente Reportado";



        } else if (nuevo.commandEntityId !== this.incidentes[idx].commandEntityId) {



          tituloStr = `Comando Traspasado a Entidad: ${nuevo.commandEntityId || 'Desconocida'}`;



        }



        



        const noti = {



          id: Date.now(),



          titulo: tituloStr,



          codigo: nuevo.trackingCode,



          gravedad: nuevo.severity,



          alertasCount: (nuevo.alertIds || []).length,



          hora: new Date(),



          tipo: nuevo.emergencyType



        };



        



        this.notificaciones.unshift(noti);



        this.guardarNotificacionesStorage();



        this.mostrarToast(noti);



        this.reproducirSonidoAlerta();







        if (idx >= 0) {



          this.incidentes[idx] = { ...this.incidentes[idx], ...nuevo };



        } else {



          this.incidentes.unshift(nuevo);



        }



        this.aplicarFiltrosLobby();



        // ngZone.run() ya dispara change detection, no necesita cdr.detectChanges()



      });



    });



  }







  abrirModalCrear(): void {



    this.modalCrearAbierto = true;



  }







  cerrarModalCrear(): void {



    this.modalCrearAbierto = false;



    this.guardandoIncidente = false;



  }







  onIncidenteCreado(payload: { severity: string; location: { lat: number; lng: number } }): void {



    this.guardandoIncidente = true;



    this.emergenciaService.crearManual(payload).subscribe({



      next: () => {



        this.guardandoIncidente = false;



        this.cerrarModalCrear();



        this.cargar();



        const noti = {



          id: Date.now(),



          titulo: 'Nueva Incidencia Creada Manualmente',



          codigo: 'INC-MANUAL',



          gravedad: payload.severity,



          alertasCount: 0,



          hora: new Date(),



          tipo: 'EMERGENCIA'



        };



        this.notificaciones.unshift(noti);



        this.guardarNotificacionesStorage();



        this.reproducirSonidoAlerta();



        this.mostrarToast(noti);



        this.civicToast.success('Incidencia creada correctamente.');



      },



      error: (err) => {



        this.guardandoIncidente = false;



        console.error('Error al crear incidencia:', err);



        this.civicToast.error(err.error?.message || 'Error al crear la incidencia. Verifica los datos.');



      }



    });



  }







  cargar(): void {



    this.cargando = true;



    this.errorCarga = false;







    this.emergenciaService.listar().subscribe({



      next: (data) => {



        this.ngZone.run(() => {



          this.incidentes = Array.isArray(data) ? data : [];



          this.enriquecerNombresEntidades();



          this.cargando = false;



          this.aplicarFiltrosLobby();



          this.cdr.detectChanges();



        });



      },



      error: (err) => {



        this.ngZone.run(() => {



          console.error('Error cargando incidentes:', err);



          this.incidentes = [];



          this.cargando = false;



          this.errorCarga = true;



          // ngZone.run() ya dispara change detection



        });



      }



    });



  }











  abrirDetalle(incidenteListado: IncidenteConEntidades): void {



    if (this.abriendoDetalle) return; 







    this.abriendoDetalle = true; 



    lockPageScroll(this.document);







    forkJoin({



      enriquecido: this.emergenciaService.obtenerPorId(incidenteListado.id).pipe(



        catchError((err) => {



          console.warn('Detalle enriquecido no disponible, usando datos del listado:', err);



          return of(incidenteListado);



        })



      ),



      puro: this.emergenciaService.obtenerDetallePuro(incidenteListado.id).pipe(



        catchError((err) => {



          console.warn('Detalle puro no disponible:', err);



          return of(null);



        })



      )



    }).subscribe({



      next: ({ enriquecido, puro }) => {



        const rawEvents = (puro?.logEvents && puro.logEvents.length > 0)



          ? puro.logEvents



          : (puro as any)?.eventLog ?? (puro as any)?.bitacoraEventos ?? enriquecido.logEvents ?? (enriquecido as any)?.eventLog ?? (enriquecido as any)?.bitacoraEventos ?? [];







        const detalleCompleto: IncidenteConEntidades = {



          ...incidenteListado,



          ...enriquecido,



          logEvents: rawEvents



        };



        this.aplicarDetalleIncidente(detalleCompleto, incidenteListado);



      },



      error: (err) => {



        console.error('Error cargando detalle del incidente:', err);



        this.aplicarDetalleIncidente(incidenteListado, incidenteListado);



      }



    });



  }







  



  // ==========================================



  // PESTAÑA CASTIGOS Y SANCIONES A ALERTANTES



  // ==========================================



  selectedPenaltyReporter: GroupedReporter | null = null;



  selectedPenaltyAlert: LinkedAlertDTO | null = null;



  readonly penalizedUserIdsInIncident = new Set<string>();







  penaltyInfractionType: 'FALSA_ALARMA' | 'CONDUCTA_CHAT' | 'USO_INDEBIDO' | 'OTRO' = 'FALSA_ALARMA';



  penaltyTabReason = '';



  penaltyTemporaryBlockHours = 24;



  isApplyingTabPenalty = false;



  reporterPenaltyHistory: CastigoHistorialEntry[] = [];



  isLoadingPenaltyHistory = false;







  readonly penaltyHoursPresets = [



    { hours: 24, label: '24 h' },



    { hours: 48, label: '48 h' },



    { hours: 72, label: '72 h' },



    { hours: 168, label: '7 días' }



  ];







  readonly frequentPenaltyReasons: Record<'FALSA_ALARMA' | 'CONDUCTA_CHAT' | 'USO_INDEBIDO' | 'OTRO', string[]> = {



    FALSA_ALARMA: [



      'Alerta falsa confirmada en el lugar por unidades en terreno',



      'Reporte de emergencia inexistente verificado por operadores',



      'Reiteración de llamadas o reportes falsos de auxilio'



    ],



    CONDUCTA_CHAT: [



      'Insultos, ofensas o amenazas al operador en el canal de chat',



      'Lenguaje hostil, discriminatorio o agresivo durante la atención',



      'Envío reiterado de spam o contenido fuera de contexto'



    ],



    USO_INDEBIDO: [



      'Uso indebido o abusivo del botón de auxilio ciudadano',



      'Envío masivo o duplicado intencional de solicitudes de emergencia',



      'Pruebas no autorizadas del sistema en situaciones no urgentes'



    ],



    OTRO: [



      'Incumplimiento de las normas cívicas de uso de la plataforma'



    ]



  };







  /** Alertantes únicos agrupados por ciudadano. Un ciudadano puede emitir múltiples alertas en un mismo incidente. */



  get uniqueReporters(): GroupedReporter[] {



    const map = new Map<string, GroupedReporter>();



    for (const alert of this.alertasVinculadas) {



      if (!alert.reporter) continue;



      const uid = alert.reporter.id || alert.reporter.dni || alert.reporter.email || 'anonimo';



      if (!map.has(uid)) {



        map.set(uid, {



          id: alert.reporter.id || uid,



          reporter: alert.reporter,



          alerts: [],



          totalAlerts: 0,



          alertCodes: [],



          alertas: [],



          totalAlertas: 0,



          codigosAlertas: []



        });



      }



      const item = map.get(uid)!;



      item.alerts.push(alert);



      item.totalAlerts++;



      item.alertas!.push(alert);



      item.totalAlertas!++;



      if (alert.alertCode && !item.alertCodes.includes(alert.alertCode)) {



        item.alertCodes.push(alert.alertCode);



        item.codigosAlertas!.push(alert.alertCode);



      }



    }



    return Array.from(map.values());



  }







  get totalAnonymousAlerts(): number {



    return this.alertasVinculadas.filter(a => !a.reporter).length;



  }







  initializePenaltyTab(): void {



    if (!this.selectedPenaltyReporter && this.uniqueReporters.length > 0) {



      this.selectReporterForPenalty(this.uniqueReporters[0]);



    }



  }







  selectReporterForPenalty(reporter: GroupedReporter, alert?: LinkedAlertDTO | null): void {



    this.selectedPenaltyReporter = reporter;



    const targetAlert = alert || reporter.alerts[0] || null;



    this.selectedPenaltyAlert = targetAlert;



    this.penaltyTabReason = '';



    this.penaltyTemporaryBlockHours = 24;



    if (reporter.id) {



      this.loadReporterPenaltyHistory(reporter.id);



    } else {



      this.reporterPenaltyHistory = [];



    }



    this.cdr.detectChanges();



  }







  isAlertPenalized(alertId: string): boolean {



    return this.penalizedAlertIds.has(alertId);



  }







  hasUnpenalizedAlerts(reporter: GroupedReporter | null): boolean {



    if (!reporter) return false;



    return reporter.alerts.some(a => !this.penalizedAlertIds.has(a.alertId));



  }







  getUnpenalizedAlerts(reporter: GroupedReporter | null): LinkedAlertDTO[] {



    if (!reporter) return [];



    return reporter.alerts.filter(a => !this.penalizedAlertIds.has(a.alertId));



  }







  navigateToReporterPenalty(alert: LinkedAlertDTO): void {



    if (alert.reporter) {



      this.cambiarPestana('CASTIGOS');



      const foundReporter = this.uniqueReporters.find(item => item.id === alert.reporter?.id);



      if (foundReporter) {



        this.selectReporterForPenalty(foundReporter, alert);



      }



    }



  }







  isUserPenalizedInIncident(userId: string): boolean {



    if (this.penalizedUserIdsInIncident.has(userId)) return true;



    const reporterGroup = this.uniqueReporters.find(u => u.id === userId);



    if (reporterGroup?.alerts?.some(a => this.penalizedAlertIds.has(a.alertId))) return true;



    return false;



  }







  selectInfractionType(type: 'FALSA_ALARMA' | 'CONDUCTA_CHAT' | 'USO_INDEBIDO' | 'OTRO'): void {



    this.penaltyInfractionType = type;



  }







  useFrequentReason(text: string): void {



    this.penaltyTabReason = this.penaltyTabReason.trim()



      ? `${this.penaltyTabReason.trim()} ${text}.`



      : `${text}. `;



  }







  loadReporterPenaltyHistory(userId: string): void {



    this.isLoadingPenaltyHistory = true;



    this.usuarioAdminService.listarHistorialUsuario(userId).subscribe({



      next: (history) => {



        this.reporterPenaltyHistory = (history || []).sort(



          (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()



        );



        for (const entry of history || []) {



          if (entry.alertaId) {



            this.penalizedAlertIds.add(entry.alertaId);



          }



          if (entry.incidenteId === this.incidenteSeleccionado?.id) {



            this.penalizedUserIdsInIncident.add(entry.userId);



          }



        }



        if (this.selectedPenaltyReporter) {



          if (!this.selectedPenaltyAlert) {
            this.selectedPenaltyAlert = this.selectedPenaltyReporter.alerts[0] || null;
          }



        }



        this.isLoadingPenaltyHistory = false;



        this.cdr.detectChanges();



      },



      error: (err) => {



        console.warn('No se pudo cargar historial de castigos:', err);



        this.reporterPenaltyHistory = [];



        this.isLoadingPenaltyHistory = false;



        this.cdr.detectChanges();



      }



    });



  }







  getCitizenPenalty(citizen: CitizenProfile | null): SistemaCastigos | null {



    if (!citizen) return null;



    return this.penaltiesByReporterId[citizen.id] ?? (citizen as any).penaltySystem ?? null;



  }







  getCitizenPenaltyLevel(citizen: CitizenProfile | null): number {



    const penaltySystem = this.getCitizenPenalty(citizen);



    if (!penaltySystem) return 0;



    if (penaltySystem.suspendido_permanente) return 3;



    if (this.isReporterTemporaryBlockActive(penaltySystem)) return 2;



    if ((penaltySystem.advertencias_acumuladas ?? 0) > 0) return 1;



    return 0;



  }







  getPenaltyLevelLabel(level: number): string {



    return etiquetaNivelCastigo(level);



  }







    canEscalateCitizenPenalty(reporter: GroupedReporter | null): boolean {
    if (!reporter?.reporter) return false;
    const currentLevel = this.getCitizenPenaltyLevel(reporter.reporter);
    if (currentLevel >= 3) return false;
    if (currentLevel === 2) {
      const penaltySystem = this.getCitizenPenalty(reporter.reporter);
      return !this.isReporterTemporaryBlockActive(penaltySystem);
    }
    return true;
  }

  getNextPenaltyLevelLabel(reporter: GroupedReporter | null): string {
    if (!reporter?.reporter) return 'Nivel 1 (Aviso / Advertencia)';
    const currentLevel = this.getCitizenPenaltyLevel(reporter.reporter);
    switch (currentLevel) {
      case 0: return 'Nivel 1 (Aviso / Advertencia)';
      case 1: return 'Nivel 2 (Bloqueo Temporal por 24 horas)';
      case 2: return 'Nivel 3 (Bloqueo Permanente)';
      default: return 'Suspensión Permanente';
    }
  }

  applyPenaltyFromTab(): void {



    const incidentId = this.incidenteSeleccionado?.id;



    const reporterGroup = this.selectedPenaltyReporter;



    const citizen = reporterGroup?.reporter;



    const reasonText = this.penaltyTabReason.trim();







    if (!reporterGroup || !citizen?.id || reasonText.length < 5 || this.isApplyingTabPenalty) {



      if (reasonText.length < 5) {



        this.civicToast.info('El motivo debe tener al menos 5 caracteres.');



      }



      return;



    }







    const prefix = this.penaltyInfractionType === 'FALSA_ALARMA'



      ? '[FALSA ALARMA] '



      : this.penaltyInfractionType === 'CONDUCTA_CHAT'



      ? '[CONDUCTA CHAT] '



      : this.penaltyInfractionType === 'USO_INDEBIDO'



      ? '[USO INDEBIDO] '



      : '';



    const finalReason = prefix + reasonText;







    this.isApplyingTabPenalty = true;







    if (!this.canEscalateCitizenPenalty(reporterGroup)) {
      const currentLevel = this.getCitizenPenaltyLevel(citizen);
      if (currentLevel >= 3) {
        this.civicToast.info('El ciudadano ya cuenta con una suspensión permanente.');
      } else if (currentLevel === 2) {
        this.civicToast.info('El ciudadano tiene un bloqueo temporal activo de 24 horas. No puede recibir más sanciones hasta que culmine el periodo.');
      }
      this.isApplyingTabPenalty = false;
      return;
    }

    // Alerta de referencia para asociar al castigo en el incidente
    const alertRef = this.selectedPenaltyAlert || reporterGroup.alerts[0] || null;

    if (!alertRef?.alertId || !incidentId) {
      this.civicToast.info('No se encontró una alerta asociada al ciudadano en este incidente.');
      this.isApplyingTabPenalty = false;
      return;
    }

    const req$ = this.usuarioAdminService.castigarAlerta(incidentId, alertRef.alertId, finalReason);







    req$.subscribe({



      next: (penalty) => {



        this.isApplyingTabPenalty = false;



        this.penaltiesByReporterId = {



          ...this.penaltiesByReporterId,



          [citizen.id]: castigoResponseToSistemaCastigos(penalty)



        };



        this.penalizedUserIdsInIncident.add(citizen.id);



        if (alertRef?.alertId) {



          this.penalizedAlertIds.add(alertRef.alertId);



        }







        if (incidentId) {



          const citizenName = `${citizen.firstName || ''} ${citizen.lastName || ''}`.trim() || `DNI ${citizen.dni || citizen.id}`;



          this.emergenciaService.agregarNotaBitacora(



            incidentId,



            'SANCION_ALERTANTE',



            `Sanción aplicada a alertante ${citizenName}: ${penalty.nivelEtiqueta}. Motivo: ${finalReason}`



          ).subscribe({



            next: (updatedIncident) => {



              if (this.incidenteBaseSeleccionado && updatedIncident?.logEvents) {



                this.incidenteBaseSeleccionado = {



                  ...this.incidenteBaseSeleccionado,



                  logEvents: updatedIncident.logEvents



                };



              }



            },



            error: (e) => console.warn('No se pudo registrar sanción en bitácora:', e)



          });



        }







        this.civicToast.success(`Sanción aplicada a ${citizen.firstName || "ciudadano"}: ${penalty.nivelEtiqueta}.`);



        this.penaltyTabReason = '';



        this.loadReporterPenaltyHistory(citizen.id);



        this.cdr.detectChanges();



      },



      error: (err: unknown) => {
        this.isApplyingTabPenalty = false;
        const errMsg = (err as any)?.error?.message || (err as any)?.message || 'No se pudo aplicar la sanción.';
        this.civicToast.error(errMsg);
        this.cdr.detectChanges();
      }



    });



  }







  private aplicarDetalleIncidente(



    detalle: IncidenteConEntidades,



    incidenteListado: IncidenteConEntidades



  ): void {



    const incidenteCompleto = this.convertirEnriquecidoAIncidenteBase(detalle);







    this.incidenteBaseSeleccionado = incidenteCompleto;







    this.incidenteSeleccionado = {



      ...incidenteListado,



      ...detalle,



      responsibleEntities: detalle.responsibleEntities?.length



        ? detalle.responsibleEntities



        : incidenteListado.responsibleEntities



    };







    this.pestanaActiva = 'DETALLE';



    this.bannerAyudaVisible = true; // Reiniciar banner al abrir detalle







    if (incidenteCompleto.location?.lat != null && incidenteCompleto.location?.lng != null) {



      this.mapCenter = {



        lat: Number(incidenteCompleto.location.lat),



        lng: Number(incidenteCompleto.location.lng)



      };



    }







    this.abriendoDetalle = false; 



    this.actualizarMarcadores();



    this.cdr.detectChanges();







    this.emergenciaService.obtenerAlertasVinculadas(incidenteListado.id).subscribe({



      next: (alertas) => {



        this.alertasVinculadas = alertas.map((a: any) => ({



          ...a,



          _fechaFormateada: this.formatearFecha(a.createdAt),



          _horaFormateada: this.formatearHora(a.createdAt)



        })) as any;



        this.enrichReporterPenalties(alertas);



        this.cdr.detectChanges();



      },



      error: (err: any) => console.error('Error cargando alertas vinculadas:', err)



    });



  }







  /** Castigar al emisor de una alerta falsa: operador y admins de entidad/municipalidad (ANALISTA solo lee). */



  get canPenalizeAlerts(): boolean {

    return this.authService.hasRole(

      ROLES.OPERADOR_ENTIDAD,

      ROLES.ENTIDAD_ADMIN,

      ROLES.MUNICIPALIDAD_ADMIN,

      ROLES.SUPER_ADMIN,

      'OPERADOR_ENTIDAD',

      'OPERADOR',

      'OPERADOR_LOGISTICO',

      'ENTIDAD_ADMIN',

      'ADMINISTRADOR_ENTIDAD',

      'MUNICIPALIDAD_ADMIN',

      'ADMINISTRADOR_MUNICIPALIDAD',

      'SUPER_ADMIN',

      'ADMINISTRADOR_GENERAL',

      'ADMIN'

    );

  }







  openedAlertPenaltyId: string | null = null;



  alertPenaltyReason = '';



  isPenalizingAlert = false;



  /** Alertas castigadas en esta sesión (el backend igual rechaza repetir con 409). */



  readonly penalizedAlertIds = new Set<string>();







  openAlertPenalty(alert: LinkedAlertDTO): void {



    this.openedAlertPenaltyId = alert.alertId;



    this.alertPenaltyReason = '';



  }







  cancelAlertPenalty(): void {



    this.openedAlertPenaltyId = null;



    this.alertPenaltyReason = '';



  }







  confirmAlertPenalty(alert: LinkedAlertDTO): void {



    const incidentId = this.incidenteSeleccionado?.id;



    const reasonText = this.alertPenaltyReason.trim();



    if (!incidentId || !alert.reporter || !reasonText || this.isPenalizingAlert) return;







    this.isPenalizingAlert = true;



    this.usuarioAdminService.castigarAlerta(incidentId, alert.alertId, reasonText).subscribe({



      next: (penalty) => {



        this.penaltiesByReporterId = {



          ...this.penaltiesByReporterId,



          [alert.reporter!.id]: castigoResponseToSistemaCastigos(penalty)



        };



        this.penalizedAlertIds.add(alert.alertId);



        if (alert.reporter?.id) {



          this.penalizedUserIdsInIncident.add(alert.reporter.id);



        }



        this.isPenalizingAlert = false;



        this.cancelAlertPenalty();



        this.civicToast.success(`Castigo aplicado: ${penalty.nivelEtiqueta}.`);



        this.cdr.detectChanges();



      },



      error: (err: unknown) => {



        this.isPenalizingAlert = false;



        if ((err as { status?: number })?.status === 409 || /ya fue castigada/i.test(String((err as Error)?.message))) {



          this.penalizedAlertIds.add(alert.alertId);



          this.cancelAlertPenalty();



        }



        this.civicToast.error(err instanceof Error ? err.message : 'No se pudo aplicar el castigo.');



        this.cdr.detectChanges();



      }



    });



  }







  getAlertReporterPenalty(alert: LinkedAlertDTO): SistemaCastigos | null {



    const reporter = alert.reporter;



    if (!reporter) return null;



    return this.penaltiesByReporterId[reporter.id] ?? (reporter as any).penaltySystem ?? null;



  }







  isReporterTemporaryBlockActive(penaltySystem: SistemaCastigos | null): boolean {



    if (!penaltySystem?.fecha_fin_bloqueo_temporal) return false;



    return new Date(penaltySystem.fecha_fin_bloqueo_temporal) > new Date();



  }







  private enrichReporterPenalties(alerts: LinkedAlertDTO[]): void {



    const ids = [...new Set(



      alerts.map(a => a.reporter?.id).filter((id): id is string => Boolean(id))



    )];



    if (ids.length === 0) return;







    this.usuarioAdminService.listarCastigos(ids).subscribe({



      next: (penaltiesMap) => {



        const enriched: Record<string, SistemaCastigos> = {};



        penaltiesMap.forEach((penalty, id) => {



          enriched[id] = castigoResponseToSistemaCastigos(penalty);



        });



        this.penaltiesByReporterId = { ...this.penaltiesByReporterId, ...enriched };



        this.cdr.detectChanges();



      },



      error: (err) => console.error('Error cargando castigos de alertantes:', err)



    });







    // Precargar historial de sanciones de los alertantes para reconocer alertas ya castigadas



    ids.forEach(userId => {



      this.usuarioAdminService.listarHistorialUsuario(userId).subscribe({



        next: (history) => {



          for (const entry of history || []) {



            if (entry.alertaId) {



              this.penalizedAlertIds.add(entry.alertaId);



            }



            if (entry.incidenteId === this.incidenteSeleccionado?.id) {



              this.penalizedUserIdsInIncident.add(entry.userId);



            }



          }



          if (this.selectedPenaltyReporter && this.selectedPenaltyAlert) {



            if (!this.selectedPenaltyAlert) {
              this.selectedPenaltyAlert = this.selectedPenaltyReporter.alerts[0] || null;
            }



          }



          this.cdr.detectChanges();



        },



        error: (err) => console.warn('No se pudo precargar historial de sanciones:', err)



      });



    });



  }







  private convertirEnriquecidoAIncidenteBase(detalle: IncidenteConEntidades): Incidente {



    return {



      id: detalle.id,



      trackingCode: detalle.trackingCode,



      emergencyType: detalle.emergencyType,



      location: detalle.location ?? {},



      alertIds: detalle.alertIds ?? [],



      responsibleEntityIds:



        detalle.responsibleEntityIds



        ?? detalle.responsibleEntities?.map(e => e.id)



        ?? [],



      assignedUnits: detalle.assignedUnits ?? [],



      severity: detalle.severity,



      currentStatus: detalle.currentStatus,



      createdAt: detalle.createdAt,



      logEvents: detalle.logEvents ?? (detalle as any).eventLog ?? (detalle as any).bitacoraEventos ?? [],



      consolidatedEvidence: detalle.consolidatedEvidence ?? [],



      assignedOperator: detalle.assignedOperator ?? null,



      parentIncidentId: detalle.parentIncidentId ?? null,



      finalResolution: detalle.finalResolution ?? null



    };



  }







  obtenerCodigoAlerta(alertaId: string | undefined): string {



    if (!alertaId) return 'S/C';



    const alerta = this.alertasVinculadas.find(a => a.alertId === alertaId);



    return alerta?.alertCode || `ID-${alertaId.substring(alertaId.length - 5).toUpperCase()}`;



  }







  cerrarDetalle(): void {



    this.exportarMenuAbierto = false;



    this.incidenteSeleccionado = null;



    this.incidenteBaseSeleccionado = null;



    this.pestanaActiva = 'LOBBY';



    unlockPageScroll(this.document);



    this.refrescarVista();



  }







  abrirChat(inc: IncidenteConEntidades): void {



    this.incidenteChat = inc;



    this.chatAbierto = true;



  }







  cerrarChat(): void {



    this.chatAbierto = false;



    this.incidenteChat = null;



  }







  @HostListener('document:click')



  onDocumentClick(): void {



    this.exportarMenuAbierto = false;



    this.exportarListadoMenuAbierto = false;



  }







  exportarMenuAbierto = false;







  toggleExportarMenu(): void {



    this.exportarMenuAbierto = !this.exportarMenuAbierto;



  }







  cerrarExportarMenu(): void {



    this.exportarMenuAbierto = false;



  }







  ejecutarExportar(tipo: 'pdf' | 'excel'): void {



    this.exportarMenuAbierto = false;



    if (tipo === 'pdf') {



      this.descargarReportePdf();



    } else {



      this.descargarReporteExcel();



    }



  }







  descargarReportePdf(): void {



    if (this.incidenteSeleccionado) this.exportar(() => this.incidentePdf.generateIncidentPdf(this.incidenteSeleccionado!, this.entidadesMap));



  }







  descargarReporteExcel(): void {



    if (this.incidenteSeleccionado) this.exportar(() => this.incidenteExcel.generateIncidentExcel(this.incidenteSeleccionado!, this.entidadesMap));



  }







  exportarListadoMenuAbierto = false;







  toggleExportarListadoMenu(): void {



    this.exportarListadoMenuAbierto = !this.exportarListadoMenuAbierto;



  }







  cerrarExportarListadoMenu(): void {



    this.exportarListadoMenuAbierto = false;



  }







  ejecutarExportarListado(tipo: 'pdf' | 'excel'): void {



    this.exportarListadoMenuAbierto = false;



    if (tipo === 'pdf') {



      this.descargarListadoPdf();



    } else {



      this.descargarListadoExcel();



    }



  }







  descargarListadoPdf(): void {



    if (!this.incidentesFiltrados.length) return;



    const filtros = {



      search: this.busquedaLobby,



      status: this.filtroActual === 'verificar' ? 'POR_VERIFICAR' : this.filtroActual === 'atencion' ? 'EN_ATENCION' : this.filtroActual === 'cerrado' ? 'CERRADO' : 'TODOS',



      



    };



    this.exportar(() => this.incidentePdf.generateIncidentListPdf(this.incidentesFiltrados, filtros, this.entidadesMap));



  }







  descargarListadoExcel(): void {



    if (!this.incidentesFiltrados.length) return;



    const filtros = {



      search: this.busquedaLobby,



      status: this.filtroActual === 'verificar' ? 'POR_VERIFICAR' : this.filtroActual === 'atencion' ? 'EN_ATENCION' : this.filtroActual === 'cerrado' ? 'CERRADO' : 'TODOS',



      



    };



    this.exportar(() => this.incidenteExcel.generateIncidentListExcel(this.incidentesFiltrados, filtros, this.entidadesMap));



  }







  private async exportar(generar: () => Promise<void>): Promise<void> {



    if (this.exportandoReporte) return;



    this.exportandoReporte = true;



    try {



      await generar();



    } catch {



      this.civicToast.error('No se pudo generar el reporte del incidente.');



    } finally {



      this.exportandoReporte = false;



      this.cdr.markForCheck();



    }



  }







  cargarRecursosDisponibles(): void {



    const token = this.authService.getToken();



    if (!token) return;







    try {



      const payload = JSON.parse(atob(token.split('.')[1]));



      const entidadId = payload.eid;







      if (!entidadId) return;







      this.recursoOperativoService.obtenerPorEntidad(entidadId).subscribe({



        next: (recursos) => {



          console.log('DATA CRUDA DE RECURSOS:', recursos);







          this.recursosDisponibles = recursos.filter(r => r.estadoDisponibilidad === 'DISPONIBLE').map(r => ({



            ...r,



            metricasCache: this.obtenerMetricas(r)



          }));



          this.actualizarMarcadores();



        },



        error: (err) => console.error('Error al cargar recursos operativos', err)



      });



    } catch (e) {



      console.error('Error decodificando token', e);



    }



  }











  // SERVICIOS DEL OPERADOR



  tomarIncidente(): void {



    if (!this.incidenteSeleccionado) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    this.procesandoAccion = true;







    this.emergenciaService.tomarIncidente(this.incidenteSeleccionado.id)



      .subscribe({



        next: (incidenteActualizado) => {



          this.procesandoAccion = false;



          



          // Actualizamos el modelo base (Datos crudos de MongoDB)



          this.incidenteBaseSeleccionado = incidenteActualizado;



          



          // Fusion para la vista (Mantiene la info enriquecida como entidadesResponsables)



          this.incidenteSeleccionado = {



            ...this.incidenteSeleccionado,



            ...incidenteActualizado



          } as IncidenteConEntidades;







          if (this.filtroActual === 'verificar') {



            this.filtroActual = 'atencion';



          }



          this.cdr.detectChanges(); // Repintamos



          this.cargar(); // Recargamos el listado de fondo por si cambia el estado



          this.civicToast.success('Incidente asignado a tu despacho exitosamente.');



        },



        error: (err) => {



          console.error('Error al tomar incidente:', err);



          this.procesandoAccion = false;



          this.civicToast.error(err.error?.message || 'No se pudo tomar el incidente.');



        }



      });



  }







  verificarIncidente(): void {



    if (!this.incidenteSeleccionado) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    this.verificando = true; // Usamos el estado específico







    const idIncidente = this.incidenteSeleccionado.id;







    this.emergenciaService.tomarIncidente(idIncidente, {} as any).pipe(



      concatMap(() => {



        return this.emergenciaService.verificarIncidente(idIncidente, {



          newSeverity: this.gravedadSeleccionada,



          status: 'EN_ATENCION'



        });



      })



    ).subscribe({



      next: (incidenteActualizado) => {



        this.verificando = false; 



        



        // 1. Actualizamos el DTO de la vista (para que la UI de la modal reaccione)



        this.incidenteSeleccionado = {



          ...this.incidenteSeleccionado,



          ...incidenteActualizado,



          currentStatus: 'EN_ATENCION',



          severity: this.gravedadSeleccionada



        } as IncidenteConEntidades;







        // 2. Actualizamos el Modelo Base (Conservando sus evidencias y arreglos de IDs)



        if (this.incidenteBaseSeleccionado) {



          const eventosActualizados = (incidenteActualizado.logEvents?.length)



            ? incidenteActualizado.logEvents



            : ((incidenteActualizado as any)?.eventLog?.length



              ? (incidenteActualizado as any).eventLog



              : this.incidenteBaseSeleccionado.logEvents);







          this.incidenteBaseSeleccionado = {



            ...this.incidenteBaseSeleccionado,



            ...incidenteActualizado,



            logEvents: eventosActualizados,



            currentStatus: 'EN_ATENCION',



            severity: this.gravedadSeleccionada



          } as any;



        }







        if (this.filtroActual === 'verificar') {



          this.filtroActual = 'atencion';



        }



        this.cdr.detectChanges(); 



        this.cargar(); 



        this.civicToast.success('Incidente verificado y en atención operativa.');



      },



      error: (err) => {



        console.error('❌ Error en la cadena de Verificar y Atender:', err);



        this.verificando = false;



        this.cdr.detectChanges();



        this.civicToast.error(err.error?.message || 'Error al verificar y atender el incidente.');



      }



    });



  }







  agregarNotaManual(): void {



    if (!this.incidenteSeleccionado || !this.notaOperador.trim()) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    this.procesandoAccion = true;







    this.emergenciaService.agregarNotaBitacora(



      this.incidenteSeleccionado.id, 



      'NOTA_OPERATIVA', 



      this.notaOperador



    ).subscribe({



      next: (incidenteActualizado) => {



        this.procesandoAccion = false;



        



        // Actualizamos el modelo base (ESTO ES LO QUE HACE QUE APAREZCA LA NOTA EN PANTALLA)



        this.incidenteBaseSeleccionado = incidenteActualizado;



        



        // fusion para la vista



        this.incidenteSeleccionado = {



          ...this.incidenteSeleccionado,



          ...incidenteActualizado



        } as IncidenteConEntidades;







        // Limpiamos la caja de texto



        this.notaOperador = ''; 



        



        this.cdr.detectChanges(); // Forzamos a repintar la bitácora



        this.cargar();



        this.civicToast.success('Nota registrada en la bitácora.');



      },



      error: (err) => {



        console.error('Error al agregar nota:', err);



        this.procesandoAccion = false;



        this.civicToast.error(err.error?.message || 'No se pudo registrar la nota en la bitácora.');



      }



    });



  }







  cerrarIncidente(): void {



    if (!this.incidenteSeleccionado || !this.resolucionCierre.trim()) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }







    if (!confirm('¿Estás seguro de cerrar esta incidencia? Esta acción no se puede deshacer.')) return;







    this.procesandoAccion = true;







    this.emergenciaService.cerrar(this.incidenteSeleccionado.id, this.resolucionCierre).subscribe({



      next: (incidenteActualizado: any) => {



        this.procesandoAccion = false;



        this.resolucionCierre = '';







        // Actualizamos el modelo base si el backend devuelve el incidente actualizado



        if (incidenteActualizado) {



          this.incidenteBaseSeleccionado = incidenteActualizado;



          this.incidenteSeleccionado = {



            ...this.incidenteSeleccionado,



            ...incidenteActualizado



          } as IncidenteConEntidades;



        } else {



          // Si el backend no devuelve body, actualizamos el estado localmente



          this.incidenteSeleccionado = {



            ...this.incidenteSeleccionado!,



            currentStatus: 'CERRADO' as EstadoIncidente



          } as IncidenteConEntidades;



        }







        this.cdr.detectChanges();



        this.cargar();



        this.civicToast.success('Incidencia cerrada correctamente.');



      },



      error: (err) => { 



        this.procesandoAccion = false;



        console.error('Error al cerrar incidencia:', err);



        this.civicToast.error(err.error?.message || 'Error al intentar cerrar la incidencia.');



      }



    });



  }







  reaperturarIncidente(): void {



    if (!this.incidenteSeleccionado || !this.motivoReapertura.trim()) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    



    if (!confirm('¿Está seguro de reaperturar este incidente cerrado? Esta acción quedará registrada bajo su usuario para auditoría.')) {



      return;



    }







    this.procesandoAccion = true;







    this.emergenciaService.reaperturar(this.incidenteSeleccionado.id, {



      reason: this.motivoReapertura



    }).subscribe({



      next: (incidenteActualizado) => {



        this.procesandoAccion = false;



        this.motivoReapertura = ''; // Limpiamos el formulario



        



        // Actualizamos los modelos locales para reflejar la UI inmediatamente



        this.incidenteBaseSeleccionado = incidenteActualizado;



        this.incidenteSeleccionado = {



          ...this.incidenteSeleccionado,



          ...incidenteActualizado,



          currentStatus: incidenteActualizado.currentStatus



        } as (IncidenteConEntidades & Incidente);







        this.cdr.detectChanges();



        this.cargar(); // Refresca la tabla general



        this.civicToast.success('Incidente reaperturado exitosamente. Alertas vinculadas pasaron a estado ACTIVA.');



      },



      error: (err) => {



        this.procesandoAccion = false;



        console.error('Error al reaperturar incidente:', err);



        this.civicToast.error(err.error?.message || 'Error al intentar reaperturar el incidente.');



      }



    });



  }







  // DRAG AND DROP 



  onDragStart(event: DragEvent, recursoId: string) {



    this.isDragging = true;



    if (event.dataTransfer) {



      event.dataTransfer.setData('text/plain', recursoId);



      event.dataTransfer.effectAllowed = 'move';



    }



  }







  onDragEnd(event: DragEvent) {



    this.isDragging = false; // Desactivamos si suelta fuera



  }



  // Se ejecuta mientras el mouse esta sobre la zona de soltado (el mapa)



  onDragOver(event: DragEvent) {



    // Es OBLIGATORIO prevenir el comportamiento por defecto para permitir el "drop"



    event.preventDefault();



    if (event.dataTransfer) {



      event.dataTransfer.dropEffect = 'move';



    }



  }







  // Se ejecuta cuando soltamos el recurso en el mapa



  onDrop(event: DragEvent) {



    event.preventDefault();



    this.isDragging = false;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    const recursoId = event.dataTransfer?.getData('text/plain');



    



    if (recursoId && this.incidenteSeleccionado) {



      const recursoSeleccionado = this.recursosDisponibles.find(r => r.id === recursoId);



      



      if (recursoSeleccionado) {



        console.log(`Unidad ${recursoSeleccionado.identificador} soltada en el mapa. Iniciando despacho...`);



        this.ejecutarDespachoFisico(recursoSeleccionado);



      }



    }



  }







  // DESPACHO DE UNIDADES



  ejecutarDespachoFisico(recurso: RecursoOperativo) {



    if(!this.incidenteSeleccionado) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    this.procesandoAccion = true;







    this.emergenciaService.registrarDespacho(this.incidenteSeleccionado.id, recurso.id!)



      .subscribe({



        next: (incidenteActualizado) => {



          this.procesandoAccion = false;



          



          // Actualizamos el modelo base (incluye unidadesAsignadas)



          this.incidenteBaseSeleccionado = incidenteActualizado;



          



          // Fusion para la vista



          this.incidenteSeleccionado = {



            ...this.incidenteSeleccionado,



            ...incidenteActualizado



          } as IncidenteConEntidades;



          



          // Sacamos la unidad de la lista "Disponible"



          this.recursosDisponibles = this.recursosDisponibles.filter(r => r.id !== recurso.id);



          



          // Logica visual del Mapa 



          if (recurso.ubicacionActual && recurso.ubicacionActual['lat'] && this.incidenteSeleccionado?.location) {



            const origen = { lat: Number(recurso.ubicacionActual['lat']), lng: Number(recurso.ubicacionActual['lng']) };



            const destino = { lat: Number(this.incidenteSeleccionado.location['lat']), lng: Number(this.incidenteSeleccionado.location['lng']) };







            this.trazarRuta(origen, destino);



            this.recursosEnMapa.push({ id: recurso.id ?? recurso.identificador ?? '', posicion: origen, identificador: recurso.identificador ?? recurso.internalCode ?? '' });



          }



          



          this.cdr.detectChanges();



          this.civicToast.success(`Unidad ${recurso.identificador || recurso.internalCode} despachada con éxito.`);



        },



        error: (err) => {



          this.procesandoAccion = false;



          console.error('Error al despachar:', err);



          const errMsg = err.error?.message || 'Error al intentar despachar la unidad.';



          this.civicToast.error(errMsg);



        }



      });



  }







  cambiarEstadoTactico(unidadId: string, nuevoEstado: string): void {



    if (!this.incidenteSeleccionado) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }



    this.procesandoAccion = true;



    this.emergenciaService.actualizarEstadoTactico(this.incidenteSeleccionado.id, unidadId, nuevoEstado).subscribe({



      next: (incidenteActualizado) => {



        this.procesandoAccion = false;



        this.incidenteBaseSeleccionado = incidenteActualizado;



        this.incidenteSeleccionado = {



          ...this.incidenteSeleccionado,



          ...incidenteActualizado



        } as IncidenteConEntidades;



        this.cdr.detectChanges();



        this.civicToast.success('Estado táctico de la unidad actualizado.');



      },



      error: (err) => {



        this.procesandoAccion = false;



        console.error('Error al cambiar estado táctico:', err);



        const errMsg = err.error?.message || 'Error al actualizar el estado de la unidad.';



        this.civicToast.error(errMsg);



      }



    });



  }







  // Se usa actualizarListasDerivadas() en su lugar







  cancelarDespacho(unidadId: string): void {



    if (!this.incidenteBaseSeleccionado || !this.incidenteSeleccionado) return;



    if (!this.puedeOperarIncidente(this.incidenteSeleccionado)) {



      this.civicToast.info('Usted no pertenece a la entidad o municipalidad correspondiente para operar sobre este incidente (Modo Supervisión).');



      return;



    }    



    if (!confirm('Â¿EstÃ¡s seguro de cancelar este despacho y liberar la unidad?')) return;



    



    this.procesandoAccion = true;







    this.emergenciaService.cancelarDespacho(this.incidenteSeleccionado.id, unidadId).subscribe({



      next: (incidenteActualizado) => {



        this.procesandoAccion = false;



        



        // Actualizamos el modelo base (el que tiene la bitacora y los IDs puros)



        this.incidenteBaseSeleccionado = incidenteActualizado;



        



        // Opcional si el estado o gravedad cambia, lo reflejamos en el modelo de la vista



        this.incidenteSeleccionado = {



          ...this.incidenteSeleccionado,



          currentStatus: incidenteActualizado.currentStatus,



          severity: incidenteActualizado.severity



        } as IncidenteConEntidades;







        // Limpiamos las rutas del mapa al cancelar



        this.rutasDespacho = [];



        this.recursosEnMapa = this.recursosEnMapa.filter(r => r.id !== unidadId); 



        



        this.cdr.detectChanges(); // Forzamos repintado



        



        if (this.pestanaActiva === 'DESPACHO') {



          this.cargarRecursosDisponibles();



        }



        this.civicToast.success('Despacho cancelado y unidad liberada.');



      },



      error: (err) => {



        this.procesandoAccion = false;



        console.error('Error al cancelar despacho:', err);



        this.civicToast.error(err.error?.message || 'Hubo un error al cancelar el despacho.');



      }



    });



  }







  incidenteMarkerData: any = null;



  recursosMarkersData: any[] = [];







  private actualizarMarcadores() {



    // Incidente



    if (this.incidenteSeleccionado?.location?.lat && this.incidenteSeleccionado?.location?.lng) {



      this.incidenteMarkerData = {



        position: {



          lat: Number(this.incidenteSeleccionado.location.lat),



          lng: Number(this.incidenteSeleccionado.location.lng)



        },



        title: this.incidenteSeleccionado.trackingCode,



        options: {}



      };



    } else {



      this.incidenteMarkerData = null;



    }







    // Recursos



    this.recursosMarkersData = this.recursosDisponibles



      .filter(recurso => recurso.ubicacionActual && recurso.ubicacionActual['lat'] && recurso.ubicacionActual['lng'])



      .map(recurso => ({



        id: recurso.id,



        identificador: recurso.identificador,



        position: {



          lat: Number(recurso.ubicacionActual!['lat']),



          lng: Number(recurso.ubicacionActual!['lng'])



        },



        options: {



          label: {



            text: recurso.identificador,



            className: 'bg-white text-xs font-bold px-1 rounded shadow border border-gray-300'



          },



          icon: 'assets/icons/unidad-disponible.png' 



        }



      }));



  }







  // metodo para centrar el mapa cuando seleccionas una emergencia de la lista



  seleccionarIncidente(incidente: IncidenteConEntidades) {



    this.incidenteSeleccionado = incidente;



    this.pestanaActiva = 'DETALLE'; 



    



    console.log(' Intentando centrar mapa en incidente:', incidente.trackingCode);



    console.log(' Datos crudos de ubicaciÃ³n:', incidente.location);







    if (incidente.location?.lat && incidente.location?.lng) {



      this.mapCenter = {



        lat: Number(incidente.location.lat),



        lng: Number(incidente.location.lng)



      };



      this.mapZoom = 15; 



      console.log(' Mapa centrado exitosamente en:', this.mapCenter);



    } else {



      console.warn(' Faltan coordenadas. El mapa no se centrara.');



    }



    



    // Aqui ejecutamos la logica que ya tenemos para cargar chats, bitacora, etc.(en stand by por la pestaña escalamiento)



  }







    enriquecerNombresEntidades(): void {



    if (!this.incidentes?.length || !this.entidadesMap.size) return;



    for (const inc of this.incidentes) {



      if (inc.responsibleEntities?.length) {



        for (const re of inc.responsibleEntities) {



          if (!re.businessName && re.id && this.entidadesMap.has(re.id)) {



            re.businessName = this.entidadesMap.get(re.id) ?? '';



          }



        }



      }



    }



  }







  cargarEntidadesParaDerivacion(): void {



    if (this.listaEntidadesDisponibles.length > 0) return;







    this.entidadService.listar().subscribe({



      next: (entidades) => {



        console.log('ENTIDADES RECIBIDAS DEL BACKEND:', entidades);



        



        this.listaEntidadesDisponibles = entidades.map(entidadADetalle);



        entidades.forEach((e: any) => {



          const nombre = e.businessName || e.razonSocial || e.nombre;



          if (e.id && nombre) {



            this.entidadesMap.set(e.id, nombre);



          }



        });



        this.enriquecerNombresEntidades();



      },



      error: (err) => {



        console.error('Error al cargar la lista de entidades:', err);



      }



    });



  }







  manejarEscalamientoExitoso(accion?: string) {



    if (accion === 'TRANSFERIR') {



      this.cerrarDetalle();



      this.cargar();



      return;



    }



    this.cargar(); // Refresca la tabla general



    if (this.incidenteSeleccionado) {



      this.seleccionarIncidente(this.incidenteSeleccionado);



    }



  }







  formatearHora(fechaISO: string): string {



    if (!fechaISO) return '';



    const d = new Date(fechaISO);



    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });



  }







  /** Devuelve la etiqueta legible para un tipo de emergencia. */



  etiquetaTipo(tipo: TipoEmergencia): string {



    return etiquetaTipoEmergencia(tipo);



  }







  iconoTipo(tipo: TipoEmergencia): string {



    return iconoTipoEmergencia(tipo);



  }







  etiquetaEstado(estado: EstadoIncidente): string {



    return this.estadosIncidente.find(e => e.value === estado)?.label ?? estado;



  }







  // CALCULOS GEOGRAFICOS FRONTEND



  obtenerMetricas(recurso: any): { distancia: string, eta: string } {



    const uIncidente = this.incidenteSeleccionado?.location;



    const uRecurso = recurso.ubicacionActual;







    // Validacion el incidente usa latitud/longitud, el recurso usa lat/lng



    if (!uIncidente?.['lat'] || !uRecurso?.['lat']) {



      return { distancia: '--', eta: '--' };



    }



    



    const lat1 = Number(uIncidente['lat']);



    const lon1 = Number(uIncidente['lng']);



    const lat2 = Number(uRecurso['lat']);



    const lon2 = Number(uRecurso['lng']);







    // Formula de Haversine



    const R = 6371; // Radio de la Tierra en km



    const dLat = (lat2 - lat1) * Math.PI / 180;



    const dLon = (lon2 - lon1) * Math.PI / 180;



    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +



              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *



              Math.sin(dLon/2) * Math.sin(dLon/2);



    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));



    const distancia = R * c;







    // ETA: 50km/h + 2 min margen



    const eta = Math.round((distancia / 50) * 60) + 2;







    return { 



      distancia: distancia.toFixed(1) + ' km', 



      eta: eta + ' min' 



    };



  }







  // --- Formatters CSS y Textos ---



  etiquetaGravedadVisual(inc: any): string {



    if (inc.currentStatus === 'VERIFICACION_PENDIENTE') return 'Pendiente';



    return inc.severity;



  }







  claseGravedadVisual(inc: any): string {



    if (inc.currentStatus === 'VERIFICACION_PENDIENTE') return 'bg-amber-50 text-amber-700 border-amber-300 border-dashed';



    return this.claseGravedad(inc.severity);



  }







  claseGravedad(gravedad: string): string {



    switch (gravedad) {



      case 'ALTA': return 'bg-red-50 text-red-700 border-red-200';



      case 'MEDIA': return 'bg-amber-50 text-amber-700 border-amber-200';



      case 'BAJA': return 'bg-emerald-50 text-emerald-700 border-emerald-200';



      default: return 'bg-gray-100 text-gray-400 border-gray-200';



    }



  }







  claseEstado(estado: string): string {



    switch (estado) {



      case 'NUEVO': return 'bg-blue-50 text-blue-700 border-blue-200';



      case 'EN_ATENCION': return 'bg-emerald-50 text-emerald-700 border-emerald-200';



      case 'VERIFICACION_PENDIENTE': return 'bg-amber-50 text-amber-700 border-amber-200';



      case 'CERRADO': 



      case 'ELIMINADO':



      case 'RESUELTO': return 'bg-gray-100 text-gray-500 border-gray-200';



      default: return 'bg-gray-100 text-gray-500 border-gray-200';



    }



  }







  formatearFecha(fecha?: string | null): string {



    if (!fecha) return '—';



    const d = new Date(fecha);



    if (isNaN(d.getTime())) return '—';



    return d.toLocaleString('es-PE', {



      day: '2-digit', month: '2-digit', year: 'numeric',



      hour: '2-digit', minute: '2-digit'



    });



  }







  /** Conteo por estado para los tiles del header. */



  conteoPorEstado(estado: EstadoIncidente): number {



    return this.incidentes.filter(i => i.currentStatus === estado).length;



  }







  totalActivos(): number {



    return this.incidentes.filter(i => i.currentStatus === 'NUEVO' || i.currentStatus === 'EN_ATENCION').length;



  }







  private refrescarVista(): void {



    try { this.cdr.detectChanges(); } catch { /* noop si ya destruido */ }



  }







  // Se usa actualizarListasDerivadas() en su lugar







  obtenerDatosBitacora(accion: string): DatosIcono {



    if (!accion) return { icono: 'push_pin', color: 'text-gray-400' };



    if (accion.includes('DESPACHO')) return { icono: 'airport_shuttle', color: 'text-rose-400' };



    if (accion.includes('NOTA')) return { icono: 'note_alt', color: 'text-amber-400' };



    if (accion.includes('DERIVA')) return { icono: 'move_up', color: 'text-purple-400' };



    if (accion.includes('INCIDENTE_CREADO')) return { icono: 'add_alert', color: 'text-emerald-400' };



    if (accion.includes('ESTADO') || accion.includes('VERIFICACION')) return { icono: 'fact_check', color: 'text-sky-400' };



    if (accion.includes('EVIDENCIA_MULTIMEDIA') || accion.includes('EVIDENCIA')) {



      return { icono: 'perm_media', color: 'text-indigo-400' };



    }



    if (accion.includes('ALERTA_VINCULADA') || accion.includes('VINCULADA')) {



      return { icono: 'add_link', color: 'text-fuchsia-400' }; 



    }



    if (accion.includes('TRIAGE')) {



      return { icono: 'assignment_turned_in', color: 'text-teal-400' }; 



    }



    return { icono: 'push_pin', color: 'text-gray-400' };



  }







  // --- trackBy functions para evitar re-creación de DOM ---



  trackByRecursoId(_: number, item: any): string {



    return item.id ?? item.identificador;



  }







  trackByAlertaId(_: number, item: AlertaVinculadaDTO): string {



    return item.alertId;



  }







  trackByIndex(index: number): number {



    return index;



  }







  trackByBitacoraFecha(_: number, item: any): string {



    return item.fecha;



  }







  trackByEvidenciaId(_: number, item: any): string {



    return item.id ?? item.contenido;



  }







  trackByUnidadId(_: number, item: any): string {



    return item.id;



  }







}























export { IncidentsComponent as Emergencias };







