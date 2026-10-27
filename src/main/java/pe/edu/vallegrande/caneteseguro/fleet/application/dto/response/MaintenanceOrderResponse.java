package pe.edu.vallegrande.caneteseguro.fleet.application.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.MaintenanceType;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderPriority;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderStatus;

import java.time.LocalDateTime;

/**
 * Summary Response DTO for maintenance orders list and tables.
 * 100% in English with dual property visibility for full backwards compatibility.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Resumen de orden de mantenimiento vehicular")
public class MaintenanceOrderResponse {

    @Schema(description = "ID único de la orden", example = "64a4eb5a0bc35225f9459ce1")
    private String id;

    @JsonProperty("orderCode")
    @Schema(description = "Código de seguimiento institucional", example = "ORD-2026-0001")
    private String orderCode;

    @JsonProperty("resourceId")
    @Schema(description = "ID del recurso operativo", example = "64a4eb5a0bc35225f9459ce2")
    private String resourceId;

    @JsonProperty("resourcePlate")
    @Schema(description = "Placa del vehículo", example = "EUA-911")
    private String resourcePlate;

    @JsonProperty("entityId")
    @Schema(description = "ID de la entidad propietaria", example = "ENT-001")
    private String entityId;

    @JsonProperty("reportedByDni")
    @Schema(description = "DNI de quien reportó el evento", example = "71234567")
    private String reportedByDni;

    @JsonProperty("maintenanceType")
    @Schema(description = "Tipo de mantenimiento")
    private MaintenanceType maintenanceType;

    @JsonProperty("orderStatus")
    @Schema(description = "Estado actual del ciclo de vida")
    private OrderStatus orderStatus;

    @JsonProperty("priority")
    @Schema(description = "Nivel de prioridad")
    private OrderPriority priority;

    @JsonProperty("failureReason")
    @Schema(description = "Motivo de ingreso o síntoma", example = "Falla en sistema de frenos")
    private String failureReason;

    @JsonProperty("reportedMileage")
    @Schema(description = "Kilometraje al ingresar", example = "85400")
    private Integer reportedMileage;

    @JsonProperty("createdAt")
    @Schema(description = "Fecha de registro en el sistema")
    private LocalDateTime createdAt;

    @JsonProperty("updatedAt")
    @Schema(description = "Fecha de última modificación")
    private LocalDateTime updatedAt;

    @JsonProperty("status")
    @Schema(description = "Estado del registro (A: Activo, I: Inactivo)", example = "A")
    private String status;

    // Métodos de compatibilidad con clientes existentes que esperan nombres en español
    @JsonProperty("codigoOrden")
    public String getCodigoOrden() { return orderCode; }

    @JsonProperty("recursoId")
    public String getRecursoId() { return resourceId; }

    @JsonProperty("recursoPlaca")
    public String getRecursoPlaca() { return resourcePlate; }

    @JsonProperty("entidadId")
    public String getEntidadId() { return entityId; }

    @JsonProperty("motivoAveria")
    public String getMotivoAveria() { return failureReason; }

    @JsonProperty("kilometrajeReportado")
    public Integer getKilometrajeReportado() { return reportedMileage; }

    @JsonProperty("creadoEn")
    public LocalDateTime getCreadoEn() { return createdAt; }

    @JsonProperty("actualizadoEn")
    public LocalDateTime getActualizadoEn() { return updatedAt; }
}
