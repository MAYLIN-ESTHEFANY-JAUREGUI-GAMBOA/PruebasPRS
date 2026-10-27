package pe.edu.vallegrande.caneteseguro.gateway.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Centralized role rules. The Keycloak decoder is replaced by a test one:
 * the Bearer value is the user's role ("SUPER_ADMIN", "CIUDADANO"...).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SecurityConfigTest {

    @TestConfiguration
    static class KeycloakDePrueba {
        @Bean
        ReactiveJwtDecoder reactiveJwtDecoder() {
            return token -> token.startsWith("invalido")
                    ? Mono.error(new BadJwtException("firma inválida"))
                    : Mono.just(Jwt.withTokenValue(token)
                            .header("alg", "RS256")
                            .subject("kc-" + token)
                            .claim("dni", "12345678")
                            .claim("realm_access", Map.of("roles", List.of(token)))
                            .issuedAt(Instant.now())
                            .expiresAt(Instant.now().plusSeconds(300))
                            .build());
        }
    }

    @Autowired
    private Environment env;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + env.getProperty("local.server.port"))
                .build();
    }

    private WebTestClient.ResponseSpec get(String path, String rol) {
        WebTestClient.RequestHeadersSpec<?> request = client.get().uri(path);
        if (rol != null) {
            request = request.header("Authorization", "Bearer " + rol);
        }
        return request.exchange();
    }

    @Test
    void tokenEnQuery_fueraDelSse_401() {
        client.get().uri("/api/auth/profile?access_token=SUPER_ADMIN").exchange().expectStatus().isUnauthorized();
    }

    @Test
    void tokenEnQuery_enSseDeIncidentes_autentica() {
        // Without the incidents service running the gateway returns no 2xx; it is enough that it is not 401.
        client.get().uri("/api/incidents/stream?access_token=OPERADOR_ENTIDAD").exchange()
                .expectStatus().value(status -> org.junit.jupiter.api.Assertions.assertNotEquals(401, status));
    }

    @Test
    void rutaProtegida_sinToken_401() {
        get("/api/auth/profile", null).expectStatus().isUnauthorized();
    }

    @Test
    void tokenInvalido_401() {
        get("/api/auth/profile", "invalido").expectStatus().isUnauthorized();
    }

    @Test
    void adminUsuarios_conCiudadano_403() {
        get("/api/auth/admin/users", "CIUDADANO").expectStatus().isForbidden();
    }

    @Test
    void castigos_conEntidadAdmin_403() {
        get("/api/auth/admin/penalties/history", "ENTIDAD_ADMIN").expectStatus().isForbidden();
    }

    @Test
    void gestionEntidad_conAnalista_403() {
        get("/api/auth/entity/management", "ANALISTA").expectStatus().isForbidden();
    }

    @Test
    void alertante_conEntidadAdmin_403() {
        get("/api/auth/entity/reporter/abc", "ENTIDAD_ADMIN").expectStatus().isForbidden();
    }

    @Test
    void rutaAuthNoDeclarada_403() {
        get("/api/auth/cualquier-cosa", "SUPER_ADMIN").expectStatus().isForbidden();
    }

    @Test
    void inventario_conAdmin_200() {
        get("/api/admin/inventory", "SUPER_ADMIN").expectStatus().isOk();
    }

    @Test
    void municipalidades_conEntidadAdmin_403() {
        get("/api/municipalities", "ENTIDAD_ADMIN").expectStatus().isForbidden();
    }

    @Test
    void municipalidadPublica_sinToken_noExigeAutenticacion() {
        get("/api/municipalities/public/64b0000000000000000000a1", null).expectStatus()
                .value(s -> org.junit.jupiter.api.Assertions.assertTrue(s != 401 && s != 403, "status " + s));
    }

    @Test
    void inventario_conCiudadano_403() {
        get("/api/admin/inventory", "CIUDADANO").expectStatus().isForbidden();
    }

    @Test
    void loginMunicipalidadIsPublic() {
        client.post().uri("/api/auth/login/municipality").exchange().expectStatus().value(SecurityConfigTest::permitido);
    }

    @Test
    void municipalidadAdminCanReachMunicipalidades() {
        get("/api/municipalities/m1", "MUNICIPALIDAD_ADMIN").expectStatus().value(SecurityConfigTest::permitido);
    }

    @Test
    void analistaCannotReachMunicipalidades() {
        get("/api/municipalities", "ANALISTA").expectStatus().isForbidden();
    }

    @Test
    void municipalidadAdminCanManageStaff() {
        get("/api/auth/entity/users", "MUNICIPALIDAD_ADMIN").expectStatus().value(SecurityConfigTest::permitido);
    }

    private WebTestClient.ResponseSpec send(HttpMethod method, String path, String rol) {
        return client.method(method).uri(path).header("Authorization", "Bearer " + rol).exchange();
    }

    @Test
    void castigarAlerta_operadorPasa_analistaNo() {
        send(HttpMethod.POST, "/api/penalties/incidents/i1/alerts/a1", "OPERADOR_ENTIDAD").expectStatus().value(SecurityConfigTest::permitido);
        send(HttpMethod.POST, "/api/penalties/incidents/i1/alerts/a1", "ANALISTA").expectStatus().isForbidden();
        send(HttpMethod.POST, "/api/penalties/incidents/i1/alerts/a1", "CIUDADANO").expectStatus().isForbidden();
    }

    @Test
    void historialCastigos_personalSi_ciudadanoNo() {
        get("/api/penalties/history", "ANALISTA").expectStatus().value(SecurityConfigTest::permitido);
        get("/api/penalties/status/u1", "OPERADOR_ENTIDAD").expectStatus().value(SecurityConfigTest::permitido);
        get("/api/penalties/history", "CIUDADANO").expectStatus().isForbidden();
    }

    @Test
    void castigosInternos_nuncaExpuestos() {
        get("/api/penalties/users/u1", "SUPER_ADMIN").expectStatus().isForbidden();
        get("/api/penalties/users/u1/validate-access", "SUPER_ADMIN").expectStatus().isForbidden();
    }

    @Test
    void levantarCastigo_municipalidadSi_entidadNo_aplicarManualSoloSuperAdmin() {
        send(HttpMethod.DELETE, "/api/auth/admin/users/u1/penalty", "MUNICIPALIDAD_ADMIN").expectStatus().value(SecurityConfigTest::permitido);
        send(HttpMethod.PUT, "/api/auth/admin/users/u1/penalty", "MUNICIPALIDAD_ADMIN").expectStatus().value(SecurityConfigTest::permitido);
        send(HttpMethod.DELETE, "/api/auth/admin/users/u1/penalty", "ENTIDAD_ADMIN").expectStatus().isForbidden();
        send(HttpMethod.POST, "/api/auth/admin/users/u1/penalty", "MUNICIPALIDAD_ADMIN").expectStatus().isForbidden();
    }

    /** The target service is not running in the test: it is enough that the gateway does not return 401/403. */
    private static void permitido(int status) {
        org.junit.jupiter.api.Assertions.assertTrue(status != 401 && status != 403, "status " + status);
    }
}
