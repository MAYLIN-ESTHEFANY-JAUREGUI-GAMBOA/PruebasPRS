package pe.edu.vallegrande.caneteseguro.gateway.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * Real JWT validation (SEC-004, section 11): signed with a test RSA key published in a local JWKS,
 * with the same issuer and audience the configuration requires. No mocked decoder.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class JwtValidationTest {

    private static final String ISSUER = "http://issuer-de-prueba/realms/PRS";
    private static final RSAKey KEY;
    private static final RSAKey OTRA_KEY;
    private static final HttpServer JWKS;

    static {
        try {
            KEY = new RSAKeyGenerator(2048).keyID("k1").generate();
            OTRA_KEY = new RSAKeyGenerator(2048).keyID("k1").generate();
            byte[] body = new JWKSet(KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
            JWKS = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            JWKS.createContext("/certs", ex -> {
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(200, body.length);
                ex.getResponseBody().write(body);
                ex.close();
            });
            JWKS.start();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void jwt(DynamicPropertyRegistry registry) {
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> ISSUER);
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
                () -> "http://127.0.0.1:" + JWKS.getAddress().getPort() + "/certs");
        registry.add("spring.security.oauth2.resourceserver.jwt.audiences", () -> "prs-api");
    }

    @AfterAll
    static void stop() {
        JWKS.stop(0);
    }

    @Autowired
    private Environment env;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToServer().baseUrl("http://localhost:" + env.getProperty("local.server.port")).build();
    }

    private static String token(RSAKey key, String issuer, String audience, Instant expires) throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(issuer).subject("kc-1").audience(audience)
                .issueTime(Date.from(Instant.now().minusSeconds(60))).expirationTime(Date.from(expires))
                .claim("realm_access", Map.of("roles", List.of("SUPER_ADMIN")))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    private WebTestClient.ResponseSpec profile(String token) {
        return client.get().uri("/api/auth/profile").header("Authorization", "Bearer " + token).exchange();
    }

    private static Instant enUnaHora() {
        return Instant.now().plusSeconds(3600);
    }

    @Test
    void tokenValido_autentica() throws Exception {
        // Without the users service running there is no 2xx; it is enough that it is not 401.
        profile(token(KEY, ISSUER, "prs-api", enUnaHora()))
                .expectStatus().value(status -> assertNotEquals(401, status));
    }

    @Test
    void tokenVencido_401() throws Exception {
        profile(token(KEY, ISSUER, "prs-api", Instant.now().minusSeconds(600))).expectStatus().isUnauthorized();
    }

    @Test
    void issuerIncorrecto_401() throws Exception {
        profile(token(KEY, "http://otro-keycloak/realms/PRS", "prs-api", enUnaHora())).expectStatus().isUnauthorized();
    }

    @Test
    void audienciaIncorrecta_401() throws Exception {
        profile(token(KEY, ISSUER, "account", enUnaHora())).expectStatus().isUnauthorized();
    }

    @Test
    void firmaDeOtraClave_401() throws Exception {
        profile(token(OTRA_KEY, ISSUER, "prs-api", enUnaHora())).expectStatus().isUnauthorized();
    }
}
