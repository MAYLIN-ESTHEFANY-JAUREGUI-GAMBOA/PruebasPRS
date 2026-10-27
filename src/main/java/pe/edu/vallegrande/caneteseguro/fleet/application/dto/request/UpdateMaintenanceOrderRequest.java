package pe.edu.vallegrande.caneteseguro.fleet.application.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import pe.edu.vallegrande.caneteseguro.fleet.domain.vo.OrderPriority;

/**
 * Request DTO for updating editable header fields of an active maintenance order.
 * Supports dual naming (English and Spanish) via Jackson aliases.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Datos para actualizar una orden de mantenimiento activa")
public class UpdateMaintenanceOrderRequest {

    @Size(max = 500, message = "El motivo no puede exceder 500 caracteres")
    @JsonProperty("failureReason")
    @JsonAlias({"motivoFalla", "motivoAveria", "failureReason"})
    @Schema(description = "Descripción de la avería o requerimiento", example = "Mantenimiento preventivo de frenos y cambio de aceite")
    private String failureReason;

    @Min(value = 0, message = "El kilometraje no puede ser negativo")
    @JsonProperty("reportedMileage")
    @JsonAlias({"kilometrajeReportado", "reportedMileage"})
    @Schema(description = "Kilometraje registrado al momento de la orden", example = "85500")
    private Integer reportedMileage;

    @JsonProperty("priority")
    @JsonAlias({"prioridad", "priority"})
    @Schema(description = "Nivel de urgencia operativa (BAJA, MEDIA, ALTA, CRITICA)", example = "ALTA")
    private OrderPriority priority;

    @Size(max = 500, message = "Las observaciones no pueden exceder 500 caracteres")
    @JsonProperty("remarks")
    @JsonAlias({"observaciones", "remarks"})
    @Schema(description = "Observaciones adicionales", example = "Prioridad elevada por disposición de jefatura")
    private String remarks;

    @Size(max = 100, message = "El ID del incidente no puede exceder 100 caracteres")
    @JsonProperty("incidentId")
    @JsonAlias({"incidenteId", "incidentId"})
    @Schema(description = "ID del incidente si proviene de un siniestro", example = "7b5f792c7c84938ece21b113")
    private String incidentId;

    @JsonProperty("workshopDetail")
    @JsonAlias({"detalleTaller", "workshopDetail"})
    @Schema(description = "Datos opcionales del taller mecánico si ya fue asignado")
    private AssignWorkshopRequest workshopDetail;
}
