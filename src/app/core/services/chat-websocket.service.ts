import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';

export interface ChatEvento {
  tipo: 'MENSAJE_NUEVO' | 'MENSAJE_EDITADO' | 'MENSAJE_ELIMINADO' | 'USUARIO_ESCRIBIENDO' | 'CONEXION' | 'ERROR';
  salaId: string;
  payload: any;  // Backend usa 'payload', no 'datos'
  timestamp?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatWebSocketService {
  private sockets = new Map<string, WebSocket>();
  private eventos$ = new Subject<ChatEvento>();
  private reconectarTimeouts = new Map<string, any>();
  private intentosReconexion = new Map<string, number>();
  private readonly MAX_INTENTOS_RECONEXION = 5;

  constructor() {}

  /**
   * Conecta al WebSocket para una sala específica
   */
  conectarSala(salaId: string): Observable<ChatEvento> {
    if (this.sockets.has(salaId)) {
      const socket = this.sockets.get(salaId)!;
      if (socket.readyState === WebSocket.OPEN) {
        return this.eventos$.asObservable();
      }
    }

    // Determinar URL del WebSocket basado en API_BASE_URL
    const apiUrl = new URL(API_BASE_URL);
    const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${apiUrl.host}/api/chat-entidades/ws?salaId=${salaId}`;

    console.log('[ChatWS] Conectando a sala:', salaId, wsUrl);

    try {
      const socket = new WebSocket(wsUrl);
      this.sockets.set(salaId, socket);

      socket.onopen = () => {
        console.log('[ChatWS] Conectado a sala:', salaId);
        this.intentosReconexion.set(salaId, 0);
        this.eventos$.next({
          tipo: 'CONEXION',
          salaId,
          payload: { estado: 'conectado' },
          timestamp: new Date().toISOString()
        });
      };

      socket.onmessage = (event) => {
        try {
          const evento: ChatEvento = JSON.parse(event.data);
          this.eventos$.next(evento);
        } catch (e) {
          console.error('[ChatWS] Error parseando mensaje:', e);
        }
      };

      socket.onerror = (error) => {
        console.error('[ChatWS] Error en sala', salaId, ':', error);
        this.eventos$.next({
          tipo: 'ERROR',
          salaId,
          payload: { error: 'Error de conexión' },
          timestamp: new Date().toISOString()
        });
      };

      socket.onclose = () => {
        console.log('[ChatWS] Conexión cerrada para sala:', salaId);
        this.sockets.delete(salaId);
        this.intentarReconectar(salaId);
      };

    } catch (error) {
      console.error('[ChatWS] Error creando WebSocket para sala', salaId, ':', error);
    }

    return this.eventos$.asObservable();
  }

  /**
   * Conecta a todas las salas del usuario (llama a conectarSala por cada una)
   */
  conectar(): Observable<ChatEvento> {
    // Por ahora retorna el observable general
    // Las salas individuales se conectan cuando el usuario las selecciona
    return this.eventos$.asObservable();
  }

  /**
   * Envía un evento a una sala específica
   */
  enviarEvento(salaId: string, evento: Partial<ChatEvento>): void {
    const socket = this.sockets.get(salaId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(evento));
    }
  }

  /**
   * Notifica que el usuario está escribiendo en una sala
   */
  notificarEscribiendo(salaId: string, entidadId: string, entidadNombre: string): void {
    this.enviarEvento(salaId, {
      tipo: 'USUARIO_ESCRIBIENDO',
      salaId,
      payload: {
        entidadId,
        entidadNombre,
        escribiendo: true
      }
    });
  }

  /**
   * Desconecta de una sala específica
   */
  desconectarSala(salaId: string): void {
    const timeout = this.reconectarTimeouts.get(salaId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconectarTimeouts.delete(salaId);
    }

    const socket = this.sockets.get(salaId);
    if (socket) {
      socket.close();
      this.sockets.delete(salaId);
    }

    this.intentosReconexion.delete(salaId);
  }

  /**
   * Desconecta de todas las salas
   */
  desconectar(): void {
    this.sockets.forEach((_, salaId) => {
      this.desconectarSala(salaId);
    });
  }

  /**
   * Intenta reconectar a una sala con backoff exponencial
   */
  private intentarReconectar(salaId: string): void {
    const intentos = this.intentosReconexion.get(salaId) || 0;
    
    if (intentos >= this.MAX_INTENTOS_RECONEXION) {
      console.error('[ChatWS] Máximo de intentos de reconexión alcanzado para sala:', salaId);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, intentos), 30000);
    this.intentosReconexion.set(salaId, intentos + 1);

    console.log(`[ChatWS] Reconectando sala ${salaId} en ${delay}ms (intento ${intentos + 1})`);

    const timeout = setTimeout(() => {
      this.conectarSala(salaId).subscribe();
    }, delay);
    
    this.reconectarTimeouts.set(salaId, timeout);
  }
}
