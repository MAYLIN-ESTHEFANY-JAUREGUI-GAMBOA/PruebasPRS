import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CommunicationMessage, SendMessageRequest } from '../models/communication-message';
import { API_PATHS, buildApiUrl } from '../config/api-config';
import { AuthService } from '../auth/auth.service';

export type ChatRoomType = 'GENERAL' | 'TACTICAL';

@Injectable({ providedIn: 'root' })
export class CommunicationsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly incidentsBaseUrl = buildApiUrl(API_PATHS.incident);

  private buildRoomPath(incidentId: string, roomType: ChatRoomType = 'GENERAL'): string {
    return roomType === 'TACTICAL'
      ? `${this.incidentsBaseUrl}/${incidentId}/chat/tactical`
      : `${this.incidentsBaseUrl}/${incidentId}/chat`;
  }

  /** Obtiene el historial de mensajes de comunicaciones de un incidente (general o táctico) */
  getChatHistory(incidentId: string, roomType: ChatRoomType = 'GENERAL'): Observable<CommunicationMessage[]> {
    const url = this.buildRoomPath(incidentId, roomType);
    return this.http.get<CommunicationMessage[]>(url);
  }

  /** Envía un nuevo mensaje a la sala de comunicaciones del incidente (general o táctico) */
  sendMessage(incidentId: string, message: SendMessageRequest, roomType: ChatRoomType = 'GENERAL'): Observable<CommunicationMessage> {
    const url = this.buildRoomPath(incidentId, roomType);
    return this.http.post<CommunicationMessage>(url, message);
  }

  /** Abre un túnel en vivo (SSE) para recibir mensajes en tiempo real (general o táctico) */
  listenLiveMessages(incidentId: string, roomType: ChatRoomType = 'GENERAL'): Observable<CommunicationMessage> {
    const token = this.authService.getToken();
    const streamUrl = roomType === 'TACTICAL'
      ? `${this.incidentsBaseUrl}/${incidentId}/chat/tactical/stream`
      : `${this.incidentsBaseUrl}/${incidentId}/chat/stream`;

    return new Observable(observer => {
      // AbortController para cancelar la conexión al cerrar el panel
      const controller = new AbortController();

      fetch(streamUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: controller.signal
      }).then(async response => {
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].replace('data:', '').trim();
            if (line) {
              try {
                const newMessage: CommunicationMessage = JSON.parse(line);
                observer.next(newMessage);
              } catch (e) {
                console.error('Error parseando JSON de SSE:', e);
              }
            }
          }
          buffer = lines[lines.length - 1];
        }
      }).catch(err => {
        if (err.name !== 'AbortError') observer.error(err);
      });

      return () => controller.abort();
    });
  }

  // Alias retrocompatibles
  obtenerHistorialChat(incidenteId: string, roomType: ChatRoomType = 'GENERAL'): Observable<CommunicationMessage[]> {
    return this.getChatHistory(incidenteId, roomType);
  }

  enviarMensaje(incidenteId: string, mensaje: SendMessageRequest, roomType: ChatRoomType = 'GENERAL'): Observable<CommunicationMessage> {
    return this.sendMessage(incidenteId, mensaje, roomType);
  }

  escucharMensajesEnVivo(incidenteId: string, roomType: ChatRoomType = 'GENERAL'): Observable<CommunicationMessage> {
    return this.listenLiveMessages(incidenteId, roomType);
  }
}

/** Alias retrocompatible de clase */
export { CommunicationsService as ChatService };
