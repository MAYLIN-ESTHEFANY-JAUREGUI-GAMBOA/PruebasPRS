package pe.edu.vallegrande.caneteseguro.fleet.domain.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Modelo de dominio para el informe de alta operativa y conformidad técnica.
 * 100% en inglés según estándar DatabaseStorage.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TechnicalDischargeReport {
    private String technicalVerdict;
    private String testsPerformed;
    private Integer exitMileage;
    private LocalDateTime dischargeDate;
    private String approvedByDni;
    private String remarks;
    private String mediaUrl;
}
