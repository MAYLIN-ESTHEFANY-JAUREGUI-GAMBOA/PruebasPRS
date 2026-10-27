import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';

import { AuthService } from '../../../core/auth/auth.service';
import {
  AssignWorkshopRequest,
  CancelOrderRequest,
  CreateMaintenanceOrderRequest,
  MaintenanceOrder,
  MaintenanceOrderDetail,
  MaintenanceType,
  OrderPriority,
  OrderStatus,
  TechnicalDischargeRequest,
  UpdateMaintenanceOrderRequest
} from '../../../core/models/maintenance-order.model';
import { RecursoOperativo } from '../../../core/models/recurso-operativo.model';
import { FlotaExcelService } from '../../../core/reports/flota/flota-excel';
import { FlotaPdfService } from '../../../core/reports/flota/flota-pdf';
import { FlotaReporteFila, FlotaReporteFiltros } from '../../../core/reports/flota/flota-reporte';
import { MaintenanceOrderService } from '../../../core/services/maintenance-order.service';
import { RecursoOperativoService } from '../../../core/services/recurso-operativo';
import { CivicToastService } from '../../../shared/services/civic-toast.service';

@Component({
  selector: 'app-flota-mantenimiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './flota-mantenimiento.html',
  styleUrl: './flota-mantenimiento.css'
})
export class FlotaMantenimientoComponent implements OnInit {

  private readonly maintenanceService = inject(MaintenanceOrderService);
  private readonly recursoService = inject(RecursoOperativoService);
  private readonly toast = inject(CivicToastService);
  private readonly flotaPdf = inject(FlotaPdfService);
  private readonly flotaExcel = inject(FlotaExcelService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly authService = inject(AuthService);

  // Estados reactivos con Signals
  readonly orders = signal<MaintenanceOrder[]>([]);
  readonly resources = signal<RecursoOperativo[]>([]);
  readonly loading = signal<boolean>(false);
  readonly submitting = signal<boolean>(false);

  // Filtros y búsqueda
  readonly searchQuery = signal<string>('');
  readonly statusFilter = signal<string>('TODOS');
  readonly priorityFilter = signal<string>('TODAS');

  // Modales
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isEditModalOpen = signal<boolean>(false);
  readonly isAssignModalOpen = signal<boolean>(false);
  readonly isDischargeModalOpen = signal<boolean>(false);
  readonly isCancelModalOpen = signal<boolean>(false);
  readonly isDetailModalOpen = signal<boolean>(false);

  // Banderas de intento de envío para validación visual de formularios
  readonly hasCreateFormSubmitted = signal<boolean>(false);
  readonly hasAssignFormSubmitted = signal<boolean>(false);
  readonly hasDischargeFormSubmitted = signal<boolean>(false);
  readonly hasCancelFormSubmitted = signal<boolean>(false);
  readonly hasEditFormSubmitted = signal<boolean>(false);

  // Ficha de detalle activa
  readonly selectedOrderDetail = signal<MaintenanceOrderDetail | null>(null);
  readonly loadingDetail = signal<boolean>(false);

  // Formulario: Crear Orden
  createForm: CreateMaintenanceOrderRequest = this.emptyCreateForm();

  // Formulario: Editar Orden
  editForm: UpdateMaintenanceOrderRequest = this.emptyEditForm();
  currentOrderIdForEdit = signal<string>('');
  currentOrderCodeForEdit = signal<string>('');
  currentOrderPlateForEdit = signal<string>('');
  currentOrderStatusForEdit = signal<string>('');
  hasWorkshopAssigned = signal<boolean>(false);
  readonly isRegisteredStage = signal<boolean>(true);

  // Reportes y Permisos
  readonly isGeneratingReport = signal<boolean>(false);
  readonly canExport = computed(() => {
    return this.authService.isAdmin() ||
           this.authService.isMunicipalidadAdmin() ||
           this.authService.isEntidadAdmin() ||
           this.authService.hasRole('ANALISTA');
  });

  // Formulario: Asignar Taller
  assignForm: AssignWorkshopRequest = this.emptyAssignForm();
  currentOrderIdForAssign = signal<string>('');
  currentOrderCodeForAssign = signal<string>('');

  // Formulario: Alta Técnica
  dischargeForm: TechnicalDischargeRequest = this.emptyDischargeForm();
  currentOrderIdForDischarge = signal<string>('');
  currentOrderCodeForDischarge = signal<string>('');

  // Formulario: Cancelar Orden
  cancelForm: CancelOrderRequest = { reason: '' };
  currentOrderIdForCancel = signal<string>('');
  currentOrderCodeForCancel = signal<string>('');

  // KPIs computados
  readonly kpis = computed(() => {
    const list = this.orders();
    return {
      total: list.length,
      inDiagnosis: list.filter(o => o.orderStatus === 'EN_DIAGNOSTICO' || o.orderStatus === 'IN_DIAGNOSIS').length,
      inWorkshop: list.filter(o => o.orderStatus === 'EN_TALLER' || o.orderStatus === 'IN_WORKSHOP').length,
      qualityControl: list.filter(o => o.orderStatus === 'EN_CONTROL_CALIDAD' || o.orderStatus === 'QUALITY_CONTROL').length,
      completed: list.filter(o => o.orderStatus === 'FINALIZADA' || o.orderStatus === 'COMPLETED').length,
      activeIssues: list.filter(o => o.orderStatus !== 'FINALIZADA' && o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELADA' && o.orderStatus !== 'CANCELLED').length
    };
  });

  // Lista filtrada computada en tiempo real
  readonly filteredOrders = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const priority = this.priorityFilter();

    return this.orders().filter(order => {
      const matchSearch =
        !query ||
        order.orderCode?.toLowerCase().includes(query) ||
        order.resourcePlate?.toLowerCase().includes(query) ||
        order.failureReason?.toLowerCase().includes(query) ||
        order.reportedByDni?.toLowerCase().includes(query);

      const matchStatus =
        status === 'TODOS' ||
        order.orderStatus === status ||
        (status === 'REGISTRADA' && order.orderStatus === 'REGISTERED') ||
        (status === 'EN_DIAGNOSTICO' && order.orderStatus === 'IN_DIAGNOSIS') ||
        (status === 'EN_TALLER' && order.orderStatus === 'IN_WORKSHOP') ||
        (status === 'EN_CONTROL_CALIDAD' && order.orderStatus === 'QUALITY_CONTROL') ||
        (status === 'FINALIZADA' && order.orderStatus === 'COMPLETED') ||
        (status === 'CANCELADA' && order.orderStatus === 'CANCELLED');

      const matchPriority = priority === 'TODAS' || order.priority === priority;

      return matchSearch && matchStatus && matchPriority;
    });
  });

  // Recursos disponibles para abrir orden de mantenimiento (excluye los que ya tienen orden activa)
  readonly availableResourcesForMaintenance = computed(() => {
    const activeResourceIds = new Set(
      this.orders()
        .filter(o => o.orderStatus !== 'FINALIZADA' && o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELADA' && o.orderStatus !== 'CANCELLED')
        .map(o => o.resourceId)
    );
    return this.resources().filter(r => !activeResourceIds.has(r.id ?? ''));
  });

  ngOnInit(): void {
    this.loadOrders();
    this.loadResources();
  }

  loadOrders(): void {
    this.loading.set(true);
    this.maintenanceService.getAll().subscribe({
      next: (data) => {
        this.orders.set(data ?? []);
        this.loading.set(false);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.toast.error('No se pudieron cargar las órdenes de mantenimiento.');
        console.error('Error loading maintenance orders:', err);
      }
    });
  }

  loadResources(): void {
    this.recursoService.listar().subscribe({
      next: (data) => {
        this.resources.set(data ?? []);
      },
      error: (err: any) => {
        console.warn('Could not preload operational resources:', err);
        this.toast.error('No se pudieron precargar los recursos vehiculares.');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL CREAR ORDEN
  // ═══════════════════════════════════════════════════════════════════════════

  openCreateModal(): void {
    this.hasCreateFormSubmitted.set(false);
    this.createForm = this.emptyCreateForm();
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  onResourceChange(resourceId: string): void {
    const found = this.resources().find(r => r.id === resourceId);
    if (found) {
      this.createForm.resourcePlate = found.internalCode || found.identificador;
      const eid = found.entityId || found.entidadId || (found as any).entidad_id || (found as any).entidadActualId;
      if (eid) {
        this.createForm.entityId = String(eid);
      }
    }
  }

  submitCreate(): void {
    this.hasCreateFormSubmitted.set(true);

    if (!this.createForm.resourceId) {
      this.toast.error('Debe seleccionar un recurso vehicular institucional.');
      return;
    }
    if (this.isFailureReasonInvalid(this.createForm.failureReason)) {
      this.toast.error('El motivo de avería debe tener entre 5 y 500 caracteres.');
      return;
    }
    if (this.isMileageInvalid(this.createForm.reportedMileage)) {
      this.toast.error('El kilometraje odómetro no puede ser un valor negativo.');
      return;
    }

    this.submitting.set(true);
    this.maintenanceService.create(this.createForm).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.closeCreateModal();
        this.toast.success(`Orden ${created.orderCode} registrada exitosamente.`);
        this.loadOrders();
        this.loadResources();
      },
      error: (err: any) => {
        this.submitting.set(false);
        const errorMsg = err?.error?.message || 'Error al registrar orden de mantenimiento.';
        this.toast.error(errorMsg);
        Swal.fire({
          icon: 'error',
          title: 'Error de Dominio',
          text: errorMsg,
          confirmButtonColor: '#ea580c'
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL EDITAR DETALLES DE ORDEN ACTIVA
  // ═══════════════════════════════════════════════════════════════════════════

  openEditModal(order: MaintenanceOrder): void {
    if (order.orderStatus === 'FINALIZADA' || order.orderStatus === 'COMPLETED' ||
        order.orderStatus === 'CANCELADA' || order.orderStatus === 'CANCELLED') {
      this.toast.info('No se pueden editar los datos de una orden completada o cancelada.');
      return;
    }

    this.currentOrderIdForEdit.set(order.id);
    this.currentOrderCodeForEdit.set(order.orderCode);
    this.currentOrderPlateForEdit.set(order.resourcePlate || '');
    this.currentOrderStatusForEdit.set(this.getStatusLabel(order.orderStatus));

    const isRegistered = order.orderStatus === 'REGISTRADA' || order.orderStatus === 'REGISTERED';
    this.isRegisteredStage.set(isRegistered);
    this.hasWorkshopAssigned.set(!isRegistered);

    // Precarga síncrona inmediata con los datos que ya vienen en el listado para no tener retrasos en la vista
    const existingWorkshop = (order as any).workshopDetail;
    this.editForm = {
      failureReason: order.failureReason || '',
      reportedMileage: order.reportedMileage ?? 0,
      priority: (order.priority as OrderPriority) || 'MEDIA',
      incidentId: (order as any).incidentId || '',
      remarks: (order as any).remarks || '',
      workshopDetail: existingWorkshop ? {
        workshopName: existingWorkshop.workshopName || '',
        workshopRuc: existingWorkshop.workshopRuc || '',
        mechanicInCharge: existingWorkshop.mechanicInCharge || '',
        contactPhone: existingWorkshop.contactPhone || '',
        workshopAddress: existingWorkshop.workshopAddress || '',
        estimatedCost: existingWorkshop.estimatedCost || 0,
        estimatedDeliveryDate: existingWorkshop.estimatedDeliveryDate || '',
        initialDiagnosis: existingWorkshop.initialDiagnosis || ''
      } : this.emptyAssignForm()
    };

    this.hasEditFormSubmitted.set(false);
    this.isEditModalOpen.set(true);

    // Cargar detalles completos del backend por si hay datos adicionales en BD
    this.maintenanceService.getById(order.id).subscribe({
      next: (detail) => {
        if (this.currentOrderIdForEdit() === order.id && detail) {
          if (detail.remarks) this.editForm.remarks = detail.remarks;
          if (detail.incidentId) this.editForm.incidentId = detail.incidentId;
          if (detail.failureReason) this.editForm.failureReason = detail.failureReason;
          if (detail.reportedMileage !== undefined && detail.reportedMileage !== null) {
            this.editForm.reportedMileage = detail.reportedMileage;
          }
          if (detail.priority) {
            this.editForm.priority = detail.priority as OrderPriority;
          }
          if (detail.workshopDetail) {
            this.hasWorkshopAssigned.set(true);
            this.editForm.workshopDetail = {
              workshopName: detail.workshopDetail.workshopName || '',
              workshopRuc: detail.workshopDetail.workshopRuc || '',
              mechanicInCharge: detail.workshopDetail.mechanicInCharge || '',
              contactPhone: detail.workshopDetail.contactPhone || '',
              workshopAddress: detail.workshopDetail.workshopAddress || '',
              estimatedCost: detail.workshopDetail.estimatedCost || 0,
              estimatedDeliveryDate: detail.workshopDetail.estimatedDeliveryDate || '',
              initialDiagnosis: detail.workshopDetail.initialDiagnosis || ''
            };
          }
          this.cdr.markForCheck();
        }
      },
      error: (err: any) => {
        console.warn('Could not load detailed order info for edit:', err);
        this.toast.error('No se pudo sincronizar el detalle completo de la orden.');
      }
    });
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
  }

  submitEdit(): void {
    this.hasEditFormSubmitted.set(true);
    const id = this.currentOrderIdForEdit();
    const isRegistered = this.isRegisteredStage();

    const payload: UpdateMaintenanceOrderRequest = {
      remarks: this.editForm.remarks
    };

    if (isRegistered) {
      if (this.isFailureReasonInvalid(this.editForm.failureReason)) {
        this.toast.error('La descripción o motivo de avería debe tener entre 5 y 500 caracteres.');
        return;
      }
      if (this.isMileageInvalid(this.editForm.reportedMileage)) {
        this.toast.error('El kilometraje al reporte no puede ser un valor negativo.');
        return;
      }
      payload.failureReason = this.editForm.failureReason;
      payload.reportedMileage = this.editForm.reportedMileage;
      payload.priority = this.editForm.priority;
      payload.incidentId = this.editForm.incidentId;
    } else {
      // En etapas de taller o diagnóstico, los datos iniciales de avería quedan congelados
      // Validamos y actualizamos exclusivamente la información del taller y diagnóstico
      if (this.isWorkshopNameInvalid(this.editForm.workshopDetail?.workshopName)) {
        this.toast.error('El nombre del taller mecánico es obligatorio (mínimo 3 caracteres).');
        return;
      }
      if (this.editForm.workshopDetail?.workshopRuc && this.isRucInvalid(this.editForm.workshopDetail.workshopRuc)) {
        this.toast.error('El RUC del taller debe tener exactamente 11 dígitos numéricos.');
        return;
      }
      if (this.editForm.workshopDetail?.contactPhone && this.isPhoneInvalid(this.editForm.workshopDetail.contactPhone)) {
        this.toast.error('El teléfono de contacto debe tener 9 dígitos numéricos.');
        return;
      }
      if (this.isCostInvalid(this.editForm.workshopDetail?.estimatedCost)) {
        this.toast.error('El presupuesto estimado no puede ser un valor negativo.');
        return;
      }
      payload.failureReason = this.editForm.failureReason?.trim() || 'Requerimiento de mantenimiento operativo';
      payload.reportedMileage = this.editForm.reportedMileage;
      payload.priority = this.editForm.priority;
      payload.incidentId = this.editForm.incidentId;

      const ws = this.editForm.workshopDetail;
      payload.workshopDetail = {
        workshopName: ws?.workshopName?.trim() || '',
        workshopRuc: ws?.workshopRuc?.trim() || '',
        mechanicInCharge: ws?.mechanicInCharge?.trim() || '',
        contactPhone: ws?.contactPhone?.trim() || '',
        workshopAddress: ws?.workshopAddress?.trim() || '',
        estimatedCost: ws?.estimatedCost ?? 0,
        estimatedDeliveryDate: ws?.estimatedDeliveryDate || '',
        initialDiagnosis: ws?.initialDiagnosis?.trim() || ''
      };
    }

    this.submitting.set(true);
    this.maintenanceService.update(id, payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.closeEditModal();
        this.toast.success(`Orden ${res.orderCode} actualizada correctamente.`);
        this.loadOrders();
      },
      error: (err: any) => {
        this.submitting.set(false);
        let errorMsg = err?.error?.message || 'Error al actualizar los datos de la orden.';
        if (err?.error?.errors && typeof err.error.errors === 'object') {
          const detailList = Object.values(err.error.errors).join(', ');
          if (detailList) errorMsg += `: ${detailList}`;
        }
        this.toast.error(errorMsg);
        Swal.fire({
          icon: 'error',
          title: 'Error al Modificar',
          text: errorMsg,
          confirmButtonColor: '#ea580c'
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTES OFICIALES (PDF / EXCEL - ESTÁNDAR AS241S6)
  // ═══════════════════════════════════════════════════════════════════════════

  async downloadPdf(): Promise<void> {
    await this.exportReport(() => this.flotaPdf.generarPdf(this.buildReportRows(), this.buildReportFilters()), 'PDF');
  }

  async downloadExcel(): Promise<void> {
    await this.exportReport(() => this.flotaExcel.generarExcel(this.buildReportRows(), this.buildReportFilters()), 'Excel');
  }

  private async exportReport(generator: () => Promise<void>, format: string): Promise<void> {
    if (this.isGeneratingReport() || !this.filteredOrders().length) {
      this.toast.info('No hay registros de órdenes para exportar con los filtros actuales.');
      return;
    }
    this.isGeneratingReport.set(true);
    try {
      await generator();
      this.toast.success(`Reporte ${format} generado exitosamente.`);
    } catch (err) {
      console.error(`Error generating ${format} report:`, err);
      this.toast.error(`No se pudo generar el reporte ${format}.`);
    } finally {
      this.isGeneratingReport.set(false);
    }
  }

  private buildReportRows(): FlotaReporteFila[] {
    return this.filteredOrders().map(o => ({
      orderCode: o.orderCode || '—',
      resourcePlate: o.resourcePlate || '—',
      maintenanceType: this.getMaintenanceTypeLabel(o.maintenanceType),
      priority: this.getPriorityLabel(o.priority),
      orderStatus: this.getStatusLabel(o.orderStatus),
      failureReason: o.failureReason || '—',
      reportedMileage: o.reportedMileage !== null && o.reportedMileage !== undefined ? o.reportedMileage : '—',
      workshopName: (o as any).workshopDetail?.workshopName || '—',
      mechanicInCharge: (o as any).workshopDetail?.mechanicInCharge || '—',
      estimatedCost: (o as any).workshopDetail?.estimatedCost || 0,
      finalCost: (o as any).workshopDetail?.finalCost || 0,
      createdAt: this.formatDate(o.createdAt)
    }));
  }

  private buildReportFilters(): FlotaReporteFiltros {
    return {
      estado: this.statusFilter() === 'TODOS' ? 'Todos' : this.getStatusLabel(this.statusFilter()),
      prioridad: this.priorityFilter() === 'TODAS' ? 'Todas' : this.getPriorityLabel(this.priorityFilter()),
      busqueda: this.searchQuery().trim()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL ASIGNAR TALLER (REGISTERED -> IN_DIAGNOSIS)
  // ═══════════════════════════════════════════════════════════════════════════

  openAssignModal(order: MaintenanceOrder): void {
    this.hasAssignFormSubmitted.set(false);
    this.currentOrderIdForAssign.set(order.id);
    this.currentOrderCodeForAssign.set(order.orderCode);
    this.assignForm = this.emptyAssignForm();
    this.isAssignModalOpen.set(true);
  }

  closeAssignModal(): void {
    this.isAssignModalOpen.set(false);
  }

  submitAssignWorkshop(): void {
    this.hasAssignFormSubmitted.set(true);
    const id = this.currentOrderIdForAssign();
    if (this.isWorkshopNameInvalid(this.assignForm.workshopName)) {
      this.toast.error('El nombre del taller es obligatorio (mínimo 3 caracteres).');
      return;
    }
    if (this.assignForm.workshopRuc && this.isRucInvalid(this.assignForm.workshopRuc)) {
      this.toast.error('El RUC del taller debe tener exactamente 11 dígitos numéricos.');
      return;
    }
    if (this.assignForm.contactPhone && this.isPhoneInvalid(this.assignForm.contactPhone)) {
      this.toast.error('El teléfono de contacto debe tener 9 dígitos numéricos.');
      return;
    }
    if (this.isCostInvalid(this.assignForm.estimatedCost)) {
      this.toast.error('El presupuesto estimado no puede ser un valor negativo.');
      return;
    }

    this.submitting.set(true);
    this.maintenanceService.assignWorkshop(id, this.assignForm).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.closeAssignModal();
        this.toast.success(`Taller asignado a la orden ${res.orderCode}. Estado: En Diagnóstico.`);
        this.loadOrders();
      },
      error: (err: any) => {
        this.submitting.set(false);
        const errorMsg = err?.error?.message || 'Error al asignar taller mecánico.';
        this.toast.error(errorMsg);
        Swal.fire({
          icon: 'error',
          title: 'Error de Transición',
          text: errorMsg,
          confirmButtonColor: '#ea580c'
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSICIONES RÁPIDAS: INICIAR REPARACIÓN Y CONTROL DE CALIDAD
  // ═══════════════════════════════════════════════════════════════════════════

  startRepair(order: MaintenanceOrder): void {
    Swal.fire({
      title: '¿Iniciar Reparación?',
      html: `¿Confirmas el inicio de los trabajos en taller para la orden <b>${order.orderCode}</b> (Vehículo: <b>${order.resourcePlate}</b>)?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, iniciar trabajos',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.maintenanceService.startRepair(order.id).subscribe({
          next: (res) => {
            this.toast.success(`Orden ${res.orderCode} en reparación (IN_WORKSHOP).`);
            this.loadOrders();
          },
          error: (err: any) => {
            const errorMsg = err?.error?.message || 'No se pudo iniciar la reparación.';
            this.toast.error(errorMsg);
            Swal.fire({ icon: 'error', title: 'Error', text: errorMsg });
          }
        });
      }
    });
  }

  passToQualityControl(order: MaintenanceOrder): void {
    Swal.fire({
      title: '¿Enviar a Control de Calidad?',
      html: `¿Los trabajos mecánicos concluyeron y el vehículo <b>${order.resourcePlate}</b> pasará a pruebas y control de calidad?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#7c3aed',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, pasar a control',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.maintenanceService.passToQualityControl(order.id).subscribe({
          next: (res) => {
            this.toast.success(`Orden ${res.orderCode} en Control de Calidad.`);
            this.loadOrders();
          },
          error: (err: any) => {
            const errorMsg = err?.error?.message || 'No se pudo pasar a control de calidad.';
            this.toast.error(errorMsg);
            Swal.fire({ icon: 'error', title: 'Error', text: errorMsg });
          }
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL ALTA TÉCNICA (QUALITY_CONTROL -> COMPLETED)
  // ═══════════════════════════════════════════════════════════════════════════

  openDischargeModal(order: MaintenanceOrder): void {
    this.hasDischargeFormSubmitted.set(false);
    this.currentOrderIdForDischarge.set(order.id);
    this.currentOrderCodeForDischarge.set(order.orderCode);
    this.dischargeForm = {
      technicalVerdict: '',
      testsPerformed: '',
      exitMileage: order.reportedMileage ? order.reportedMileage + 10 : 0,
      finalCost: 0,
      remarks: '',
      mediaUrl: ''
    };
    this.isDischargeModalOpen.set(true);
  }

  closeDischargeModal(): void {
    this.isDischargeModalOpen.set(false);
  }

  submitTechnicalDischarge(): void {
    this.hasDischargeFormSubmitted.set(true);
    const id = this.currentOrderIdForDischarge();
    if (this.isTechnicalVerdictInvalid(this.dischargeForm.technicalVerdict)) {
      this.toast.error('El dictamen técnico de conformidad es obligatorio (mínimo 5 caracteres).');
      return;
    }
    if (this.dischargeForm.exitMileage === null || this.dischargeForm.exitMileage === undefined || this.dischargeForm.exitMileage < 0) {
      this.toast.error('El kilometraje de salida debe ser un número válido mayor o igual a 0.');
      return;
    }
    if (this.isCostInvalid(this.dischargeForm.finalCost)) {
      this.toast.error('El costo final facturado no puede ser un valor negativo.');
      return;
    }
    if (this.isUrlInvalid(this.dischargeForm.mediaUrl)) {
      this.toast.error('La URL del acta de entrega o factura debe ser válida (debe iniciar con http:// o https://).');
      return;
    }

    this.submitting.set(true);
    this.maintenanceService.issueTechnicalDischarge(id, this.dischargeForm).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.closeDischargeModal();
        this.toast.success(`Alta técnica emitida para orden ${res.orderCode}. Vehículo ${res.resourcePlate} disponible.`);
        Swal.fire({
          icon: 'success',
          title: '¡Alta Técnica Emitida!',
          html: `La orden <b>${res.orderCode}</b> ha sido completada exitosamente.<br>El vehículo <b>${res.resourcePlate}</b> vuelve a estar <b>DISPONIBLE</b> para el servicio.`,
          confirmButtonColor: '#16a34a'
        });
        this.loadOrders();
        this.loadResources();
      },
      error: (err: any) => {
        this.submitting.set(false);
        const errorMsg = err?.error?.message || 'Error al emitir el alta técnica.';
        this.toast.error(errorMsg);
        Swal.fire({ icon: 'error', title: 'Error', text: errorMsg, confirmButtonColor: '#ea580c' });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL CANCELAR ORDEN
  // ═══════════════════════════════════════════════════════════════════════════

  openCancelModal(order: MaintenanceOrder): void {
    this.hasCancelFormSubmitted.set(false);
    this.currentOrderIdForCancel.set(order.id);
    this.currentOrderCodeForCancel.set(order.orderCode);
    this.cancelForm = { reason: '' };
    this.isCancelModalOpen.set(true);
  }

  closeCancelModal(): void {
    this.isCancelModalOpen.set(false);
  }

  submitCancel(): void {
    this.hasCancelFormSubmitted.set(true);
    const id = this.currentOrderIdForCancel();
    if (this.isCancelReasonInvalid(this.cancelForm.reason)) {
      this.toast.error('El motivo de cancelación debe tener al menos 5 caracteres.');
      return;
    }

    this.submitting.set(true);
    this.maintenanceService.cancel(id, this.cancelForm).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.closeCancelModal();
        this.toast.info(`Orden ${res.orderCode} cancelada. El vehículo fue devuelto a DISPONIBLE.`);
        this.loadOrders();
        this.loadResources();
      },
      error: (err: any) => {
        this.submitting.set(false);
        const errorMsg = err?.error?.message || 'Error al cancelar la orden.';
        this.toast.error(errorMsg);
        Swal.fire({ icon: 'error', title: 'Error', text: errorMsg });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL DETALLE / TIMELINE COMPLETO
  // ═══════════════════════════════════════════════════════════════════════════

  viewDetail(order: MaintenanceOrder): void {
    this.loadingDetail.set(true);
    this.selectedOrderDetail.set(null);
    this.isDetailModalOpen.set(true);

    this.maintenanceService.getById(order.id).subscribe({
      next: (detail) => {
        this.selectedOrderDetail.set(detail);
        this.loadingDetail.set(false);
      },
      error: (err: any) => {
        this.loadingDetail.set(false);
        this.closeDetailModal();
        this.toast.error('No se pudo cargar el detalle de la orden.');
      }
    });
  }

  closeDetailModal(): void {
    this.isDetailModalOpen.set(false);
    this.selectedOrderDetail.set(null);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS VISUALES Y ETIQUETAS
  // ═══════════════════════════════════════════════════════════════════════════

  getStatusLabel(status: OrderStatus | string): string {
    switch (status) {
      case 'REGISTRADA':
      case 'REGISTERED': return 'Registrada';
      case 'EN_DIAGNOSTICO':
      case 'IN_DIAGNOSIS': return 'En Diagnóstico';
      case 'EN_TALLER':
      case 'IN_WORKSHOP': return 'En Taller';
      case 'EN_CONTROL_CALIDAD':
      case 'QUALITY_CONTROL': return 'Control Calidad';
      case 'FINALIZADA':
      case 'COMPLETED': return 'Completada / Alta';
      case 'CANCELADA':
      case 'CANCELLED': return 'Cancelada';
      default: return status || 'Desconocido';
    }
  }

  getStatusBadgeClass(status: OrderStatus | string): string {
    switch (status) {
      case 'REGISTRADA':
      case 'REGISTERED': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'EN_DIAGNOSTICO':
      case 'IN_DIAGNOSIS': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'EN_TALLER':
      case 'IN_WORKSHOP': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'EN_CONTROL_CALIDAD':
      case 'QUALITY_CONTROL': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'FINALIZADA':
      case 'COMPLETED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'CANCELADA':
      case 'CANCELLED': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  }

  getPriorityLabel(priority?: OrderPriority | string | null): string {
    switch (priority) {
      case 'BAJA':
      case 'LOW': return 'Baja';
      case 'MEDIA':
      case 'MEDIUM': return 'Media';
      case 'ALTA':
      case 'HIGH': return 'Alta';
      case 'CRITICA':
      case 'CRITICAL': return 'Crítica';
      default: return priority || 'Normal';
    }
  }

  getPriorityBadgeClass(priority?: OrderPriority | string | null): string {
    switch (priority) {
      case 'CRITICA':
      case 'CRITICAL': return 'bg-red-500 text-white animate-pulse font-bold';
      case 'ALTA':
      case 'HIGH': return 'bg-orange-500 text-white font-semibold';
      case 'MEDIA':
      case 'MEDIUM': return 'bg-sky-500 text-white';
      case 'BAJA':
      case 'LOW': return 'bg-slate-400 text-white';
      default: return 'bg-slate-200 text-slate-700';
    }
  }

  getMaintenanceTypeLabel(type: MaintenanceType | string): string {
    switch (type) {
      case 'PREVENTIVO':
      case 'PREVENTIVE': return 'Preventivo';
      case 'CORRECTIVO':
      case 'CORRECTIVE': return 'Correctivo';
      case 'CORRECTIVO_ACCIDENTE':
      case 'CORRECTIVE_ACCIDENT': return 'Por Siniestro / Accidente';
      case 'INSPECCION_REGLAMENTARIA':
      case 'REGULATORY_INSPECTION': return 'Revisión Técnica';
      default: return type || 'Mantenimiento';
    }
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  isRucInvalid(ruc?: string | null): boolean {
    if (!ruc || !ruc.trim()) return false;
    return !/^[0-9]{11}$/.test(ruc.trim());
  }

  isPhoneInvalid(phone?: string | null): boolean {
    if (!phone || !phone.trim()) return false;
    return !/^[0-9]{9}$/.test(phone.trim());
  }

  isFailureReasonInvalid(reason?: string | null): boolean {
    if (!reason) return true;
    const trimmed = reason.trim();
    return trimmed.length < 5 || trimmed.length > 500;
  }

  isMileageInvalid(mileage?: number | null): boolean {
    if (mileage === null || mileage === undefined) return false;
    return Number(mileage) < 0;
  }

  isCostInvalid(cost?: number | null): boolean {
    if (cost === null || cost === undefined) return false;
    return Number(cost) < 0;
  }

  isWorkshopNameInvalid(name?: string | null): boolean {
    if (!name) return true;
    return name.trim().length < 3;
  }

  isTechnicalVerdictInvalid(verdict?: string | null): boolean {
    if (!verdict) return true;
    return verdict.trim().length < 5;
  }

  isCancelReasonInvalid(reason?: string | null): boolean {
    if (!reason) return true;
    return reason.trim().length < 5;
  }

  isUrlInvalid(url?: string | null): boolean {
    if (!url || !url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol !== 'http:' && parsed.protocol !== 'https:';
    } catch {
      return true;
    }
  }

  private emptyCreateForm(): CreateMaintenanceOrderRequest {
    return {
      resourceId: '',
      resourcePlate: '',
      maintenanceType: 'CORRECTIVO',
      priority: 'MEDIA',
      failureReason: '',
      reportedMileage: 0,
      incidentId: '',
      remarks: ''
    };
  }

  private emptyAssignForm(): AssignWorkshopRequest {
    return {
      workshopName: '',
      workshopRuc: '',
      mechanicInCharge: '',
      contactPhone: '',
      workshopAddress: '',
      estimatedCost: 0,
      estimatedDeliveryDate: '',
      initialDiagnosis: ''
    };
  }

  private emptyDischargeForm(): TechnicalDischargeRequest {
    return {
      technicalVerdict: '',
      testsPerformed: '',
      exitMileage: 0,
      finalCost: 0,
      remarks: '',
      mediaUrl: ''
    };
  }

  private emptyEditForm(): UpdateMaintenanceOrderRequest {
    return {
      failureReason: '',
      reportedMileage: 0,
      priority: 'MEDIA',
      incidentId: '',
      remarks: '',
      workshopDetail: this.emptyAssignForm()
    };
  }
}

export { FlotaMantenimientoComponent as FlotaMantenimiento };
