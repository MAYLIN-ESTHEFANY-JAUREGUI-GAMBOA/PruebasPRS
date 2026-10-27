import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ChatAdminService,
  SalaEntidad,
  ParticipanteSala,
  MensajeEntidad
} from '../../../core/services/chat-admin';
import { ChatWebSocketService, ChatEvento } from '../../../core/services/chat-websocket.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Subscription } from 'rxjs';
import { debounceTime, Subject } from 'rxjs';

type FiltroPanelNivel = 'TODOS' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

@Component({
  selector: 'app-chat-entidades',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-entidades.html',
  styleUrl: './chat-entidades.css'
})
export class ChatEntidades implements OnInit, OnDestroy {

  // ══ Estado de salas ═══════════════════════════════════════════════════════
  salas = signal<SalaEntidad[]>([]);
  cargandoSalas = signal(false);
  errorSalas = signal('');
  filtroNivel = signal<FiltroPanelNivel>('TODOS');
  busqueda = signal('');

  readonly salasFiltradas = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const nivel = this.filtroNivel();
    return this.salas().filter(s => {
      const coincideNivel = nivel === 'TODOS' || s.level === nivel;
      const contenido = [s.id, s.displayName, s.category ?? '', s.district ?? '']
        .join(' ').toLowerCase();
      const coincideTexto = !texto || contenido.includes(texto);
      return coincideNivel && coincideTexto;
    });
  });

  // ══ Estado de sala seleccionada y mensajes ════════════════════════════════
  salaSeleccionada = signal<SalaEntidad | null>(null);
  mensajes = signal<MensajeEntidad[]>([]);
  cargandoMensajes = signal(false);
  nuevoMensaje = signal('');
  enviandoMensaje = signal(false);

  // ══ Participantes ═════════════════════════════════════════════════════════
  participantes = signal<ParticipanteSala[]>([]);
  cargandoParticipantes = signal(false);

  readonly participantesActivos = computed(() =>
    this.participantes().filter(p => p.active).length
  );

  readonly participantesInactivos = computed(() =>
    this.participantes().filter(p => !p.active).length
  );

  // ══ WebSocket ═════════════════════════════════════════════════════════════
  private wsSubscription: Subscription | null = null;
  usuariosEscribiendo = signal<string[]>([]);
  
  // Subject para debounce del evento "escribiendo"
  private escribiendoSubject = new Subject<void>();
  private escribiendoSubscription: Subscription | null = null;

  // ══ Referencias DOM ═══════════════════════════════════════════════════════
  @ViewChild('chatScroll') private chatScrollContainer?: ElementRef;

  // ══ Resumen ═══════════════════════════════════════════════════════════════
  readonly totalSalas   = computed(() => this.salas().length);
  readonly totalNivel1  = computed(() => this.salas().filter(s => s.level === 'LEVEL_1').length);
  readonly totalNivel2  = computed(() => this.salas().filter(s => s.level === 'LEVEL_2').length);
  readonly totalNivel3  = computed(() => this.salas().filter(s => s.level === 'LEVEL_3').length);
  readonly totalEntidadesSincronizadas = computed(() =>
    this.salas().reduce((acc, s) => acc + s.totalEntities, 0)
  );

  constructor(
    private chatAdminService: ChatAdminService,
    private wsService: ChatWebSocketService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.cargarSalas();
    this.conectarWebSocket();
    this.configurarDebounceEscribiendo();
  }

  ngOnDestroy(): void {
    this.desconectarWebSocket();
    if (this.escribiendoSubscription) {
      this.escribiendoSubscription.unsubscribe();
    }
  }

  // ══ Carga de datos ════════════════════════════════════════════════════════

  cargarSalas(): void {
    this.cargandoSalas.set(true);
    this.errorSalas.set('');

    this.chatAdminService.obtenerSalas().subscribe({
      next: salas => {
        this.salas.set(salas);
        this.cargandoSalas.set(false);
      },
      error: err => {
        console.error('Error cargando salas:', err);
        this.errorSalas.set('No se pudieron cargar las salas de chat.');
        this.cargandoSalas.set(false);
      }
    });
  }

  seleccionarSala(sala: SalaEntidad): void {
    this.salaSeleccionada.set(sala);
    this.cargarMensajes(sala.id);
    this.cargarParticipantes(sala.id);
    this.marcarComoLeido(sala.id);
    
    // Conectar WebSocket a esta sala específica
    this.wsService.conectarSala(sala.id);
  }

  cargarMensajes(salaId: string): void {
    this.cargandoMensajes.set(true);
    this.mensajes.set([]);

    this.chatAdminService.obtenerMensajesConAuditoria(salaId, 100).subscribe({
      next: mensajes => {
        this.mensajes.set(mensajes);
        this.cargandoMensajes.set(false);
        setTimeout(() => this.scrollToBottom(), 100);
      },
      error: err => {
        console.error('Error cargando mensajes:', err);
        this.cargandoMensajes.set(false);
      }
    });
  }

  cargarParticipantes(salaId: string): void {
    this.cargandoParticipantes.set(true);

    this.chatAdminService.obtenerParticipantes(salaId).subscribe({
      next: participantes => {
        this.participantes.set(participantes);
        this.cargandoParticipantes.set(false);
      },
      error: err => {
        console.error('Error cargando participantes:', err);
        this.cargandoParticipantes.set(false);
      }
    });
  }

  // ══ Envío de mensajes ═════════════════════════════════════════════════════

  enviarMensaje(): void {
    const contenido = this.nuevoMensaje().trim();
    const sala = this.salaSeleccionada();
    const entidadId = this.authService.getEntidadId();

    if (!contenido || !sala || !entidadId || this.enviandoMensaje()) return;

    this.enviandoMensaje.set(true);

    this.chatAdminService.enviarMensaje(sala.id, contenido, entidadId).subscribe({
      next: (mensaje) => {
        // El mensaje se agregará automáticamente vía WebSocket
        this.nuevoMensaje.set('');
        this.enviandoMensaje.set(false);
        this.scrollToBottom();
      },
      error: (err) => {
        console.error('Error enviando mensaje:', err);
        this.enviandoMensaje.set(false);
      }
    });
  }

  onEnterPress(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.enviarMensaje();
    }
    // Si shiftKey está presionado, permite el salto de línea por defecto
  }

  marcarComoLeido(salaId: string): void {
    this.chatAdminService.marcarComoLeido(salaId).subscribe({
      next: () => {
        // Actualizar contador de la sala
        const salasActuales = this.salas();
        const salaIndex = salasActuales.findIndex(s => s.id === salaId);
        if (salaIndex >= 0) {
          const salaActualizada = { ...salasActuales[salaIndex], mensajesNoLeidos: 0 };
          const nuevasSalas = [...salasActuales];
          nuevasSalas[salaIndex] = salaActualizada;
          this.salas.set(nuevasSalas);
        }
      },
      error: err => console.error('Error marcando como leído:', err)
    });
  }

  // ══ WebSocket ═════════════════════════════════════════════════════════════

  private configurarDebounceEscribiendo(): void {
    this.escribiendoSubscription = this.escribiendoSubject
      .pipe(debounceTime(500))
      .subscribe(() => {
        const sala = this.salaSeleccionada();
        const entidadId = this.authService.getEntidadId();
        const session = this.authService.session();
        
        // Obtener nombre de la entidad o del usuario
        const entidadNombre = session?.entidad?.razonSocial || 
                              (session?.profile ? `${session.profile.firstName} ${session.profile.lastName}` : null) ||
                              'Usuario';
        
        if (sala && entidadId) {
          this.wsService.notificarEscribiendo(sala.id, entidadId, entidadNombre);
        }
      });
  }

  onInputChange(): void {
    // Notificar que el usuario está escribiendo (con debounce)
    if (this.nuevoMensaje().trim()) {
      this.escribiendoSubject.next();
    }
  }

  private conectarWebSocket(): void {
    this.wsSubscription = this.wsService.conectar().subscribe({
      next: (evento: ChatEvento) => {
        this.manejarEventoWebSocket(evento);
      },
      error: err => console.error('[Chat] Error WebSocket:', err)
    });
  }

  private desconectarWebSocket(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
      this.wsSubscription = null;
    }
    this.wsService.desconectar();
  }

  private manejarEventoWebSocket(evento: ChatEvento): void {
    switch (evento.tipo) {
      case 'MENSAJE_NUEVO':
        this.agregarMensajeNuevo(evento);
        break;
      case 'MENSAJE_EDITADO':
        this.actualizarMensajeEditado(evento);
        break;
      case 'MENSAJE_ELIMINADO':
        this.eliminarMensaje(evento);
        break;
      case 'USUARIO_ESCRIBIENDO':
        this.mostrarUsuarioEscribiendo(evento);
        break;
    }
  }

  private agregarMensajeNuevo(evento: ChatEvento): void {
    const salaActual = this.salaSeleccionada();
    
    if (salaActual && evento.salaId === salaActual.id) {
      // Agregar mensaje a la sala actual
      this.mensajes.set([...this.mensajes(), evento.payload]);
      setTimeout(() => this.scrollToBottom(), 50);
    } else {
      // Incrementar contador de mensajes no leídos
      const salasActuales = this.salas();
      const salaIndex = salasActuales.findIndex(s => s.id === evento.salaId);
      if (salaIndex >= 0) {
        const salaActualizada = {
          ...salasActuales[salaIndex],
          mensajesNoLeidos: (salasActuales[salaIndex].mensajesNoLeidos || 0) + 1
        };
        const nuevasSalas = [...salasActuales];
        nuevasSalas[salaIndex] = salaActualizada;
        this.salas.set(nuevasSalas);
      }
    }
  }

  private actualizarMensajeEditado(evento: ChatEvento): void {
    const mensajesActuales = this.mensajes();
    const index = mensajesActuales.findIndex(m => m.id === evento.payload.id);
    if (index >= 0) {
      const nuevosMensajes = [...mensajesActuales];
      nuevosMensajes[index] = evento.payload;
      this.mensajes.set(nuevosMensajes);
    }
  }

  private eliminarMensaje(evento: ChatEvento): void {
    this.mensajes.set(
      this.mensajes().filter(m => m.id !== evento.payload.mensajeId)
    );
  }

  private mostrarUsuarioEscribiendo(evento: ChatEvento): void {
    const data = evento.payload;
    const entidadId = data.entidadId;
    const entidadNombre = data.entidadNombre;
    
    if (!entidadNombre || !entidadId) return;

    // No mostrar si es el propio usuario escribiendo
    const miEntidadId = this.authService.getEntidadId();
    if (entidadId === miEntidadId) return;

    // Agregar usuario a la lista si no está
    const usuariosActuales = this.usuariosEscribiendo();
    if (!usuariosActuales.includes(entidadNombre)) {
      this.usuariosEscribiendo.set([...usuariosActuales, entidadNombre]);
    }

    // Quitar después de 3 segundos
    setTimeout(() => {
      this.usuariosEscribiendo.set(
        this.usuariosEscribiendo().filter(u => u !== entidadNombre)
      );
    }, 3000);
  }

  // ══ Utilidades ════════════════════════════════════════════════════════════

  private scrollToBottom(): void {
    if (this.chatScrollContainer) {
      const element = this.chatScrollContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  formatearHora(fechaISO: string): string {
    if (!fechaISO) return '';
    const d = new Date(fechaISO);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  formatearFecha(fechaISO: string): string {
    if (!fechaISO) return '';
    const d = new Date(fechaISO);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  seleccionarFiltro(filtro: FiltroPanelNivel): void {
    this.filtroNivel.set(filtro);
  }

  actualizarBusqueda(texto: string): void {
    this.busqueda.set(texto);
  }
}
