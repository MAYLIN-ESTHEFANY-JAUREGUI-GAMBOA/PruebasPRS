package pe.edu.vallegrande.caneteseguro.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Propagates the validated identity to the services (internal headers).
 * Services behind the gateway can read roles/user without revalidating if they trust the network.
 */
@Component
public class IdentityHeadersGatewayFilter implements GlobalFilter, Ordered {

    public static final String HDR_USER_ID = "X-User-Id";
    public static final String HDR_USER_SUBJECT = "X-User-Subject";
    public static final String HDR_USER_ROLES = "X-User-Roles";
    public static final String HDR_USER_EID = "X-User-Eid";
    public static final String HDR_USER_MID = "X-User-Mid";

    @Override
    public Mono<Void> filter(ServerWebExchange original, GatewayFilterChain chain) {
        // Never trust identity headers sent by the client.
        ServerWebExchange exchange = original.mutate()
                .request(req -> req.headers(headers -> {
                    headers.remove(HDR_USER_ID);
                    headers.remove(HDR_USER_SUBJECT);
                    headers.remove(HDR_USER_ROLES);
                    headers.remove(HDR_USER_EID);
                    headers.remove(HDR_USER_MID);
                }))
                .build();
        // The chain is invoked only once: chain.filter() completes empty and must not be re-triggered.
        return ReactiveSecurityContextHolder.getContext()
                .map(ctx -> ctx.getAuthentication())
                .filter(Authentication::isAuthenticated)
                .filter(JwtAuthenticationToken.class::isInstance)
                .map(auth -> withIdentity(exchange, ((JwtAuthenticationToken) auth).getToken()))
                .defaultIfEmpty(exchange)
                .flatMap(chain::filter);
    }

    private static ServerWebExchange withIdentity(ServerWebExchange exchange, Jwt jwt) {
        RequestAuditFilter.recordUser(exchange, jwt);
        return exchange.mutate()
                .request(req -> req
                        .headers(headers -> {
                            headers.set(HDR_USER_SUBJECT, firstNonBlank(
                                    jwt.getClaimAsString("dni"),
                                    jwt.getClaimAsString("preferred_username"),
                                    jwt.getSubject()));
                            headers.set(HDR_USER_ID, firstNonBlank(
                                    jwt.getClaimAsString("uid"),
                                    jwt.getClaimAsString("dni"),
                                    jwt.getClaimAsString("preferred_username"),
                                    jwt.getSubject()));
                            headers.set(HDR_USER_ROLES, joinRoles(jwt));
                            String eid = jwt.getClaimAsString("eid");
                            if (eid != null && !eid.isBlank()) {
                                headers.set(HDR_USER_EID, eid);
                            }
                            String mid = jwt.getClaimAsString("mid");
                            if (mid != null && !mid.isBlank()) {
                                headers.set(HDR_USER_MID, mid);
                            }
                        }))
                .build();
    }

    private static String joinRoles(Jwt jwt) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        if (roles != null && !roles.isEmpty()) {
            return String.join(",", roles);
        }
        Object realmAccess = jwt.getClaim("realm_access");
        if (realmAccess instanceof java.util.Map<?, ?> map
                && map.get("roles") instanceof Collection<?> collection) {
            return collection.stream().map(String::valueOf).collect(Collectors.joining(","));
        }
        return "";
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE - 10;
    }
}
