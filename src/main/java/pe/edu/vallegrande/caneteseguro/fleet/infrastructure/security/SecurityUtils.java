package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.security;

import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.jwt.Jwt;
import reactor.core.publisher.Mono;

/**
 * Utilidades para extraer claims e identidad del contexto de seguridad reactivo.
 */
public final class SecurityUtils {

    private SecurityUtils() {}

    public static Mono<String> getCurrentUsername() {
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(auth -> auth != null && auth.isAuthenticated())
                .map(auth -> {
                    if (auth.getPrincipal() instanceof Jwt jwt) {
                        String dni = jwt.getClaimAsString("dni");
                        if (dni != null && !dni.isBlank()) return dni;
                        String preferredUsername = jwt.getClaimAsString("preferred_username");
                        if (preferredUsername != null && !preferredUsername.isBlank()) return preferredUsername;
                        return jwt.getSubject();
                    }
                    return auth.getName();
                })
                .defaultIfEmpty("SYSTEM");
    }
}
