package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.support.WebExchangeBindException;
import org.springframework.web.server.ResponseStatusException;
import pe.edu.vallegrande.caneteseguro.fleet.domain.exception.DomainException;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Global Exception Handler matching the strict standard defined in AGENTS.md:
 * Response structure: timestamp, status, error, message, and optionally errors.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(DomainException.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleDomain(DomainException ex) {
        log.warn("Domain exception: {}", ex.getMessage());
        String msg = (ex.getMessage() != null && !ex.getMessage().isBlank()) ? ex.getMessage() : "Domain business rule violation";
        return Mono.just(buildResponse(HttpStatus.BAD_REQUEST, "Bad Request", msg));
    }

    @ExceptionHandler(WebExchangeBindException.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleValidation(WebExchangeBindException ex) {
        log.warn("Validation error: {}", ex.getMessage());
        Map<String, String> fieldErrors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach(error -> {
            String field = ((FieldError) error).getField();
            String message = error.getDefaultMessage();
            fieldErrors.put(field, message);
        });

        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("error", "Validation Failed");
        body.put("message", "Validation constraints failed");
        body.put("errors", fieldErrors);

        return Mono.just(ResponseEntity.badRequest().body(body));
    }

    @ExceptionHandler(AuthenticationException.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleAuthentication(AuthenticationException ex) {
        log.warn("Authentication failure: {}", ex.getMessage());
        return Mono.just(buildResponse(HttpStatus.UNAUTHORIZED, "Unauthorized", ex.getMessage() != null ? ex.getMessage() : "Authentication required"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleAccessDenied(AccessDeniedException ex) {
        log.warn("Access denied: {}", ex.getMessage());
        return Mono.just(buildResponse(HttpStatus.FORBIDDEN, "Forbidden", ex.getMessage() != null ? ex.getMessage() : "Access denied"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity conflict: {}", ex.getMessage());
        return Mono.just(buildResponse(HttpStatus.CONFLICT, "Conflict", "Data integrity violation in database"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleResponseStatus(ResponseStatusException ex) {
        log.warn("Response status exception: {}", ex.getMessage());
        String reason = (ex.getReason() != null && !ex.getReason().isBlank()) ? ex.getReason() : "Resource processing error";
        return Mono.just(buildResponse(HttpStatus.resolve(ex.getStatusCode().value()), ex.getStatusCode().toString(), reason));
    }

    @ExceptionHandler(Exception.class)
    public Mono<ResponseEntity<Map<String, Object>>> handleGeneric(Exception ex) {
        log.error("Unhandled error: {}", ex.getMessage(), ex);
        return Mono.just(buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", "An unexpected error occurred"));
    }

    private ResponseEntity<Map<String, Object>> buildResponse(HttpStatus status, String error, String message) {
        HttpStatus finalStatus = status != null ? status : HttpStatus.INTERNAL_SERVER_ERROR;
        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", finalStatus.value());
        body.put("error", error);
        body.put("message", message);
        return ResponseEntity.status(finalStatus).body(body);
    }
}
