package pe.edu.vallegrande.caneteseguro.fleet.application.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for substantiated cancellation of a maintenance order (STD-075).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Datos para cancelar una orden de mantenimiento")
public class CancelOrderRequest {

    @NotBlank(message = "El motivo de la cancelación es obligatorio")
    @Size(max = 500, message = "El motivo de la cancelación no puede exceder 500 caracteres")
    @JsonProperty("reason")
    @JsonAlias({"motivo", "reason"})
    @Schema(description = "Justificación operativa por la cual se cancela la intervención", example = "Desestimado por falsa alarma; vehículo verificado y apto para continuar patrullaje")
    private String reason;
}
