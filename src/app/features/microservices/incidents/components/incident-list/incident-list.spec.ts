import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IncidentListComponent } from './incident-list';
import { IncidentWithEntities } from '../../../../../core/models/incident';

describe('IncidentListComponent', () => {
  let component: IncidentListComponent;
  let fixture: ComponentFixture<IncidentListComponent>;

  const mockIncidents: IncidentWithEntities[] = [
    {
      id: 'inc-1',
      trackingCode: 'INC-2026-001',
      emergencyType: 'INCENDIO',
      severityLevel: 'ALTA',
      currentStatus: 'EN_EVALUACION',
      assignedOperator: null,
      responsibleEntitiesIds: ['ENT_1'],
      location: { lat: -13.08, lng: -76.37 }
    } as any,
    {
      id: 'inc-2',
      trackingCode: 'INC-2026-002',
      emergencyType: 'SALUD',
      severityLevel: 'MEDIA',
      currentStatus: 'EN_ATENCION',
      assignedOperator: { id: 'OP_1', fullName: 'Carlos Operador' },
      responsibleEntitiesIds: ['ENT_1'],
      location: { lat: -13.09, lng: -76.38 }
    } as any,
    {
      id: 'inc-3',
      trackingCode: 'INC-2026-003',
      emergencyType: 'SEGURIDAD',
      severityLevel: 'BAJA',
      currentStatus: 'RESUELTO',
      assignedOperator: { id: 'OP_1', fullName: 'Carlos Operador' },
      responsibleEntitiesIds: ['ENT_1'],
      location: { lat: -13.10, lng: -76.39 }
    } as any
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentListComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('incidentes', mockIncidents);
    fixture.componentRef.setInput('operadorId', 'OP_1');
    fixture.componentRef.setInput('esAdmin', false);
    fixture.detectChanges();
  });

  it('debe crearse correctamente', () => {
    expect(component).toBeTruthy();
  });

  it('debe calcular correctamente los conteos por estado y operador', () => {
    component.ngOnChanges({
      incidents: {
        currentValue: mockIncidents,
        previousValue: [],
        firstChange: true,
        isFirstChange: () => true
      }
    });

    expect(component.incidentes.length).toBe(3);
    expect(component.conteoPendientes).toBe(1);
    expect(component.conteoMisIncidentes).toBe(1);
    expect(component.conteoHistorial).toBe(1);
  });

  it('debe cambiar de pestaña y filtrar la lista adecuadamente', () => {
    component.ngOnChanges({
      incidents: {
        currentValue: mockIncidents,
        previousValue: [],
        firstChange: true,
        isFirstChange: () => true
      }
    });

    component.cambiarPestana('PENDIENTES');
    expect(component.incidentesFiltrados.length).toBe(1);
    expect(component.incidentesFiltrados[0].trackingCode).toBe('INC-2026-001');

    component.cambiarPestana('MIS_INCIDENTES');
    expect(component.incidentesFiltrados.length).toBe(1);
    expect(component.incidentesFiltrados[0].trackingCode).toBe('INC-2026-002');

    component.cambiarPestana('HISTORIAL');
    expect(component.incidentesFiltrados.length).toBe(1);
    expect(component.incidentesFiltrados[0].trackingCode).toBe('INC-2026-003');
  });

  it('debe emitir el evento detailSelected al seleccionar un incidente', () => {
    spyOn(component.detailSelected, 'emit');
    component.abrirDetalle(mockIncidents[0]);
    expect(component.detailSelected.emit).toHaveBeenCalledWith(mockIncidents[0]);
  });
});
