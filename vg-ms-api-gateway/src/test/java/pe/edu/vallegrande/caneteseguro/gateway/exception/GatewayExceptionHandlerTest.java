package pe.edu.vallegrande.caneteseguro.gateway.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.net.ConnectException;
import java.net.UnknownHostException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GatewayExceptionHandlerTest {

    @Test
    void microCaido_503() {
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,
                GatewayExceptionHandler.resolveStatus(new RuntimeException(new ConnectException("refused"))));
    }

    @Test
    void microSinDns_503() {
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,
                GatewayExceptionHandler.resolveStatus(new RuntimeException(new UnknownHostException("vg-ms-x"))));
    }

    @Test
    void sinRuta_conservaStatus() {
        assertEquals(HttpStatus.NOT_FOUND,
                GatewayExceptionHandler.resolveStatus(new ResponseStatusException(HttpStatus.NOT_FOUND)));
    }

    @Test
    void desconocido_500() {
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, GatewayExceptionHandler.resolveStatus(new IllegalStateException()));
    }
}
