package pe.edu.vallegrande.caneteseguro.fleet.domain.vo;

/**
 * Estados del ciclo de vida operativo de una orden de mantenimiento.
 * Valores de catálogo en español para interoperabilidad del cluster PRS.
 */
public enum OrderStatus {
    REGISTRADA,
    EN_DIAGNOSTICO,
    EN_TALLER,
    EN_CONTROL_CALIDAD,
    FINALIZADA,
    CANCELADA
}
