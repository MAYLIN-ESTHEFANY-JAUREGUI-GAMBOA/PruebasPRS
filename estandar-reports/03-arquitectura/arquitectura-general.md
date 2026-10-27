# Arquitectura general

```mermaid
graph LR
    U[Usuario] --> C[Componente]
    C -->|GET + filtros, JWT| GW[Gateway /api/...]
    GW --> MS[Microservicio dueño<br/>TenantScope por mid/eid]
    MS -->|JSON| C
    C -->|filas DTO + filtros| DS[dominio-pdf / dominio-excel service]
    DS -->|ReporteTabla| AD[ReportPdfService / ReportExcelService]
    AD --> B[ReportBrandingService<br/>GET /api/municipalities/public/{mid}]
    AD -->|lazy import| M[jsPDF / exceljs]
    M --> DL[download.util → file-saver]
```

1. El componente ya tiene los datos de pantalla (del microservicio dueño, filtrados por tenant en el backend).
2. Los mapea a su DTO de reporte (`RecursoReporteFila`, …) con nombres ya resueltos y llama al servicio del dominio.
3. El servicio del dominio arma el `ReporteTabla` (columnas, título, nombre) y lo pasa al adaptador del formato.
4. El adaptador pide el membrete, carga el motor con import dinámico, dibuja y descarga. Nada viaja al servidor.

## Servicios por dominio (`src/app/core/reports/<dominio>/`)

| Dominio | Modelo (DTO + columnas) | PDF | Excel |
| --- | --- | --- | --- |
| Recurso | `recurso-reporte.model.ts` | `recurso-pdf.service.ts` | `recurso-excel.service.ts` |
| Incidente | `incidente-reporte.model.ts` | `incidente-pdf.service.ts` | `incidente-excel.service.ts` |
| Subasignación | `subasignacion-reporte.model.ts` | `subasignacion-pdf.service.ts` | `subasignacion-excel.service.ts` |
| Catálogo | `catalogo-reporte.model.ts` | `catalogo-pdf.service.ts` | `catalogo-excel.service.ts` |
| Castigo | `castigo-reporte.model.ts` | `castigo-pdf.service.ts` | `castigo-excel.service.ts` |

## Adaptadores comunes (`src/app/shared/reports/`)

| Archivo | Rol |
| --- | --- |
| `report.model.ts` | `ReporteTabla`, `Membrete`, `FiltroReporte`, `ColumnaReporte` |
| `report.constants.ts` | `ReportConstants` (desde `REPORT_*`) y `PermissionConstants` |
| `report-format.ts` | `nombreArchivoReporte`, `hoyIso`, `fechaHoraIso` |
| `download.util.ts` | `descargar(blob, nombre, mime)` |
| `report-branding.service.ts` | Membrete del tenant y `puedeExportar()` |
| `report-pdf.service.ts` | Adaptador PDF (jsPDF + autotable) |
| `report-excel.service.ts` | Adaptador XLSX (exceljs) |

Cambiar de motor es cambiar un adaptador: los servicios de dominio solo producen `ReporteTabla`.
