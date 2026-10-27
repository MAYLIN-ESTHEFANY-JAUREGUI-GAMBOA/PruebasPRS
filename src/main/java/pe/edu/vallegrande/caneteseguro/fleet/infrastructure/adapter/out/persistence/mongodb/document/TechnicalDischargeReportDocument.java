package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * Embedded MongoDB document for technical discharge report.
 * Conforms to DatabaseStorage standard: English camelCase BSON fields and isolated persistence models.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TechnicalDischargeReportDocument {

    @Field("technicalVerdict")
    private String technicalVerdict;

    @Field("testsPerformed")
    private String testsPerformed;

    @Field("exitMileage")
    private Integer exitMileage;

    @Field("dischargeDate")
    private LocalDateTime dischargeDate;

    @Field("approvedByDni")
    private String approvedByDni;

    @Field("remarks")
    private String remarks;

    @Field("mediaUrl")
    private String mediaUrl;
}
