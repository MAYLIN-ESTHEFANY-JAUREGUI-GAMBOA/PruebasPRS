package pe.edu.vallegrande.caneteseguro.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;

import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** auth / users / penalties / municipalities routes rewrite to each service's /api/v1. */
@SpringBootTest
class GatewayApplicationTests {

    @Autowired
    private RouteDefinitionLocator routeLocator;

    @Test
    void rutasReescribenAApiV1() {
        Map<String, String> rewrites = routeLocator.getRouteDefinitions()
                .collectMap(RouteDefinition::getId, route -> route.getFilters().stream()
                        .filter(f -> f.getName().equals("RewritePath"))
                        .map(f -> String.join(" -> ", f.getArgs().values()))
                        .collect(Collectors.joining()))
                .block();

        assertEquals("/api/auth/(?<segment>.*) -> /api/v1/auth/${segment}", rewrites.get("vg-ms-auth-core"));
        assertEquals("/api/auth/admin/(?<segment>.*) -> /api/v1/admin/${segment}", rewrites.get("vg-ms-usuarios-admin"));
        assertEquals("/api/auth/entity/(?<segment>.*) -> /api/v1/entity/${segment}", rewrites.get("vg-ms-usuarios-entidad"));
        assertEquals("/api/auth/(?<segment>.*) -> /api/v1/auth/${segment}", rewrites.get("vg-ms-usuarios-profile"));
        assertEquals("/api/auth/admin/(?<segment>.*) -> /api/v1/admin/${segment}", rewrites.get("vg-ms-castigos-historial"));
        assertEquals("/api/auth/admin/(?<segment>.*) -> /api/v1/admin/${segment}", rewrites.get("vg-ms-castigos-admin-usuarios"));
        assertEquals("/api/municipalities(?<segment>.*) -> /api/v1/municipalities${segment}", rewrites.get("vg-ms-municipalidades"));
    }
}
