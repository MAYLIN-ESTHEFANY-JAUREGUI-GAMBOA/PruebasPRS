package pe.edu.vallegrande.caneteseguro.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;


@Configuration
public class CorsConfig {

    private static final List<String> DEFAULT_ORIGIN_PATTERNS = List.of(
            "http://localhost:*",
            "http://127.0.0.1:*",
            "https://lab.vallegrande.edu.pe",
            "https://*.vallegrande.edu.pe"
    );

    private static final List<String> ALLOWED_METHODS = List.of(
            "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"
    );

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${CORS_ALLOWED_ORIGINS:}") String corsAllowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(resolveOriginPatterns(corsAllowedOrigins));
        config.setAllowedMethods(ALLOWED_METHODS);
        config.setAllowedHeaders(List.of(CorsConfiguration.ALL));
        config.setExposedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_DISPOSITION));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public CorsWebFilter corsWebFilter(CorsConfigurationSource corsConfigurationSource) {
        return new CorsWebFilter(corsConfigurationSource);
    }

    static List<String> resolveOriginPatterns(String csvFromEnv) {
        Set<String> merged = new LinkedHashSet<>(DEFAULT_ORIGIN_PATTERNS);

        if (csvFromEnv != null && !csvFromEnv.isBlank()) {
            Arrays.stream(csvFromEnv.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .map(CorsConfig::toOriginPattern)
                    .filter(s -> !s.isBlank())
                    .forEach(merged::add);
        }

        return List.copyOf(merged);
    }

    /**
     * Turns environment entries into a valid pattern or origin (no path in the Origin).
     */
    static String toOriginPattern(String value) {
        String trimmed = value.trim();
        if (!trimmed.contains("://")) {
            return trimmed;
        }
        int schemeEnd = trimmed.indexOf("://") + 3;
        int pathStart = trimmed.indexOf('/', schemeEnd);
        String originOnly = pathStart < 0 ? trimmed : trimmed.substring(0, pathStart);
        originOnly = originOnly.replaceAll("/$", "");

        if (originOnly.startsWith("http://localhost")) {
            return "http://localhost:*";
        }
        if (originOnly.startsWith("http://127.0.0.1")) {
            return "http://127.0.0.1:*";
        }
        return originOnly;
    }
}
