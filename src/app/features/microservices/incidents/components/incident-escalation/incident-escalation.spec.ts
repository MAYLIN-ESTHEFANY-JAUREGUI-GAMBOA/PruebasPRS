import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { IncidentEscalationComponent } from './incident-escalation';
import { IncidentService } from '../../../../../core/services/incident';
import { AuthService } from '../../../../../core/auth/auth.service';
import { EntidadService } from '../../../../../core/services/entidad';

describe('IncidentEscalationComponent', () => {
  let component: IncidentEscalationComponent;
  let fixture: ComponentFixture<IncidentEscalationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentEscalationComponent],
      providers: [
        provideHttpClient(),
        {
          provide: IncidentService,
          useValue: {
            escalarIncidente: () => of({}),
            obtenerIncidentePorId: () => of({})
          }
        },
        {
          provide: AuthService,
          useValue: {
            obtenerSesion: () => null,
            tieneRol: () => true,
            getEntidadId: () => 'ENT_01',
            getUserId: () => 'USR_01'
          }
        },
        {
          provide: EntidadService,
          useValue: {
            listar: () => of([])
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentEscalationComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('incidente', {
      id: 'test-123',
      trackingCode: 'INC-001',
      emergencyType: 'ACCIDENTE_TRANSITO',
      currentStatus: 'EN_ATENCION',
      escalationHistory: []
    });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
