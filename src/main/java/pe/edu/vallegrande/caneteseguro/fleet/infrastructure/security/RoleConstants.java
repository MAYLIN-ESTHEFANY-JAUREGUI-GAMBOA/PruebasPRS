package pe.edu.vallegrande.caneteseguro.fleet.infrastructure.security;

/**
 * Constantes de roles de seguridad para autorizaciones SpEL.
 */
public final class RoleConstants {

    private RoleConstants() {}

    public static final String SUPER_ADMIN = "SUPER_ADMIN";
    public static final String ADMIN = "ADMIN";
    public static final String MUNICIPALIDAD_ADMIN = "MUNICIPALIDAD_ADMIN";
    public static final String ENTIDAD_ADMIN = "ENTIDAD_ADMIN";
    public static final String OPERADOR_ENTIDAD = "OPERADOR_ENTIDAD";

    public static final String READ_ROLES = "hasAnyRole('SUPER_ADMIN', 'ADMIN', 'MUNICIPALIDAD_ADMIN', 'ENTIDAD_ADMIN', 'OPERADOR_ENTIDAD', 'CIUDADANO', 'ANALISTA', 'ANALISTA_ENTIDAD')";
    public static final String WRITE_ROLES = "hasAnyRole('SUPER_ADMIN', 'ADMIN', 'MUNICIPALIDAD_ADMIN', 'ENTIDAD_ADMIN', 'OPERADOR_ENTIDAD')";
}
