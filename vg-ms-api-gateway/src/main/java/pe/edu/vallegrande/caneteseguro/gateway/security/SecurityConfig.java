package pe.edu.vallegrande.caneteseguro.gateway.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.server.resource.web.server.authentication.ServerBearerTokenAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.access.server.BearerTokenServerAccessDeniedHandler;
import org.springframework.security.web.server.SecurityWebFilterChain;
import pe.edu.vallegrande.caneteseguro.gateway.filter.RequestAuditFilter;
import org.springframework.web.cors.reactive.CorsConfigurationSource;


@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    private static final String SUPER_ADMIN = "SUPER_ADMIN";
    private static final String MUNICIPALIDAD_ADMIN = "MUNICIPALIDAD_ADMIN";
    private static final String ENTIDAD_ADMIN = "ENTIDAD_ADMIN";
    private static final String OPERADOR_ENTIDAD = "OPERADOR_ENTIDAD";
    private static final String ANALISTA = "ANALISTA";
    private static final String SSE_QUERY_TOKEN_PATH = "/api/incidents/stream";

    private final KeycloakRealmRoleConverter roleConverter;
    private final CorsConfigurationSource corsConfigurationSource;

    public SecurityConfig(KeycloakRealmRoleConverter roleConverter,
                          CorsConfigurationSource corsConfigurationSource) {
        this.roleConverter = roleConverter;
        this.corsConfigurationSource = corsConfigurationSource;
    }

    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
        http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                // Without this, OPTIONS/401/500 go out without Access-Control-* and the browser reports CORS.
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .pathMatchers("/actuator/health", "/actuator/info").permitAll()

                        // ── vg-ms-auth (public: login, registration, selfie signature) ──────
                        .pathMatchers(HttpMethod.POST,
                                "/api/auth/login",
                                "/api/auth/register",
                                "/api/auth/registration/status",
                                "/api/auth/login/entity",
                                "/api/auth/login/municipality",
                                "/api/auth/login/operator").permitAll()
                        .pathMatchers(HttpMethod.GET, "/api/cloudinary/signature-registration").permitAll()

                        // ── vg-ms-castigos (staff; the service checks the incident's entity/municipality) ──
                        .pathMatchers(HttpMethod.POST, "/api/penalties/incidents/*/alerts/*")
                                .hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN, ENTIDAD_ADMIN, OPERADOR_ENTIDAD)
                        .pathMatchers(HttpMethod.GET, "/api/penalties/status/*", "/api/penalties/history")
                                .hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN, ENTIDAD_ADMIN, OPERADOR_ENTIDAD, ANALISTA)
                        .pathMatchers("/api/penalties/**").denyAll()

                        // ── vg-ms-castigos (administration): the municipality can also modify/lift
                        //    (only penalties originated in it, checked by the service) ──
                        .pathMatchers(HttpMethod.PUT, "/api/auth/admin/users/*/penalty").hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN)
                        .pathMatchers(HttpMethod.DELETE, "/api/auth/admin/users/*/penalty").hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN)
                        .pathMatchers("/api/auth/admin/users/*/penalty").hasRole(SUPER_ADMIN)
                        .pathMatchers("/api/auth/admin/penalties", "/api/auth/admin/penalties/**").hasRole(SUPER_ADMIN)

                        // ── vg-ms-usuarios: global administration ───────────────────────────
                        .pathMatchers("/api/auth/admin/**").hasRole(SUPER_ADMIN)

                        // ── vg-ms-usuarios: entity / municipality panel (scope in InstitutionIdResolver) ──
                        .pathMatchers("/api/auth/entity/users", "/api/auth/entity/users/**")
                                .hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN, ENTIDAD_ADMIN)
                        .pathMatchers(HttpMethod.GET, "/api/auth/entity/management").hasAnyRole(SUPER_ADMIN, ENTIDAD_ADMIN)
                        .pathMatchers(HttpMethod.GET, "/api/auth/entity/staff")
                                .hasAnyRole(SUPER_ADMIN, ENTIDAD_ADMIN, OPERADOR_ENTIDAD)
                        .pathMatchers(HttpMethod.GET, "/api/auth/entity/my-entity", "/api/auth/entity/profile")
                                .hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN, ENTIDAD_ADMIN, OPERADOR_ENTIDAD, ANALISTA)
                        .pathMatchers(HttpMethod.GET, "/api/auth/entity/reporter/*")
                                .hasAnyRole(SUPER_ADMIN, OPERADOR_ENTIDAD, ANALISTA)
                        .pathMatchers("/api/auth/entity/**").denyAll()

                        // ── vg-ms-usuarios: own profile and penalty (any authenticated user) ──
                        .pathMatchers("/api/auth/profile", "/api/auth/penalty").authenticated()

                        // ── vg-ms-municipalidades: public branding; super admin management (create/status) and
                        //    MUNICIPALIDAD_ADMIN only over its own (@PreAuthorize in the service) ──
                        .pathMatchers(HttpMethod.GET, "/api/municipalities/public/*").permitAll()
                        .pathMatchers("/api/municipalities", "/api/municipalities/**")
                                .hasAnyRole(SUPER_ADMIN, MUNICIPALIDAD_ADMIN)

                        // ── Gateway ─────────────────────────────────────────────────────────
                        .pathMatchers(HttpMethod.GET, "/api/admin/inventory").hasRole(SUPER_ADMIN)

                        // Any other undeclared auth route is closed; the rest of /api (other teams) requires a token.
                        .pathMatchers("/api/auth/**").denyAll()
                        .pathMatchers("/api/**").authenticated()
                        .anyExchange().permitAll()
                )
                .oauth2ResourceServer(oauth2 -> {
                    ServerBearerTokenAuthenticationConverter headerOnly = new ServerBearerTokenAuthenticationConverter();
                    ServerBearerTokenAuthenticationConverter withQuery = new ServerBearerTokenAuthenticationConverter();
                    withQuery.setAllowUriQueryParameter(true);
                    // ?access_token= only on the incidents SSE (the browser EventSource sends no headers);
                    // elsewhere a token in the URL would end up in proxy logs (SEC-018).
                    oauth2.bearerTokenConverter(exchange ->
                            SSE_QUERY_TOKEN_PATH.equals(exchange.getRequest().getPath().pathWithinApplication().value())
                                    ? withQuery.convert(exchange)
                                    : headerOnly.convert(exchange));
                    oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(roleConverter));
                    // Role 403: Security stops before the gateway filters; record who it was for the audit log.
                    BearerTokenServerAccessDeniedHandler denied = new BearerTokenServerAccessDeniedHandler();
                    oauth2.accessDeniedHandler((exchange, ex) -> exchange.getPrincipal()
                            .filter(JwtAuthenticationToken.class::isInstance)
                            .doOnNext(p -> RequestAuditFilter.recordUser(exchange, ((JwtAuthenticationToken) p).getToken()))
                            .then(denied.handle(exchange, ex)));
                });
        return http.build();
    }
}
