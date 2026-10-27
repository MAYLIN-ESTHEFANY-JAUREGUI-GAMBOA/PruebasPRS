package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.client.recursos.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Client DTO for vg-ms-recursos response (/api/v1/resources).
 * Aligned with English contracts and backwards compatible aliases.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class OperationalResourceDTO {

    @JsonProperty("id")
    private String id;

    @JsonProperty("internalCode")
    @JsonAlias({"code", "identificador"})
    private String internalCode;

    @JsonProperty("licensePlate")
    private String licensePlate;

    @JsonProperty("name")
    private String name;

    @JsonProperty("type")
    private String type;

    @JsonProperty("availability")
    @JsonAlias({"estadoDisponibilidad"})
    private String availability;

    @JsonProperty("statusDetail")
    @JsonAlias({"status", "subestadoOperativo"})
    private String statusDetail;

    @JsonProperty("entityId")
    @JsonAlias({"responsibleEntityId", "entidadId"})
    private String entityId;
}
