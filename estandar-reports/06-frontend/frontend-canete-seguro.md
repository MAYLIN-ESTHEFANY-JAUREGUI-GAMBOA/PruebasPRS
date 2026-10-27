# Frontend — Cañete Seguro (Angular 21)

## Módulos con reporte

| Página / Componente | Servicios de reporte (English) | Botones |
| --- | --- | --- |
| `pages/recursos-operativos` | `RecursoPdfService`, `RecursoExcelService` | PDF · Excel |
| `features/microservices/incidents` (Lobby & Detalle) | `IncidentPdfService`, `IncidentExcelService` (`core/reports/incidents`) | Exportar (Ficha) / Exportar lista (Lobby) |
| `components/incident-communications` (Sala de Crisis) | `CrisisRoomPdfService`, `CrisisRoomExcelService` (`core/reports/crisis-room`) | Exportar (PDF / Excel) |
| `pages/asignacion-patrullaje` | `SubasignacionPdfService`, `SubasignacionExcelService` | Excel · PDF |
| `pages/catalogos` | `CatalogoPdfService`, `CatalogoExcelService` | PDF · Excel (tab activa) |
| `pages/castigos` (`castigos-reportes`) | `CastigoPdfService`, `CastigoExcelService` + HTML imprimible | Generar e imprimir · PDF · Excel |
| `features/microservices/flota-mantenimiento` | `FlotaPdfService`, `FlotaExcelService` (`core/reports/flota`) | PDF · Excel |

## Modelos

DTO tipado por dominio en `core/reports/<dominio>/<dominio>-report.model.ts` (`incident-report.model.ts`, `crisis-room-report.model.ts`, `recurso-reporte.model.ts`, etc.). Sin `any`.

Nomenclatura técnica 100% en inglés para carpetas y archivos en incidentes y crisis-room:
- `core/reports/incidents/` (`incident-pdf.service.ts`, `incident-excel.service.ts`, `incident-report.model.ts`, `incident-report.spec.ts`)
- `core/reports/crisis-room/` (`crisis-room-pdf.service.ts`, `crisis-room-excel.service.ts`, `crisis-room-report.model.ts`, `crisis-room-report.spec.ts`)

## Permisos (ver vs exportar)

- **Ver** el listado: guards de ruta del rol de la página (sin cambios).
- **Exportar**: `PermissionConstants.REPORTS_EXPORT` = `SUPER_ADMIN`, `MUNICIPALIDAD_ADMIN`, `ENTIDAD_ADMIN`, `ANALISTA`. Sin ese rol no se muestran los botones (`puedeExportar`).
- El tenant sale del JWT (`mid`/`eid`); el backend filtra los datos.

## Convenciones

- El componente entrega filas DTO y filtros; nunca define columnas ni dibuja.
- `[disabled]` sin datos o mientras genera; ícono girando + "Generando…".
- Fechas con `fechaHoraIso`; nulos como `—`.

## Pruebas

Pruebas unitarias de modelos de reporte:
- `src/app/core/reports/incidents/incident-report.spec.ts`
- `src/app/core/reports/crisis-room/crisis-room-report.spec.ts`
- `src/app/core/reports/flota/flota-reporte.spec.ts`
- `src/app/shared/reports/report.spec.ts`

```bash
npx ng test --watch=false
```
