package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.mongodb.core.mapping.Field;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Embedded MongoDB document for workshop detail.
 * Conforms to DatabaseStorage standard: English camelCase BSON fields and isolated persistence models.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkshopDetailDocument {

    @Field("workshopName")
    private String workshopName;

    @Field("workshopRuc")
    private String workshopRuc;

    @Field("mechanicInCharge")
    private String mechanicInCharge;

    @Field("contactPhone")
    private String contactPhone;

    @Field("workshopAddress")
    private String workshopAddress;

    @Field("estimatedCost")
    private BigDecimal estimatedCost;

    @Field("finalCost")
    private BigDecimal finalCost;

    @Field("estimatedDeliveryDate")
    private LocalDateTime estimatedDeliveryDate;

    @Field("initialDiagnosis")
    private String initialDiagnosis;
}
