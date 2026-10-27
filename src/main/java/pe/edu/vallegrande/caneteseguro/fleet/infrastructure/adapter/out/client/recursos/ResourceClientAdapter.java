package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.client.recursos;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import pe.edu.vallegrande.caneteseguro.fleet.domain.exception.DomainException;
import pe.edu.vallegrande.caneteseguro.fleet.domain.port.out.ResourceClientPort;
import pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.client.recursos.dto.OperationalResourceDTO;
import reactor.core.publisher.Mono;

/**
 * Secondary Outbound WebClient Adapter for vg-ms-recursos microservice.
 * Implements ResourceClientPort with Bearer token propagation and technical error translation (STD-072).
 */
@Slf4j
@Component
public class ResourceClientAdapter implements ResourceClientPort {

    private final WebClient webClient;

    public ResourceClientAdapter(
            WebClient.Builder webClientBuilder,
            @Value("${services.recursos.url:http://localhost:9004}") String recursosUrl) {
        this.webClient = webClientBuilder
                .baseUrl(recursosUrl + "/api/v1/resources")
                .build();
    }

    @Override
    public Mono<Void> disableResourceForMaintenance(String resourceId, String bearerToken) {
        log.info("Calling vg-ms-recursos to set resource {} to EN_MANTENIMIENTO", resourceId);

        return webClient.patch()
                .uri(uriBuilder -> uriBuilder
                        .path("/{id}/availability")
                        .queryParam("availability", "EN_MANTENIMIENTO")
                        .build(resourceId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, response ->
                        response.bodyToMono(String.class)
                                .defaultIfEmpty("External resource client error")
                                .flatMap(body -> Mono.error(new DomainException("Resource service error (" + response.statusCode().value() + "): " + body))))
                .onStatus(HttpStatusCode::is5xxServerError, response ->
                        response.bodyToMono(String.class)
                                .defaultIfEmpty("External resource service unavailable")
                                .flatMap(body -> Mono.error(new DomainException("Resource service temporarily unavailable (" + response.statusCode().value() + ")"))))
                .toBodilessEntity()
                .doOnSuccess(entity -> log.info("Resource {} successfully marked EN_MANTENIMIENTO in vg-ms-recursos", resourceId))
                .doOnError(err -> log.error("Error setting resource to EN_MANTENIMIENTO: {}", err.getMessage()))
                .then();
    }

    @Override
    public Mono<Void> enableResourceToAvailable(String resourceId, String bearerToken) {
        log.info("Calling vg-ms-recursos to restore resource {} to DISPONIBLE", resourceId);

        return webClient.patch()
                .uri(uriBuilder -> uriBuilder
                        .path("/{id}/availability")
                        .queryParam("availability", "DISPONIBLE")
                        .build(resourceId))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, response ->
                        response.bodyToMono(String.class)
                                .defaultIfEmpty("External resource client error")
                                .flatMap(body -> Mono.error(new DomainException("Resource service error (" + response.statusCode().value() + "): " + body))))
                .onStatus(HttpStatusCode::is5xxServerError, response ->
                        response.bodyToMono(String.class)
                                .defaultIfEmpty("External resource service unavailable")
                                .flatMap(body -> Mono.error(new DomainException("Resource service temporarily unavailable (" + response.statusCode().value() + ")"))))
                .toBodilessEntity()
                .doOnSuccess(entity -> log.info("Resource {} successfully restored to DISPONIBLE in vg-ms-recursos", resourceId))
                .doOnError(err -> log.error("Error restoring resource to DISPONIBLE: {}", err.getMessage()))
                .then();
    }
}
