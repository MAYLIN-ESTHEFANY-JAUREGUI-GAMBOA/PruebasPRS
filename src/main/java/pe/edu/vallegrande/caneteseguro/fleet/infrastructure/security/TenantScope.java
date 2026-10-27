package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Multitenant scope of the authenticated user (JWT claims {@code mid}/{@code eid}).
 * Business rule for Fleet and Maintenance:
 * - SUPER_ADMIN/ADMIN has global view and management of all orders and fleets.
 * - With {@code eid} (Entity): views and manages exclusively orders belonging to their entity.
 * - Users without {@code eid} (including municipality-only): do not participate in fleet vehicle maintenance.
 */
public record TenantScope(boolean all, String municipalidadId, String entidadId, Set<String> roles) {

    public static Mono<TenantScope> current() {
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .map(TenantScope::from)
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User is not authenticated")));
    }

    public static TenantScope from(Authentication auth) {
        if (auth == null) {
            return new TenantScope(false, null, null, Set.of());
        }
        Set<String> roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .map(a -> a.startsWith("ROLE_") ? a.substring(5) : a)
                .collect(Collectors.toUnmodifiableSet());
        Map<String, Object> claims = auth instanceof JwtAuthenticationToken jwt ? jwt.getTokenAttributes() : Map.of();
        return new TenantScope(roles.contains("SUPER_ADMIN") || roles.contains("ADMIN"), text(claims.get("mid")), text(claims.get("eid")), roles);
    }

    public boolean hasRole(String role) {
        return roles.contains(role);
    }

    /**
     * Read access for maintenance order belonging to {@code eid}.
     * Only SUPER_ADMIN or staff belonging to the same {@code entidadId}.
     */
    public boolean canRead(String eid) {
        if (all) {
            return true;
        }
        return entidadId != null && entidadId.equals(eid);
    }

    /**
     * Write/Management of orders: only entity personnel (or SUPER_ADMIN), except ANALISTA role.
     */
    public boolean canWrite() {
        return all || (entidadId != null && !hasRole("ANALISTA"));
    }

    public TenantScope requireWriter() {
        if (!canWrite()) {
            throw forbidden();
        }
        return this;
    }

    public static ResponseStatusException forbidden() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied: Fleet vehicles are only managed by the owning entity");
    }

    private static String text(Object value) {
        return value == null || value.toString().isBlank() ? null : value.toString();
    }
}
