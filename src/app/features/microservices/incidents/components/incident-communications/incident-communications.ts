import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
  input,
  output
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmergencyType, IncidentWithEntities } from '../../../../../core/models/incident';
import { CommunicationMessage } from '../../../../../core/models/communication-message';
import { AuthService } from '../../../../../core/auth/auth.service';
import { CommunicationsService, ChatRoomType } from '../../../../../core/services/communications';
import { iconoTipoEmergencia } from '../../../../../shared/utils/tipo-emergencia-ui';
import { CivicToastService } from '../../../../../shared/services/civic-toast.service';
import { CrisisRoomPdfService } from '../../../../../core/reports/crisis-room/crisis-room-pdf.service';
import { CrisisRoomExcelService } from '../../../../../core/reports/crisis-room/crisis-room-excel.service';
import { ReportBrandingService } from '../../../../../shared/reports/report-branding.service';

export interface FormattedCommunicationMessage extends CommunicationMessage {
  formattedTime?: string;
}

@Component({
  selector: 'app-incident-communications, app-emergencias-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './incident-communications.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IncidentCommunicationsComponent implements OnChanges, OnDestroy {
  private readonly communicationsService = inject(CommunicationsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly civicToast = inject(CivicToastService);
  readonly canHandle = inject(AuthService).puedeAtender;
  private readonly crisisRoomPdf = inject(CrisisRoomPdfService);
  private readonly crisisRoomExcel = inject(CrisisRoomExcelService);
  readonly canExport = inject(ReportBrandingService).puedeExportar();

  exportingReport = false;
  exportMenuOpen = false;

  toggleExportMenu(): void {
    this.exportMenuOpen = !this.exportMenuOpen;
  }

  closeExportMenu(): void {
    this.exportMenuOpen = false;
  }

  async exportChat(format: 'pdf' | 'excel'): Promise<void> {
    this.exportMenuOpen = false;
    const currentIncident = this.incident();
    if (!currentIncident || !this.messages.length || this.exportingReport) return;

    this.exportingReport = true;
    this.cdr.markForCheck();
    try {
      if (format === 'pdf') {
        await this.crisisRoomPdf.generateCrisisRoomPdf(currentIncident, this.messages, this.roomType);
      } else {
        await this.crisisRoomExcel.generateCrisisRoomExcel(currentIncident, this.messages, this.roomType);
      }
      this.civicToast.success('Reporte de sala de crisis generado correctamente.');
    } catch (err) {
      console.error('Error exportando sala de crisis:', err);
      this.civicToast.error('No se pudo generar el reporte de la sala de crisis.');
    } finally {
      this.exportingReport = false;
      this.cdr.markForCheck();
    }
  }

  // Signal Inputs y Outputs
  readonly isOpen = input<boolean>(false, { alias: 'abierto' });
  readonly incident = input<IncidentWithEntities | null>(null, { alias: 'incidente' });
  readonly closed = output<void>({ alias: 'cerrado' });

  @ViewChild('chatScroll') private chatScrollContainer?: ElementRef<HTMLDivElement>;

  private streamSub: Subscription | null = null;

  messages: FormattedCommunicationMessage[] = [];
  loadingChat = false;
  chatError: string | null = null;
  sendingMessage = false;
  newMessageText = '';
  activeTab: 'GENERAL' | 'PRIVADO' = 'GENERAL';

  get roomType(): ChatRoomType {
    return this.activeTab === 'PRIVADO' ? 'TACTICAL' : 'GENERAL';
  }

  cambiarPestana(tab: 'GENERAL' | 'PRIVADO'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    const currentIncident = this.incident();
    if (currentIncident?.id && this.isOpen()) {
      this.loadChatHistory(currentIncident);
    }
  }

  switchTab(tab: 'GENERAL' | 'PRIVADO'): void {
    this.cambiarPestana(tab);
  }

  // Getters para retrocompatibilidad de plantilla si fuera necesario
  get mensajes(): FormattedCommunicationMessage[] { return this.messages; }
  get cargandoChat(): boolean { return this.loadingChat; }
  get enviandoMensaje(): boolean { return this.sendingMessage; }
  get nuevoMensaje(): string { return this.newMessageText; }
  set nuevoMensaje(val: string) { this.newMessageText = val; }
  get pestanaActiva(): 'GENERAL' | 'PRIVADO' { return this.activeTab; }
  set pestanaActiva(val: 'GENERAL' | 'PRIVADO') { this.cambiarPestana(val); }

  getInitials(msg: FormattedCommunicationMessage): string {
    if (msg.senderRole !== 'OPERADOR_ENTIDAD') return 'CI';
    const name = msg.senderName || 'OP';
    return name.substring(0, 2).toUpperCase();
  }

  getRoleBadgeClasses(msg: FormattedCommunicationMessage): string {
    if (msg.senderRole !== 'OPERADOR_ENTIDAD') return 'bg-gray-100 text-gray-500 border border-gray-200';

    const name = (msg.senderName || '').toLowerCase();
    if (name.includes('polic') || name.includes('pnp')) return 'bg-blue-600 text-white';
    if (name.includes('salud') || name.includes('samu') || name.includes('medic')) return 'bg-emerald-600 text-white';
    if (name.includes('bomb')) return 'bg-red-600 text-white';

    return 'bg-slate-700 text-white';
  }

  ngOnChanges(changes: SimpleChanges): void {
    const openChange = changes['isOpen'] || changes['abierto'];
    const incidentChange = changes['incident'] || changes['incidente'];

    const currentOpen = this.isOpen();
    const currentIncident = this.incident();

    if (currentOpen && currentIncident?.id && (openChange || incidentChange)) {
      this.loadChatHistory(currentIncident);
    }

    if (!currentOpen && openChange) {
      this.clearState();
    }
  }

  ngOnDestroy(): void {
    this.clearState();
  }

  close(): void {
    this.clearState();
    this.closed.emit();
  }

  retryLoad(): void {
    const inc = this.incident();
    if (inc) {
      this.loadChatHistory(inc);
    }
  }

  // Alias para retrocompatibilidad
  cerrar(): void {
    this.close();
  }

  private formatMessage(msg: CommunicationMessage | FormattedCommunicationMessage): FormattedCommunicationMessage {
    const formatted = msg as FormattedCommunicationMessage;
    if (!formatted.formattedTime) {
      formatted.formattedTime = this.formatTime(formatted.sentAt);
    }
    return formatted;
  }

  async sendMessage(): Promise<void> {
    const currentIncident = this.incident();
    if (!this.newMessageText.trim() || !currentIncident) return;
    this.sendingMessage = true;

    const rawContent = this.newMessageText;
    const tempId = `temp_${Date.now()}`;

    const optimisticMessage: FormattedCommunicationMessage = {
      id: tempId,
      incidentId: currentIncident.id,
      senderRole: 'OPERADOR_ENTIDAD',
      senderId: 'yo',
      senderName: 'Yo',
      messageType: 'TEXTO',
      content: rawContent,
      sentAt: new Date().toISOString()
    };

    this.messages.push(this.formatMessage(optimisticMessage));
    this.newMessageText = '';
    this.scrollToBottom();

    const trimmedContent = rawContent.trim();
    const targetRoom = this.roomType;

    this.communicationsService.sendMessage(currentIncident.id, {
      messageType: 'TEXTO',
      content: trimmedContent
    }, targetRoom).subscribe({
      next: (realMessage) => {
        this.ngZone.run(() => {
          const index = this.messages.findIndex(m => m.id === tempId);
          if (index !== -1) {
            this.messages[index] = this.formatMessage(realMessage);
          }
          this.sendingMessage = false;
          this.refreshView();
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          console.error('Error al enviar mensaje de comunicación:', err);
          this.sendingMessage = false;
          this.messages = this.messages.filter(m => m.id !== tempId);
          this.civicToast.error('No se pudo enviar el mensaje a la sala de crisis. Inténtalo nuevamente.');
          this.refreshView();
        });
      }
    });
  }

  formatTime(isoDate: string): string {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  emergencyTypeIcon(type: EmergencyType): string {
    return iconoTipoEmergencia(type);
  }

  private loadChatHistory(inc: IncidentWithEntities): void {
    this.clearStream();
    this.messages = [];
    this.newMessageText = '';
    this.chatError = null;
    this.loadingChat = true;
    this.refreshView();

    const targetRoom = this.roomType;

    this.communicationsService.getChatHistory(inc.id, targetRoom).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.messages = (data || []).map(m => this.formatMessage(m));
          this.loadingChat = false;
          this.refreshView();
          this.scrollToBottom();
          this.listenLiveMessages(inc.id, targetRoom);
        });
      },
      error: (err) => {
        this.ngZone.run(() => {
          console.error('Error al cargar historial de comunicaciones:', err);
          this.loadingChat = false;
          this.chatError = 'No se pudo sincronizar los mensajes de la sala de crisis. Verifica tu conexión.';
          this.refreshView();
        });
      }
    });
  }

  private listenLiveMessages(incidentId: string, targetRoom: ChatRoomType = this.roomType): void {
    this.clearStream();
    this.streamSub = this.communicationsService.listenLiveMessages(incidentId, targetRoom).subscribe({
      next: (incomingMsg) => {
        this.ngZone.run(() => {
          const exists = this.messages.some(m => m.id === incomingMsg.id);
          if (exists) return;

          const tempIndex = this.messages.findIndex(m =>
            m.id.startsWith('temp_') && m.content === incomingMsg.content
          );

          if (tempIndex !== -1) {
            this.messages[tempIndex] = this.formatMessage(incomingMsg);
          } else {
            this.messages.push(this.formatMessage(incomingMsg));
          }

          this.refreshView();
          this.scrollToBottom();
        });
      }
    });
  }

  private clearState(): void {
    this.clearStream();
    this.messages = [];
    this.newMessageText = '';
    this.chatError = null;
    this.loadingChat = false;
    this.sendingMessage = false;
  }

  private clearStream(): void {
    if (this.streamSub) {
      this.streamSub.unsubscribe();
      this.streamSub = null;
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        if (this.chatScrollContainer) {
          this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
        }
      } catch {
        // Contenedor cerrado o ausente
      }
    }, 100);
  }

  private refreshView(): void {
    try { this.cdr.detectChanges(); } catch { /* noop */ }
  }
}

/** Alias retrocompatible */
export { IncidentCommunicationsComponent as EmergenciasChat };
