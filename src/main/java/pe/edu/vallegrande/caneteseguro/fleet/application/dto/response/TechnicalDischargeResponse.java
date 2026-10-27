package pe.edu.vallegrande.caneteseguro.fleet.application.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Boundary Response DTO for technical discharge reports.
 * Isolated from domain models according to STD-063.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Informe técnico de alta operativa y conformidad")
public class TechnicalDischargeResponse {

    @JsonProperty("technicalVerdict")
    @Schema(description = "Dictamen del perito mecánico o jefe de maestranza", example = "Vehículo probado en ruta; 100% operativo")
    private String technicalVerdict;

    @JsonProperty("testsPerformed")
    @Schema(description = "Pruebas mecánicas efectuadas antes de la entrega", example = "Prueba de frenado a 60km/h y temperatura")
    private String testsPerformed;

    @JsonProperty("exitMileage")
    @Schema(description = "Kilometraje al momento de la salida del taller", example = "85415")
    private Integer exitMileage;

    @JsonProperty("dischargeDate")
    @Schema(description = "Fecha y hora de emisión del alta técnica")
    private LocalDateTime dischargeDate;

    @JsonProperty("approvedByDni")
    @Schema(description = "DNI del responsable de maestranza que aprobó el alta", example = "71234567")
    private String approvedByDni;

    @JsonProperty("remarks")
    @Schema(description = "Observaciones finales de mantenimiento", example = "Próximo mantenimiento programado a los 90,000 km")
    private String remarks;

    @JsonProperty("mediaUrl")
    @Schema(description = "URL de evidencia o acta en Cloudinary", example = "https://res.cloudinary.com/vallegrande/acta.pdf")
    private String mediaUrl;
}
