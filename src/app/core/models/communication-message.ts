export interface CommunicationMessage {
  id: string;
  incidentId: string;
  senderId: string;
  senderName: string;
  senderRole: 'CIUDADANO' | 'OPERADOR_ENTIDAD';
  messageType: 'TEXTO' | 'IMAGEN' | 'AUDIO' | 'VIDEO';
  content: string;
  sentAt: string; // ISO String
}

export interface SendMessageRequest {
  messageType: 'TEXTO' | 'IMAGEN' | 'AUDIO' | 'VIDEO';
  content: string;
}

/** Alias retrocompatibles */
export type MensajeChat = CommunicationMessage;
export type EnviarMensajeRequest = SendMessageRequest;
