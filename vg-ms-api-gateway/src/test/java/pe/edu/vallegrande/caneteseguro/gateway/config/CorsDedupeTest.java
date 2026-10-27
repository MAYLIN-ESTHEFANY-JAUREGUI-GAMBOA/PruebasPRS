package pe.edu.vallegrande.caneteseguro.gateway.config;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** vg-ms-subasignacion (another team) also sends CORS: the browser rejects the repeated header. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CorsDedupeTest {

    private static final HttpServer BACKEND = startBackend();

    private static HttpServer startBackend() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/", exchange -> {
                exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "http://localhost:4200");
                exchange.getResponseHeaders().add("Access-Control-Allow-Credentials", "true");
                exchange.getResponseHeaders().add("Vary", "Origin");
                exchange.sendResponseHeaders(200, -1);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void routes(DynamicPropertyRegistry registry) {
        registry.add("GATEWAY_SUBASIGNACION_URI", () -> "http://localhost:" + BACKEND.getAddress().getPort());
    }

    @AfterAll
    static void stopBackend() {
        BACKEND.stop(0);
    }

    @TestConfiguration
    static class TestDecoder {
        @Bean
        ReactiveJwtDecoder reactiveJwtDecoder() {
            return token -> Mono.just(Jwt.withTokenValue(token)
                    .header("alg", "RS256")
                    .subject("kc-1")
                    .claim("realm_access", Map.of("roles", List.of("OPERADOR_ENTIDAD")))
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(300))
                    .build());
        }
    }

    @Autowired
    private Environment env;

    @Test
    void downstreamCorsHeaders_areNotDuplicated() {
        WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + env.getProperty("local.server.port"))
                .build()
                .get().uri("/api/subassignments")
                .header("Origin", "http://localhost:4200")
                .header("Authorization", "Bearer token")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().value("Access-Control-Allow-Origin", v -> assertEquals("http://localhost:4200", v))
                .expectHeader().values("Access-Control-Allow-Origin", v -> assertEquals(1, v.size()))
                .expectHeader().values("Access-Control-Allow-Credentials", v -> assertEquals(List.of("true"), v));
    }
}
