package pe.edu.vallegrande.caneteseguro.gateway.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverterAdapter;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Roles from the {@code roles} or {@code realm_access.roles} claim.
 * Principal = dni / preferred_username (DNI or RUC), not the Keycloak UUID.
 */
@Component
public class KeycloakRealmRoleConverter
        implements Converter<Jwt, Mono<AbstractAuthenticationToken>> {

    private final Converter<Jwt, Mono<AbstractAuthenticationToken>> delegate;

    public KeycloakRealmRoleConverter() {
        JwtAuthenticationConverter jwtConverter = new JwtAuthenticationConverter();
        jwtConverter.setJwtGrantedAuthoritiesConverter(this::extractAuthorities);
        jwtConverter.setPrincipalClaimName("preferred_username");
        this.delegate = new ReactiveJwtAuthenticationConverterAdapter(jwtConverter);
    }

    @Override
    public Mono<AbstractAuthenticationToken> convert(Jwt jwt) {
        return delegate.convert(jwt).map(token -> {
            if (!(token instanceof JwtAuthenticationToken jwtAuth)) {
                return token;
            }
            String name = firstNonBlank(
                    jwt.getClaimAsString("dni"),
                    jwt.getClaimAsString("preferred_username"),
                    jwt.getSubject());
            return new JwtAuthenticationToken(jwtAuth.getToken(), jwtAuth.getAuthorities(), name);
        });
    }

    private Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        List<String> roles = new ArrayList<>();

        List<String> flatRoles = jwt.getClaimAsStringList("roles");
        if (flatRoles != null) {
            roles.addAll(flatRoles);
        }

        Map<String, Object> realmAccess = jwt.getClaim("realm_access");
        if (realmAccess != null && realmAccess.get("roles") instanceof Collection<?> collection) {
            collection.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .forEach(roles::add);
        }

        return roles.stream()
                .distinct()
                .map(role -> role.startsWith("ROLE_") ? role : "ROLE_" + role)
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
