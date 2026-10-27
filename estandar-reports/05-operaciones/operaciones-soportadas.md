# Operaciones soportadas

## Matriz de endpoints fuente

| Reporte | Endpoint fuente (gateway) | Microservicio dueño | Alcance por tenant |
| --- | --- | --- | --- |
| Recursos operativos | `GET /api/resources` | vg-ms-recursos | `TenantScope` (mid/eid del JWT) |
| Ficha de incidente | `GET /api/incidents/enriched/{id}` | vg-ms-incidentes | `IncidentTenantFilter` |
| Listado de incidentes | `GET /api/incidents/enriched` | vg-ms-incidentes | `IncidentTenantFilter` |
| Sala de crisis (Chat) | `GET /api/incidents/{id}/chat` (o `/chat/tactical`) | vg-ms-chat / vg-ms-incidentes | Por incidente / entidad aliada |
| Asignaciones de patrullaje | `GET /api/subassignments` | vg-ms-subasignacion | por recurso/entidad |
| Catálogos | `GET /api/catalogs` | vg-ms-catalogo | global (solo SUPER_ADMIN gestiona) |
| Sancionados / auditoría | `GET /api/auth/admin/users`, `GET /api/auth/admin/penalties/history` | vg-ms-auth / vg-ms-usuarios | moderación |
| Mantenimiento de Flota | `GET /api/v1/maintenance-orders` | vg-ms-flota-mantenimiento | Por entidad / municipalidad |
| Membrete | `GET /api/municipalities/public/{mid}` | vg-ms-municipalidades | `mid` del JWT |

## Reglas

- Sin datos: el botón queda deshabilitado; nunca se genera un documento vacío.
- Fuente caída: la pantalla muestra su error habitual; el reporte no se intenta.
- Logo caído: el reporte sale con el logo de la plataforma (degrada, no rompe).

## Pendientes

- Endpoints `/stats` (KPIs para ANALISTA) en incidentes y alertas.
- Castigos: "por nivel", "expediente" y "resumen ejecutivo" siguen solo en HTML imprimible.
- Permiso fino `reports:export` en Keycloak; hoy se resuelve por rol (ver frontend).
