package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.persistence.mongodb.document;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.LocalDateTime;

/**
 * MongoDB document entity for collection "maintenance_orders".
 * Strictly in English and compliant with DatabaseStorage criteria:
 * - HEX-01/03: Isolated inside infrastructure persistence adapter.
 * - NOM-01: Collection name in lowercase English plural ("maintenance_orders").
 * - NOM-02: BSON document fields mapped in camelCase English (matching IncidentDocument standard).
 * - TEN-01/02: Indexed entityId for multi-tenancy isolation.
 * - TEN-03: Soft delete flags (status, active).
 * - TEN-04: UTC audit timestamps (createdAt, updatedAt).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "maintenance_orders")
@CompoundIndexes({
        @CompoundIndex(name = "idx_entity_status", def = "{'entityId': 1, 'orderStatus': 1}"),
        @CompoundIndex(name = "idx_resource_status", def = "{'resourceId': 1, 'orderStatus': 1}")
})
public class MaintenanceOrderDocument {

    @Id
    private String id;

    @Indexed(unique = true)
    @Field("orderCode")
    private String orderCode;

    @Indexed
    @Field("resourceId")
    private String resourceId;

    @Field("resourcePlate")
    private String resourcePlate;

    @Indexed
    @Field("entityId")
    private String entityId;

    @Field("reportedByDni")
    private String reportedByDni;

    @Field("incidentId")
    private String incidentId;

    @Field("maintenanceType")
    private String maintenanceType;

    @Indexed
    @Field("orderStatus")
    private String orderStatus;

    @Field("priority")
    private String priority;

    @Field("failureReason")
    private String failureReason;

    @Field("reportedMileage")
    private Integer reportedMileage;

    @Field("workshopDetail")
    private WorkshopDetailDocument workshopDetail;

    @Field("technicalDischargeReport")
    private TechnicalDischargeReportDocument technicalDischargeReport;

    @Field("remarks")
    private String remarks;

    @Indexed
    @Field("status")
    private String status;

    @Field("active")
    private Boolean active;

    @CreatedDate
    @Field("createdAt")
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Field("updatedAt")
    private LocalDateTime updatedAt;

    public String getOrderNumber() {
        return orderCode;
    }

    public void setOrderNumber(String orderNumber) {
        this.orderCode = orderNumber;
    }

    public String getIssueDescription() {
        return failureReason;
    }

    public void setIssueDescription(String issueDescription) {
        this.failureReason = issueDescription;
    }
}
