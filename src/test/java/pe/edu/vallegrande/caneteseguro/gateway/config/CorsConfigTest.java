package pe.edu.vallegrande.caneteseguro.gateway.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CorsConfigTest {

    @Test
    void origenConPath_seRecortaAlOrigen() {
        assertEquals("https://lab.vallegrande.edu.pe", CorsConfig.toOriginPattern("https://lab.vallegrande.edu.pe/mobile-seguro-app/"));
        assertEquals("http://localhost:*", CorsConfig.toOriginPattern("http://localhost:4200"));
    }

    @Test
    void origenesDeEntorno_seSumanALosPorDefecto() {
        assertTrue(CorsConfig.resolveOriginPatterns("https://app.example.com").contains("https://app.example.com"));
        assertTrue(CorsConfig.resolveOriginPatterns("").contains("https://*.vallegrande.edu.pe"));
    }
}
