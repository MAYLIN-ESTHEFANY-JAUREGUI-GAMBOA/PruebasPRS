package pe.edu.vallegrande.caneteseguro.fleet.domain.vo;

/**
 * Tipos de mantenimiento vehicular soportados.
 * Valores de catálogo en español para interoperabilidad del cluster PRS.
 */
public enum MaintenanceType {
    PREVENTIVO,
    CORRECTIVO,
    CORRECTIVO_ACCIDENTE,
    INSPECCION_REGLAMENTARIA
}
