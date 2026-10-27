package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.adapter.out.client.recursos;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.net.URI;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ResourceClientAdapterTest {

    @Test
    @DisplayName("Should call PATCH /api/v1/resources/{id}/availability?availability=EN_MANTENIMIENTO with Bearer token")
    void shouldCallDisableResourceForMaintenanceWithEnglishPath() {
        AtomicReference<URI> capturedUri = new AtomicReference<>();
        AtomicReference<HttpMethod> capturedMethod = new AtomicReference<>();
        AtomicReference<String> capturedAuth = new AtomicReference<>();

        ExchangeFunction exchangeFunction = request -> {
            capturedUri.set(request.url());
            capturedMethod.set(request.method());
            capturedAuth.set(request.headers().getFirst(HttpHeaders.AUTHORIZATION));
            return Mono.just(ClientResponse.create(HttpStatus.OK).build());
        };

        WebClient.Builder builder = WebClient.builder().exchangeFunction(exchangeFunction);
        ResourceClientAdapter adapter = new ResourceClientAdapter(builder, "http://localhost:9004");

        StepVerifier.create(adapter.disableResourceForMaintenance("rec-123", "jwt-token-abc"))
                .verifyComplete();

        assertEquals(HttpMethod.PATCH, capturedMethod.get());
        assertEquals("Bearer jwt-token-abc", capturedAuth.get());
        assertEquals("http://localhost:9004/api/v1/resources/rec-123/availability?availability=EN_MANTENIMIENTO", capturedUri.get().toString());
    }

    @Test
    @DisplayName("Should call PATCH /api/v1/resources/{id}/availability?availability=DISPONIBLE with Bearer token")
    void shouldCallEnableResourceToAvailableWithEnglishPath() {
        AtomicReference<URI> capturedUri = new AtomicReference<>();
        AtomicReference<HttpMethod> capturedMethod = new AtomicReference<>();
        AtomicReference<String> capturedAuth = new AtomicReference<>();

        ExchangeFunction exchangeFunction = request -> {
            capturedUri.set(request.url());
            capturedMethod.set(request.method());
            capturedAuth.set(request.headers().getFirst(HttpHeaders.AUTHORIZATION));
            return Mono.just(ClientResponse.create(HttpStatus.OK).build());
        };

        WebClient.Builder builder = WebClient.builder().exchangeFunction(exchangeFunction);
        ResourceClientAdapter adapter = new ResourceClientAdapter(builder, "http://localhost:9004");

        StepVerifier.create(adapter.enableResourceToAvailable("rec-123", "jwt-token-xyz"))
                .verifyComplete();

        assertEquals(HttpMethod.PATCH, capturedMethod.get());
        assertEquals("Bearer jwt-token-xyz", capturedAuth.get());
        assertEquals("http://localhost:9004/api/v1/resources/rec-123/availability?availability=DISPONIBLE", capturedUri.get().toString());
    }
}
