import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output
} from '@angular/core';

export interface IncidentNotificationItem {
  id?: string;
  gravedad?: string;
  hora?: string | Date;
  titulo?: string;
  codigo?: string;
  alertasCount?: number;
  [key: string]: unknown;
}

@Component({
  selector: 'app-incident-history, app-emergencias-historial',
  imports: [CommonModule],
  templateUrl: './incident-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IncidentHistoryComponent {
  readonly isOpen = input<boolean>(false, { alias: 'abierto' });
  readonly notifications = input<IncidentNotificationItem[]>([], { alias: 'notificaciones' });
  readonly closed = output<void>({ alias: 'cerrar' });

  // Getters para retrocompatibilidad
  get abierto(): boolean { return this.isOpen(); }
  get notificaciones(): IncidentNotificationItem[] { return this.notifications(); }
  get cerrar() { return this.closed; }
}

/** Alias retrocompatible */
export { IncidentHistoryComponent as EmergenciasHistorial };
