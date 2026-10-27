import { Injectable, inject } from '@angular/core';

import { IncidentWithEntities } from '../../models/incident';
import { CommunicationMessage } from '../../models/communication-message';
import { ChatRoomType } from '../../services/communications';
import { ReportPdfService } from '../../../shared/reports/report-pdf.service';
import { ReportConstants } from '../../../shared/reports/report.constants';
import {
  CRISIS_ROOM_REPORT,
  buildCrisisRoomFilters,
  buildCrisisRoomIncidentRows,
  buildCrisisRoomMessageRows,
  getCrisisRoomLabel,
  getCrisisRoomParticipantsCount,
  getCrisisRoomSlug,
  getCrisisRoomTimeSpan
} from './crisis-room-report.model';

@Injectable({ providedIn: 'root' })
export class CrisisRoomPdfService {
  private readonly pdf = inject(ReportPdfService);

  /**
   * Generates a formal PDF transcript of the Crisis Room communications.
   */
  async generateCrisisRoomPdf(
    incident: IncidentWithEntities,
    messages: CommunicationMessage[],
    roomType: ChatRoomType = 'GENERAL'
  ): Promise<void> {
    const filters = buildCrisisRoomFilters(incident, roomType);
    const doc = await this.pdf.abrir(CRISIS_ROOM_REPORT.TITLE, filters, 'portrait');

    const totalMessages = messages.length;
    const participantsCount = getCrisisRoomParticipantsCount(messages);
    const timeSpan = getCrisisRoomTimeSpan(messages);

    // Section 1: KPIs
    this.pdf.seccion(doc, 'Resumen operativo de la sala');
    this.pdf.tarjetas(doc, [
      {
        etiqueta: 'Total mensajes',
        valor: totalMessages,
        color: ReportConstants.HEADER_RGB,
        nota: `${participantsCount} participantes activos`
      },
      {
        etiqueta: 'Canal operativo',
        valor: getCrisisRoomLabel(roomType),
        color: roomType === 'TACTICAL' ? [185, 28, 28] : [37, 99, 235],
        nota: 'Canal encriptado'
      },
      {
        etiqueta: 'Intervalo temporal',
        valor: timeSpan.length > 25 ? `${totalMessages} mensajes` : timeSpan,
        color: ReportConstants.TEXTO_RGB,
        nota: timeSpan.length > 25 ? timeSpan : 'Registro cronológico'
      }
    ]);

    // Section 2: Incident Context
    this.pdf.seccion(doc, 'Contexto del incidente vinculado');
    this.pdf.tabla(doc, {
      columnas: CRISIS_ROOM_REPORT.INCIDENT_COLUMNS,
      filas: buildCrisisRoomIncidentRows(incident, roomType)
    });

    // Section 3: Messages Transcription
    this.pdf.seccion(doc, 'Transcripción cronológica de comunicaciones');
    this.pdf.tabla(doc, {
      columnas: [
        { titulo: 'N.°', ancho: 10 },
        ...CRISIS_ROOM_REPORT.MESSAGE_COLUMNS
      ],
      filas: buildCrisisRoomMessageRows(messages).map((row, index) => [
        messages.length ? index + 1 : '—',
        ...row
      ])
    });

    this.pdf.cierre(doc, `Fin del reporte de sala de crisis · ${totalMessages} mensajes registrados`);

    const placeholder = `${incident.trackingCode || incident.id}_${getCrisisRoomSlug(roomType)}`;
    await this.pdf.cerrar(doc, CRISIS_ROOM_REPORT.DOCUMENT, placeholder);
  }
}
