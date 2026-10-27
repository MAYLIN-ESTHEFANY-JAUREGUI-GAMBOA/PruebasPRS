package pe.edu.vallegrande.caneteseguro.fleet.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Modelo de dominio para los datos del taller mecánico externo asignado.
 * 100% en inglés según estándar DatabaseStorage.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkshopDetail {
    private String workshopName;
    private String workshopRuc;
    private String mechanicInCharge;
    private String contactPhone;
    private String workshopAddress;
    private BigDecimal estimatedCost;
    private BigDecimal finalCost;
    private LocalDateTime estimatedDeliveryDate;
    private String initialDiagnosis;
}
