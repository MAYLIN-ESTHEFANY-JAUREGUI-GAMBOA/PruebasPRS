package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuración OpenAPI 3.0 / Swagger UI según estándar PR241.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Fleet Maintenance API - PRS Cañete Seguro")
                        .version("1.0.0")
                        .description("Transactional Microservice for Fleet Maintenance and Claims Management")
                        .contact(new Contact()
                                .name("Angelina Napaico")
                                .email("angelina.napaico.valencia@vallegrande.edu.pe")))
                .addSecurityItem(new SecurityRequirement().addList("BearerAuth"))
                .schemaRequirement("BearerAuth", new SecurityScheme()
                        .name("BearerAuth")
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT"));
    }
}
