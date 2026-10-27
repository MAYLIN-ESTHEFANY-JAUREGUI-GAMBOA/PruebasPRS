import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL } from '../config/api-config';

// ══ Modelos ═══════════════════════════════════════════════════════════════

export interface SalaEntidad {
  id: string;
  displayName: string;  // Backend: displayName
  level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';  // Backend: level
  type: string;  // Backend: type
  category: string | null;  // Backend: category
  district: string | null;  // Backend: district
  description: string | null;  // Backend: description
  icon: string | null;
  color: string | null;
  totalEntities: number;  // Backend: totalEntities
  totalMessages: number;  // Backend: totalMessages
  lastMessageAt: string | null;  // Backend: lastMessageAt
  active: boolean;  // Backend: active
  createdAt: string;  // Backend: createdAt
  updatedAt: string;  // Backend: updatedAt
  mensajesNoLeidos?: number; // Para vista de entidad (calculado en frontend)
  silenciado?: boolean;       // Para vista de entidad (calculado en frontend)
}

export interface ParticipanteSala {
  id: string;
  roomId: string;  // Backend: roomId
  entityId: string;  // Backend: entityId
  entityName: string;  // Backend: entityName
  entityCategory: string;  // Backend: entityCategory
  entityDistrict: string;  // Backend: entityDistrict
  active: boolean;  // Backend: active (no activo)
  role: string;
  muted: boolean;
  unreadMessages: number;  // Backend: unreadMessages
  joinedAt: string;  // Backend: joinedAt
  lastActivity: string;  // Backend: lastActivity
  deactivatedAt: string | null;  // Backend: deactivatedAt
  updatedAt: string;
}

export interface MensajeEntidad {
  id: string;
  roomId: string;  // Backend: roomId
  roomLevel: string;  // Backend: roomLevel
  senderEntityId: string;  // Backend: senderEntityId
  senderCategory: string;  // Backend: senderCategory
  senderDistrict: string;  // Backend: senderDistrict
  senderName: string;  // Backend: senderName
  senderAvatarUrl: string | null;  // Backend: senderAvatarUrl
  message: string;  // Backend: message
  type: string;  // Backend: type (MessageType enum)
  priority: string;  // Backend: priority (Priority enum)
  metadata: any;
  readBy: any[];
  totalReads: number;
  replyTo: string | null;
  hasReplies: boolean;
  totalReplies: number;
  state: string;  // Backend: state (MessageState enum)
  edited: boolean;  // Backend: edited
  editedAt: string | null;  // Backend: editedAt
  originalMessage: string | null;  // Backend: originalMessage
  editionHistory: any[];  // Backend: editionHistory
  deletedByEntityId: string | null;
  deletedByName: string | null;
  deletedAt: string | null;
  deletionReason: string | null;
  createdAt: string;  // Backend: createdAt
  updatedAt: string;
}

// ══ Servicio ══════════════════════════════════════════════════════════════

const CHAT_BASE = `${API_BASE_URL}/api/chat-entidades`;

@Injectable({ providedIn: 'root' })
export class ChatAdminService {
  constructor(private http: HttpClient) {}

  // ══ Salas ═════════════════════════════════════════════════════════════════

  /** Lista todas las salas del sistema */
  obtenerSalas(): Observable<SalaEntidad[]> {
    return this.http.get<SalaEntidad[]>(`${CHAT_BASE}/salas`);
  }

  /** Salas filtradas por nivel */
  obtenerSalasPorNivel(nivel: string): Observable<SalaEntidad[]> {
    return this.http.get<SalaEntidad[]>(`${CHAT_BASE}/salas/nivel/${nivel}`);
  }

  /** Salas filtradas por categoría */
  obtenerSalasPorCategoria(categoria: string): Observable<SalaEntidad[]> {
    return this.http.get<SalaEntidad[]>(`${CHAT_BASE}/salas/categoria/${categoria}`);
  }

  /** Salas filtradas por distrito */
  obtenerSalasPorDistrito(distrito: string): Observable<SalaEntidad[]> {
    return this.http.get<SalaEntidad[]>(`${CHAT_BASE}/salas/distrito/${distrito}`);
  }

  // ══ Participantes ═════════════════════════════════════════════════════════

  /** Participantes de una sala */
  obtenerParticipantes(salaId: string): Observable<ParticipanteSala[]> {
    return this.http.get<ParticipanteSala[]>(`${CHAT_BASE}/salas/${salaId}/participantes`);
  }

  /** Salas en las que participa una entidad */
  obtenerSalasDeEntidad(entidadId: string): Observable<SalaEntidad[]> {
    return this.http.get<{ sala: SalaEntidad; mensajesNoLeidos: number; silenciado: boolean }[]>(
      `${CHAT_BASE}/salas/entidad/${entidadId}`
    ).pipe(
      map(respuesta => respuesta.map(r => ({
        ...r.sala,
        mensajesNoLeidos: r.mensajesNoLeidos,
        silenciado: r.silenciado
      })))
    );
  }

  // ══ Mensajes ══════════════════════════════════════════════════════════════

  /** Mensajes de una sala (con auditoría completa para admin) */
  obtenerMensajesConAuditoria(salaId: string, limit: number = 50): Observable<MensajeEntidad[]> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<MensajeEntidad[]>(`${API_BASE_URL}/api/chat-entidades/mensajes/sala/${salaId}/auditoria`, { params });
  }

  /** Enviar mensaje a una sala */
  enviarMensaje(salaId: string, mensaje: string, emisorEntidadId: string, prioridad: string = 'MEDIUM'): Observable<MensajeEntidad> {
    return this.http.post<MensajeEntidad>(`${API_BASE_URL}/api/chat-entidades/mensajes`, {
      roomId: salaId,
      senderEntityId: emisorEntidadId,
      message: mensaje,
      type: 'TEXT',
      priority: prioridad
    });
  }

  /** Editar mensaje */
  editarMensaje(mensajeId: string, nuevoTexto: string, emisorEntidadId: string): Observable<MensajeEntidad> {
    return this.http.put<MensajeEntidad>(`${API_BASE_URL}/api/chat-entidades/mensajes/${mensajeId}`, {
      message: nuevoTexto,
      senderEntityId: emisorEntidadId
    });
  }

  /** Eliminar mensaje (soft delete) */
  eliminarMensaje(mensajeId: string, emisorEntidadId: string): Observable<void> {
    const params = new HttpParams().set('entityId', emisorEntidadId);
    return this.http.delete<void>(`${API_BASE_URL}/api/chat-entidades/mensajes/${mensajeId}`, { params });
  }

  // ══ Acciones de sala ══════════════════════════════════════════════════════

  /** Silenciar/desilenciar notificaciones de una sala */
  toggleSilenciar(salaId: string, silenciar: boolean): Observable<void> {
    return this.http.patch<void>(`${CHAT_BASE}/salas/${salaId}/silenciar`, { silenciar });
  }

  /** Marcar mensajes como leídos */
  marcarComoLeido(salaId: string): Observable<void> {
    return this.http.patch<void>(`${CHAT_BASE}/salas/${salaId}/marcar-leida`, {});
  }
}
