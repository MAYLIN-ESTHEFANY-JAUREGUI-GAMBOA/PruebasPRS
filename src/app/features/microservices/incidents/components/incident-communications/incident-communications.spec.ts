import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { IncidentCommunicationsComponent } from './incident-communications';
import { CommunicationsService } from '../../../../../core/services/communications';
import { AuthService } from '../../../../../core/auth/auth.service';
import { CivicToastService } from '../../../../../shared/services/civic-toast.service';
import { CommunicationMessage } from '../../../../../core/models/communication-message';

describe('IncidentCommunicationsComponent', () => {
  let component: IncidentCommunicationsComponent;
  let fixture: ComponentFixture<IncidentCommunicationsComponent>;
  let mockCommsService: jasmine.SpyObj<CommunicationsService>;
  let mockToastService: jasmine.SpyObj<CivicToastService>;

  const mockIncident = {
    id: 'inc-999',
    trackingCode: 'INC-2026-999',
    emergencyType: 'INCENDIO',
    currentStatus: 'EN_ATENCION',
    assignedOperator: { fullName: 'Operador PNP' }
  } as any;

  const sampleMessages: CommunicationMessage[] = [
    {
      id: 'msg-1',
      incidentId: 'inc-999',
      senderRole: 'CIUDADANO',
      senderId: 'ciu-1',
      senderName: 'Juan Pérez',
      messageType: 'TEXTO',
      content: 'Fuego en el segundo piso',
      sentAt: new Date().toISOString()
    },
    {
      id: 'msg-2',
      incidentId: 'inc-999',
      senderRole: 'OPERADOR_ENTIDAD',
      senderId: 'op-1',
      senderName: 'Policía Nacional',
      messageType: 'TEXTO',
      content: 'Unidades en camino al lugar',
      sentAt: new Date().toISOString()
    }
  ];

  beforeEach(async () => {
    mockCommsService = jasmine.createSpyObj('CommunicationsService', [
      'getChatHistory',
      'sendMessage',
      'listenLiveMessages'
    ]);
    mockCommsService.getChatHistory.and.returnValue(of(sampleMessages));
    mockCommsService.sendMessage.and.returnValue(of(sampleMessages[1]));
    mockCommsService.listenLiveMessages.and.returnValue(of());

    mockToastService = jasmine.createSpyObj('CivicToastService', ['error', 'success', 'info', 'warning']);

    await TestBed.configureTestingModule({
      imports: [IncidentCommunicationsComponent],
      providers: [
        provideHttpClient(),
        { provide: CommunicationsService, useValue: mockCommsService },
        { provide: CivicToastService, useValue: mockToastService },
        {
          provide: AuthService,
          useValue: {
            puedeAtender: () => true,
            hasRole: () => true,
            isAdmin: () => true,
            getToken: () => 'fake-jwt-token'
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentCommunicationsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('incidente', mockIncident);
    fixture.componentRef.setInput('abierto', true);
    fixture.detectChanges();
  });

  it('debe crearse correctamente', () => {
    expect(component).toBeTruthy();
  });

  it('debe inicializar y cargar historial de mensajes al abrir', () => {
    component.ngOnChanges({
      isOpen: {
        currentValue: true,
        previousValue: false,
        firstChange: true,
        isFirstChange: () => true
      }
    });

    expect(mockCommsService.getChatHistory).toHaveBeenCalledWith('inc-999', 'GENERAL');
    expect(component.messages.length).toBe(2);
    expect(component.chatError).toBeNull();
  });

  it('debe cambiar entre pestañas GENERAL y PRIVADO', () => {
    expect(component.activeTab).toBe('GENERAL');
    expect(component.roomType).toBe('GENERAL');

    component.switchTab('PRIVADO');
    expect(component.activeTab).toBe('PRIVADO');
    expect(component.roomType).toBe('TACTICAL');
    expect(mockCommsService.getChatHistory).toHaveBeenCalledWith('inc-999', 'TACTICAL');
  });

  it('debe enviar mensaje y reflejar optimismo', async () => {
    component.newMessageText = 'Reporte de refuerzos';
    await component.sendMessage();

    expect(mockCommsService.sendMessage).toHaveBeenCalledWith(
      'inc-999',
      { messageType: 'TEXTO', content: 'Reporte de refuerzos' },
      'GENERAL'
    );
  });

  it('debe mostrar toast y manejar error cuando falla la carga de mensajes', () => {
    mockCommsService.getChatHistory.and.returnValue(throwError(() => new Error('Error de red')));
    component.retryLoad();

    expect(component.loadingChat).toBeFalse();
    expect(component.chatError).toBeTruthy();
  });
});
