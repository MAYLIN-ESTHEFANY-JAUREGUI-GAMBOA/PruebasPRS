package pe.edu.vallegrande.caneteseguro.gateway.filter;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class IdentityHeadersGatewayFilterTest {

    private final IdentityHeadersGatewayFilter filter = new IdentityHeadersGatewayFilter();

    @Test
    void propagaIdentidadDelJwt() {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS512")
                .claim("uid", "usr-1").claim("dni", "12345678").claim("eid", "ent-1")
                .claim("roles", List.of("OPERADOR_ENTIDAD")).build();
        JwtAuthenticationToken auth = new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_OPERADOR_ENTIDAD")));
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        AtomicInteger calls = new AtomicInteger();
        GatewayFilterChain chain = exchange -> {
            calls.incrementAndGet();
            forwarded.set(exchange);
            return Mono.empty();
        };

        filter.filter(MockServerWebExchange.from(MockServerHttpRequest.get("/api/x")), chain)
                .contextWrite(ReactiveSecurityContextHolder.withAuthentication(auth))
                .block();

        var headers = forwarded.get().getRequest().getHeaders();
        assertEquals("usr-1", headers.getFirst(IdentityHeadersGatewayFilter.HDR_USER_ID));
        assertEquals("12345678", headers.getFirst(IdentityHeadersGatewayFilter.HDR_USER_SUBJECT));
        assertEquals("OPERADOR_ENTIDAD", headers.getFirst(IdentityHeadersGatewayFilter.HDR_USER_ROLES));
        assertEquals("ent-1", headers.getFirst(IdentityHeadersGatewayFilter.HDR_USER_EID));
        assertEquals(1, calls.get(), "la cadena del gateway debe ejecutarse una sola vez");
    }

    @Test
    void sinAutenticacion_eliminaCabecerasFalsificadas() {
        AtomicReference<ServerWebExchange> forwarded = new AtomicReference<>();
        MockServerHttpRequest spoofed = MockServerHttpRequest.get("/api/auth/login")
                .header(IdentityHeadersGatewayFilter.HDR_USER_ID, "admin")
                .header(IdentityHeadersGatewayFilter.HDR_USER_ROLES, "SUPER_ADMIN")
                .build();
        filter.filter(MockServerWebExchange.from(spoofed), exchange -> {
            forwarded.set(exchange);
            return Mono.empty();
        }).block();

        assertNull(forwarded.get().getRequest().getHeaders().getFirst(IdentityHeadersGatewayFilter.HDR_USER_ID));
        assertNull(forwarded.get().getRequest().getHeaders().getFirst(IdentityHeadersGatewayFilter.HDR_USER_ROLES));
    }
}
