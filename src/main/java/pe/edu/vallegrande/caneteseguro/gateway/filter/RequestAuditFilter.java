package pe.edu.vallegrande.caneteseguro.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Correlation id and audit log (SEC-019). Runs before Spring Security (-100) to also cover 401/403.
 * {@code X-Request-Id} travels to the services and comes back in the response. Writes and every
 * error are logged (who, what, result), without query string or personal data: the user is logged by uid.
 */
@Component
@Order(-200)
public class RequestAuditFilter implements WebFilter {

    public static final String HDR_REQUEST_ID = "X-Request-Id";
    public static final String ATTR_REQUEST_ID = "audit.requestId";
    static final String ATTR_USER = "audit.uid";
    static final String ATTR_MID = "audit.mid";

    private static final Logger log = LoggerFactory.getLogger(RequestAuditFilter.class);
    private static final Pattern VALID_ID = Pattern.compile("[A-Za-z0-9-]{8,64}");
    private static final Set<HttpMethod> WRITES = Set.of(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE);

    @Override
    public Mono<Void> filter(ServerWebExchange original, WebFilterChain chain) {
        String incoming = original.getRequest().getHeaders().getFirst(HDR_REQUEST_ID);
        String requestId = incoming != null && VALID_ID.matcher(incoming).matches() ? incoming : UUID.randomUUID().toString();
        ServerWebExchange exchange = original.mutate()
                .request(req -> req.headers(h -> h.set(HDR_REQUEST_ID, requestId)))
                .build();
        exchange.getAttributes().put(ATTR_REQUEST_ID, requestId);
        exchange.getResponse().getHeaders().set(HDR_REQUEST_ID, requestId);
        long start = System.nanoTime();
        return chain.filter(exchange).doFinally(signal -> audit(exchange, requestId, start));
    }

    /** Stores the token's uid (not DNI) and municipality for the audit line. */
    public static void recordUser(ServerWebExchange exchange, Jwt jwt) {
        String uid = jwt.getClaimAsString("uid");
        exchange.getAttributes().put(ATTR_USER, uid != null && !uid.isBlank() ? uid : jwt.getSubject());
        String mid = jwt.getClaimAsString("mid");
        if (mid != null && !mid.isBlank()) {
            exchange.getAttributes().put(ATTR_MID, mid);
        }
    }

    private static void audit(ServerWebExchange exchange, String requestId, long start) {
        HttpMethod method = exchange.getRequest().getMethod();
        HttpStatusCode status = exchange.getResponse().getStatusCode();
        int code = status == null ? 200 : status.value();
        if (!WRITES.contains(method) && code < 400) {
            return;
        }
        log.info("audit requestId={} method={} path={} status={} ms={} uid={} mid={}",
                requestId, method, exchange.getRequest().getPath().value(), code,
                (System.nanoTime() - start) / 1_000_000,
                exchange.getAttributeOrDefault(ATTR_USER, "-"), exchange.getAttributeOrDefault(ATTR_MID, "-"));
    }
}
