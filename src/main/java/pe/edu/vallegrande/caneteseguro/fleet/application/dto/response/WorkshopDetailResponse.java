package pe.edu.vallegrande.caneteseguro.fleet.application.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Boundary Response DTO for workshop assignments.
 * Isolated from domain models according to STD-063.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Detalle del taller mecánico asignado")
public class WorkshopDetailResponse {

    @JsonProperty("workshopName")
    @Schema(description = "Nombre o razón social del taller", example = "Taller Central Cañete")
    private String workshopName;

    @JsonProperty("workshopRuc")
    @Schema(description = "RUC del taller mecánico", example = "20601234567")
    private String workshopRuc;

    @JsonProperty("mechanicInCharge")
    @Schema(description = "Nombre del técnico o mecánico jefe", example = "Ing. Roberto Gálvez")
    private String mechanicInCharge;

    @JsonProperty("contactPhone")
    @Schema(description = "Teléfono de contacto", example = "987654321")
    private String contactPhone;

    @JsonProperty("workshopAddress")
    @Schema(description = "Dirección física del taller", example = "Av. 28 de Julio 450")
    private String workshopAddress;

    @JsonProperty("estimatedCost")
    @Schema(description = "Presupuesto cotizado inicial", example = "1500.00")
    private BigDecimal estimatedCost;

    @JsonProperty("finalCost")
    @Schema(description = "Costo final facturado", example = "1450.00")
    private BigDecimal finalCost;

    @JsonProperty("estimatedDeliveryDate")
    @Schema(description = "Fecha estimada de entrega")
    private LocalDateTime estimatedDeliveryDate;

    @JsonProperty("initialDiagnosis")
    @Schema(description = "Diagnóstico preliminar o trabajos requeridos", example = "Cambio de pastillas y discos")
    private String initialDiagnosis;
}
