package pe.edu.vallegrande.caneteseguro.fleet.application.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * DTO para la asignación de taller externo y presupuesto inicial (STD-075).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Datos para asignar un taller mecánico y diagnóstico previo")
public class AssignWorkshopRequest {

    @NotBlank(message = "El nombre o razón social del taller es obligatorio")
    @Size(max = 150, message = "El nombre del taller no puede exceder 150 caracteres")
    @JsonProperty("workshopName")
    @JsonAlias({"nombreTaller", "workshopName"})
    @Schema(description = "Nombre comercial o taller asignado", example = "Taller Central Municipal")
    private String workshopName;

    @Pattern(regexp = "^$|^[0-9]{11}$", message = "El RUC del taller debe tener 11 dígitos numéricos")
    @JsonProperty("workshopRuc")
    @JsonAlias({"rucTaller", "workshopRuc"})
    @Schema(description = "RUC del taller mecánico", example = "20601234567")
    private String workshopRuc;

    @Size(max = 100, message = "El nombre del mecánico no puede exceder 100 caracteres")
    @JsonProperty("mechanicInCharge")
    @JsonAlias({"mecanicoResponsable", "mechanicInCharge"})
    @Schema(description = "Nombre del técnico o mecánico jefe", example = "Ing. Roberto Gálvez")
    private String mechanicInCharge;

    @Pattern(regexp = "^$|^[0-9+() -]{7,20}$", message = "El teléfono debe tener un formato válido (entre 7 y 20 caracteres)")
    @JsonProperty("contactPhone")
    @JsonAlias({"telefonoContacto", "contactPhone"})
    @Schema(description = "Teléfono del taller", example = "987654321")
    private String contactPhone;

    @Size(max = 250, message = "La dirección no puede exceder 250 caracteres")
    @JsonProperty("workshopAddress")
    @JsonAlias({"direccionTaller", "workshopAddress"})
    @Schema(description = "Dirección física del taller", example = "Av. Libertadores 1045, San Vicente")
    private String workshopAddress;

    @DecimalMin(value = "0.0", inclusive = true, message = "El costo estimado no puede ser negativo")
    @JsonProperty("estimatedCost")
    @JsonAlias({"costoEstimado", "estimatedCost"})
    @Schema(description = "Presupuesto cotizado inicial (S/.)", example = "1500.00")
    private BigDecimal estimatedCost;

    @JsonProperty("estimatedDeliveryDate")
    @JsonAlias({"fechaEstimadaEntrega", "estimatedDeliveryDate"})
    @Schema(description = "Fecha estimada de fin de trabajos (ISO-8601)", example = "2026-10-28T18:00:00")
    private LocalDateTime estimatedDeliveryDate;

    @Size(max = 1000, message = "El diagnóstico inicial no puede exceder 1000 caracteres")
    @JsonProperty("initialDiagnosis")
    @JsonAlias({"diagnosticoInicial", "initialDiagnosis", "trabajoRealizar", "workDescription", "diagnostico"})
    @Schema(description = "Diagnóstico inicial o trabajos a ejecutar", example = "Cambio de amortiguadores y alineamiento")
    private String initialDiagnosis;

    public String getWorkDescription() {
        return initialDiagnosis;
    }

    public void setWorkDescription(String workDescription) {
        this.initialDiagnosis = workDescription;
    }
}
