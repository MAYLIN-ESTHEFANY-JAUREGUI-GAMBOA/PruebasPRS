package pe.edu.vallegrande.caneteseguro.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerResponse;

/**
 * Inventory of exposed APIs (OWASP API9), served by the gateway itself.
 * Administrators only — see SecurityConfig.
 */
@Configuration
public class ApiInventoryRouteConfig {

    @Bean
    public RouterFunction<ServerResponse> apiInventoryRoute() {
        ClassPathResource inventory = new ClassPathResource("api-inventory.json");
        return RouterFunctions.route()
                .GET("/api/admin/inventory", request -> ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .bodyValue(inventory))
                .build();
    }
}
