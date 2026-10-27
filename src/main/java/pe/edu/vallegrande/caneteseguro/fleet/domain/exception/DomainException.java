package pe.edu.vallegrande.caneteseguro.fleet.domain.exception;

/**
 * Excepción de dominio para violaciones de reglas de negocio e invariantes.
 * Libre de dependencias con Spring o frameworks HTTP según estándar PR241.
 */
public class DomainException extends RuntimeException {

    public DomainException(String message) {
        super(message);
    }

    public DomainException(String message, Throwable cause) {
        super(message, cause);
    }
}
