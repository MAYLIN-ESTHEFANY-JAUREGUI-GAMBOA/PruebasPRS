package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.mapper;

import pe.edu.vallegrande.caneteseguro.fleet.application.dto.response.MaintenanceOrderDetailResponse;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.response.MaintenanceOrderResponse;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.response.TechnicalDischargeResponse;
import pe.edu.vallegrande.caneteseguro.fleet.application.dto.response.WorkshopDetailResponse;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.MaintenanceOrder;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.TechnicalDischargeReport;
import pe.edu.vallegrande.caneteseguro.fleet.domain.model.WorkshopDetail;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.MaintenanceType;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderPriority;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderStatus;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document.MaintenanceOrderDocument;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document.TechnicalDischargeReportDocument;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document.WorkshopDetailDocument;

/**
 * Bidirectional mapper between Domain Model, Persistence Document and DTOs.
 * HEX-04 & STD-063 compliant: isolates domain models from persistence and REST boundaries.
 */
public final class MaintenanceOrderMapper {

    private MaintenanceOrderMapper() {}

    public static MaintenanceOrder toDomain(MaintenanceOrderDocument document) {
        if (document == null) {
            return null;
        }

        MaintenanceType type = null;
        if (document.getMaintenanceType() != null) {
            String t = document.getMaintenanceType();
            switch (t) {
                case "PREVENTIVE" -> type = MaintenanceType.PREVENTIVO;
                case "CORRECTIVE" -> type = MaintenanceType.CORRECTIVO;
                case "CORRECTIVE_ACCIDENT" -> type = MaintenanceType.CORRECTIVO_ACCIDENTE;
                case "REGULATORY_INSPECTION" -> type = MaintenanceType.INSPECCION_REGLAMENTARIA;
                default -> {
                    try {
                        type = MaintenanceType.valueOf(t);
                    } catch (IllegalArgumentException ignored) {}
                }
            }
        }

        OrderStatus status = null;
        if (document.getOrderStatus() != null) {
            String s = document.getOrderStatus();
            switch (s) {
                case "REGISTERED" -> status = OrderStatus.REGISTRADA;
                case "IN_DIAGNOSIS" -> status = OrderStatus.EN_DIAGNOSTICO;
                case "IN_WORKSHOP" -> status = OrderStatus.EN_TALLER;
                case "QUALITY_CONTROL" -> status = OrderStatus.EN_CONTROL_CALIDAD;
                case "COMPLETED" -> status = OrderStatus.FINALIZADA;
                case "CANCELLED" -> status = OrderStatus.CANCELADA;
                default -> {
                    try {
                        status = OrderStatus.valueOf(s);
                    } catch (IllegalArgumentException ignored) {}
                }
            }
        }

        OrderPriority priority = null;
        if (document.getPriority() != null) {
            String p = document.getPriority();
            switch (p) {
                case "LOW" -> priority = OrderPriority.BAJA;
                case "MEDIUM" -> priority = OrderPriority.MEDIA;
                case "HIGH" -> priority = OrderPriority.ALTA;
                case "CRITICAL" -> priority = OrderPriority.CRITICA;
                default -> {
                    try {
                        priority = OrderPriority.valueOf(p);
                    } catch (IllegalArgumentException ignored) {}
                }
            }
        }

        return MaintenanceOrder.builder()
                .id(document.getId())
                .orderCode(document.getOrderCode())
                .resourceId(document.getResourceId())
                .resourcePlate(document.getResourcePlate())
                .entityId(document.getEntityId())
                .reportedByDni(document.getReportedByDni())
                .incidentId(document.getIncidentId())
                .maintenanceType(type)
                .orderStatus(status)
                .priority(priority)
                .failureReason(document.getFailureReason())
                .reportedMileage(document.getReportedMileage())
                .workshopDetail(mapWorkshopDetailToDomain(document.getWorkshopDetail()))
                .technicalDischargeReport(mapTechnicalDischargeToDomain(document.getTechnicalDischargeReport()))
                .remarks(document.getRemarks())
                .status(document.getStatus() != null ? document.getStatus() : (Boolean.FALSE.equals(document.getActive()) ? "I" : "A"))
                .createdAt(document.getCreatedAt())
                .updatedAt(document.getUpdatedAt())
                .build();
    }

    public static MaintenanceOrderDocument toDocument(MaintenanceOrder model) {
        if (model == null) {
            return null;
        }

        return MaintenanceOrderDocument.builder()
                .id(model.getId())
                .orderCode(model.getOrderCode())
                .resourceId(model.getResourceId())
                .resourcePlate(model.getResourcePlate())
                .entityId(model.getEntityId())
                .reportedByDni(model.getReportedByDni())
                .incidentId(model.getIncidentId())
                .maintenanceType(model.getMaintenanceType() != null ? model.getMaintenanceType().name() : null)
                .orderStatus(model.getOrderStatus() != null ? model.getOrderStatus().name() : null)
                .priority(model.getPriority() != null ? model.getPriority().name() : null)
                .failureReason(model.getFailureReason())
                .reportedMileage(model.getReportedMileage())
                .workshopDetail(mapWorkshopDetailToDocument(model.getWorkshopDetail()))
                .technicalDischargeReport(mapTechnicalDischargeToDocument(model.getTechnicalDischargeReport()))
                .remarks(model.getRemarks())
                .status(model.getStatus())
                .active(!"I".equalsIgnoreCase(model.getStatus()))
                .createdAt(model.getCreatedAt())
                .updatedAt(model.getUpdatedAt())
                .build();
    }

    public static MaintenanceOrderResponse toResponse(MaintenanceOrder model) {
        if (model == null) {
            return null;
        }

        return MaintenanceOrderResponse.builder()
                .id(model.getId())
                .orderCode(model.getOrderCode())
                .resourceId(model.getResourceId())
                .resourcePlate(model.getResourcePlate())
                .entityId(model.getEntityId())
                .reportedByDni(model.getReportedByDni())
                .maintenanceType(model.getMaintenanceType())
                .orderStatus(model.getOrderStatus())
                .priority(model.getPriority())
                .failureReason(model.getFailureReason())
                .reportedMileage(model.getReportedMileage())
                .createdAt(model.getCreatedAt())
                .updatedAt(model.getUpdatedAt())
                .status(model.getStatus())
                .build();
    }

    public static MaintenanceOrderDetailResponse toDetailResponse(MaintenanceOrder model) {
        if (model == null) {
            return null;
        }

        return MaintenanceOrderDetailResponse.builder()
                .id(model.getId())
                .orderCode(model.getOrderCode())
                .resourceId(model.getResourceId())
                .resourcePlate(model.getResourcePlate())
                .entityId(model.getEntityId())
                .reportedByDni(model.getReportedByDni())
                .incidentId(model.getIncidentId())
                .maintenanceType(model.getMaintenanceType())
                .orderStatus(model.getOrderStatus())
                .priority(model.getPriority())
                .failureReason(model.getFailureReason())
                .reportedMileage(model.getReportedMileage())
                .workshopDetail(mapWorkshopDetailToResponse(model.getWorkshopDetail()))
                .technicalDischargeReport(mapTechnicalDischargeToResponse(model.getTechnicalDischargeReport()))
                .remarks(model.getRemarks())
                .status(model.getStatus())
                .createdAt(model.getCreatedAt())
                .updatedAt(model.getUpdatedAt())
                .build();
    }

    private static WorkshopDetail mapWorkshopDetailToDomain(WorkshopDetailDocument doc) {
        if (doc == null) return null;
        return WorkshopDetail.builder()
                .workshopName(doc.getWorkshopName())
                .workshopRuc(doc.getWorkshopRuc())
                .mechanicInCharge(doc.getMechanicInCharge())
                .contactPhone(doc.getContactPhone())
                .workshopAddress(doc.getWorkshopAddress())
                .estimatedCost(doc.getEstimatedCost())
                .finalCost(doc.getFinalCost())
                .estimatedDeliveryDate(doc.getEstimatedDeliveryDate())
                .initialDiagnosis(doc.getInitialDiagnosis())
                .build();
    }

    private static WorkshopDetailDocument mapWorkshopDetailToDocument(WorkshopDetail model) {
        if (model == null) return null;
        return WorkshopDetailDocument.builder()
                .workshopName(model.getWorkshopName())
                .workshopRuc(model.getWorkshopRuc())
                .mechanicInCharge(model.getMechanicInCharge())
                .contactPhone(model.getContactPhone())
                .workshopAddress(model.getWorkshopAddress())
                .estimatedCost(model.getEstimatedCost())
                .finalCost(model.getFinalCost())
                .estimatedDeliveryDate(model.getEstimatedDeliveryDate())
                .initialDiagnosis(model.getInitialDiagnosis())
                .build();
    }

    private static WorkshopDetailResponse mapWorkshopDetailToResponse(WorkshopDetail model) {
        if (model == null) return null;
        return WorkshopDetailResponse.builder()
                .workshopName(model.getWorkshopName())
                .workshopRuc(model.getWorkshopRuc())
                .mechanicInCharge(model.getMechanicInCharge())
                .contactPhone(model.getContactPhone())
                .workshopAddress(model.getWorkshopAddress())
                .estimatedCost(model.getEstimatedCost())
                .finalCost(model.getFinalCost())
                .estimatedDeliveryDate(model.getEstimatedDeliveryDate())
                .initialDiagnosis(model.getInitialDiagnosis())
                .build();
    }

    private static TechnicalDischargeReport mapTechnicalDischargeToDomain(TechnicalDischargeReportDocument doc) {
        if (doc == null) return null;
        return TechnicalDischargeReport.builder()
                .technicalVerdict(doc.getTechnicalVerdict())
                .testsPerformed(doc.getTestsPerformed())
                .exitMileage(doc.getExitMileage())
                .dischargeDate(doc.getDischargeDate())
                .approvedByDni(doc.getApprovedByDni())
                .remarks(doc.getRemarks())
                .mediaUrl(doc.getMediaUrl())
                .build();
    }

    private static TechnicalDischargeReportDocument mapTechnicalDischargeToDocument(TechnicalDischargeReport model) {
        if (model == null) return null;
        return TechnicalDischargeReportDocument.builder()
                .technicalVerdict(model.getTechnicalVerdict())
                .testsPerformed(model.getTestsPerformed())
                .exitMileage(model.getExitMileage())
                .dischargeDate(model.getDischargeDate())
                .approvedByDni(model.getApprovedByDni())
                .remarks(model.getRemarks())
                .mediaUrl(model.getMediaUrl())
                .build();
    }

    private static TechnicalDischargeResponse mapTechnicalDischargeToResponse(TechnicalDischargeReport model) {
        if (model == null) return null;
        return TechnicalDischargeResponse.builder()
                .technicalVerdict(model.getTechnicalVerdict())
                .testsPerformed(model.getTestsPerformed())
                .exitMileage(model.getExitMileage())
                .dischargeDate(model.getDischargeDate())
                .approvedByDni(model.getApprovedByDni())
                .remarks(model.getRemarks())
                .mediaUrl(model.getMediaUrl())
                .build();
    }
}
