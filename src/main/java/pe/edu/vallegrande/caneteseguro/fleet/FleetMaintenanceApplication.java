package pe.edu.vallegrande.caneteseguro.fleet;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.mongodb.config.EnableReactiveMongoAuditing;

/**
 * Microservicio de Flota y Mantenimiento.
 */
@SpringBootApplication
@EnableReactiveMongoAuditing
public class FleetMaintenanceApplication {

    public static void main(String[] args) {
        SpringApplication.run(FleetMaintenanceApplication.class, args);
    }
}

