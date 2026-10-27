package pe.edu.vallegrande.caneteseguro.gateway.exception;

import pe.edu.vallegrande.caneteseguro.gateway.filter.RequestAuditFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebExceptionHandler;
import reactor.core.publisher.Mono;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeoutException;

/**
 * The gateway's own errors, with the same body the services use: {@code {error, message, status}}.
 * Service down or slow → 503; no route → 404; anything else → 500 without internal details.
 * Runs before Spring Boot's default handler (order -1).
 */
@Component
@Order(-2)
public class GatewayExceptionHandler implements WebExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GatewayExceptionHandler.class);

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        if (exchange.getResponse().isCommitted()) {
            return Mono.error(ex);
        }
        HttpStatusCode status = resolveStatus(ex);
        String message = status.value() == 503
                ? "Servicio no disponible. Intente más tarde."
                : status.is5xxServerError() ? "Error interno del gateway" : reason(ex, status);
        if (status.is5xxServerError()) {
            log.error("Error en {} {} requestId={}: {}", exchange.getRequest().getMethod(), exchange.getRequest().getPath(),
                    exchange.getAttributeOrDefault(RequestAuditFilter.ATTR_REQUEST_ID, "-"), ex.toString());
        }

        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        byte[] body = ("{\"error\":\"" + escape(message) + "\",\"message\":\"" + escape(message)
                + "\",\"status\":" + status.value() + "}").getBytes(StandardCharsets.UTF_8);
        return exchange.getResponse().writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(body)));
    }

    static HttpStatusCode resolveStatus(Throwable ex) {
        if (ex instanceof ResponseStatusException rse) {
            return rse.getStatusCode();
        }
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof ConnectException || t instanceof UnknownHostException || t instanceof TimeoutException) {
                return HttpStatus.SERVICE_UNAVAILABLE;
            }
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private static String reason(Throwable ex, HttpStatusCode status) {
        if (ex instanceof ResponseStatusException rse && rse.getReason() != null) {
            return rse.getReason();
        }
        HttpStatus known = HttpStatus.resolve(status.value());
        return known != null ? known.getReasonPhrase() : "Error";
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
