import { Injectable, inject } from '@angular/core';

import { IncidentWithEntities } from '../../models/incident';
import { CommunicationMessage } from '../../models/communication-message';
import { ChatRoomType } from '../../services/communications';
import { ReportExcelService } from '../../../shared/reports/report-excel.service';
import {
  CRISIS_ROOM_REPORT,
  buildCrisisRoomFilters,
  buildCrisisRoomIncidentRows,
  buildCrisisRoomMessageRows,
  getCrisisRoomSlug
} from './crisis-room-report.model';

@Injectable({ providedIn: 'root' })
export class CrisisRoomExcelService {
  private readonly excel = inject(ReportExcelService);

  /**
   * Generates a multi-sheet Excel workbook with the crisis room chat transcript and incident details.
   */
  generateCrisisRoomExcel(
    incident: IncidentWithEntities,
    messages: CommunicationMessage[],
    roomType: ChatRoomType = 'GENERAL'
  ): Promise<void> {
    const filters = buildCrisisRoomFilters(incident, roomType);
    const placeholder = `${incident.trackingCode || incident.id}_${getCrisisRoomSlug(roomType)}`;

    const messageRows = buildCrisisRoomMessageRows(messages).map((row, index) => [
      messages.length ? index + 1 : '—',
      ...row
    ]);

    return this.excel.libro(
      CRISIS_ROOM_REPORT.TITLE,
      filters,
      [
        {
          nombre: CRISIS_ROOM_REPORT.SHEET_MESSAGES,
          columnas: [
            'N.°',
            ...CRISIS_ROOM_REPORT.MESSAGE_COLUMNS.map(c => c.titulo)
          ],
          filas: messageRows,
          anchos: [10, 20, 24, 30, 18, 90],
          estados: [4] // Columna 'Tipo' con estilo semántico
        },
        {
          nombre: 'Incidente',
          columnas: CRISIS_ROOM_REPORT.INCIDENT_COLUMNS.map(c => c.titulo),
          filas: buildCrisisRoomIncidentRows(incident, roomType),
          anchos: [30, 60]
        }
      ],
      CRISIS_ROOM_REPORT.DOCUMENT,
      placeholder,
      messages.length
    );
  }
}
