package pe.edu.vallegrande.caneteseguro.gateway.filter;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class RequestAuditFilterTest {

    private final RequestAuditFilter filter = new RequestAuditFilter();

    /** Returns the id the service saw (forwarded header) and checks it matches the response. */
    private String run(MockServerHttpRequest request) {
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();
        filter.filter(exchange, ex -> { downstream.set(ex); return Mono.empty(); }).block();
        String forwarded = downstream.get().getRequest().getHeaders().getFirst(RequestAuditFilter.HDR_REQUEST_ID);
        assertThat(exchange.getResponse().getHeaders().getFirst(RequestAuditFilter.HDR_REQUEST_ID)).isEqualTo(forwarded);
        return forwarded;
    }

    @Test
    void generaIdSiNoViene() {
        assertThat(run(MockServerHttpRequest.get("/api/x").build())).matches("[0-9a-f-]{36}");
    }

    @Test
    void conservaIdValidoDelCliente() {
        assertThat(run(MockServerHttpRequest.post("/api/x").header(RequestAuditFilter.HDR_REQUEST_ID, "abc-12345").build()))
                .isEqualTo("abc-12345");
    }

    @Test
    void reemplazaIdInvalido() {
        assertThat(run(MockServerHttpRequest.get("/api/x").header(RequestAuditFilter.HDR_REQUEST_ID, "x\nfalso log").build()))
                .matches("[0-9a-f-]{36}");
    }
}
