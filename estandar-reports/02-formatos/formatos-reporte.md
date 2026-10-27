# Formatos de reporte

## Motores

| Formato | Motor | Import |
| --- | --- | --- |
| PDF | `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.8 | dinámico (`await import('jspdf')`) |
| XLSX | `exceljs` ^4.4.0 | dinámico (`await import('exceljs')`) |
| Descarga | `file-saver` ^2.0.5 vía `download.util.ts` | dinámico |
| HTML imprimible | Plantilla + `window.print()` | — |

No se usa: iText 2.x, JasperReports, flying-saucer, generación server-side, microservicio central de reportes.

**Justificación XLSX (exceljs en lugar de SheetJS):** el estándar exige en Excel la primera fila en negrita y la cabecera con fondo sólido (§7). SheetJS Community no escribe estilos; exceljs sí, es client-side y se carga solo al exportar. El cambio vive solo en el adaptador `ReportExcelService`: los servicios de dominio y los componentes no cambian (§4, principio O/L).

## Catálogo por módulo

| Módulo | Reporte | Audiencia | Formatos | Criterio |
| --- | --- | --- | --- | --- |
| Recursos operativos | Listado de recursos | Admin / analista | PDF · XLSX | Tabular: PDF para archivar, XLSX para analizar |
| Emergencias / Incidents | Ficha individual de incidente | Admin / analista / entidad | PDF · XLSX | Documento firmable + bitácora analizable |
| Emergencias / Incidents | Listado de incidentes | Admin / analista / entidad | PDF · XLSX | Tabular: vista filtrada del lobby de emergencias |
| Sala de Crisis / Crisis Room | Transcripción de sala de crisis (chat) | Operador / entidad / admin | PDF · XLSX | Historial cronológico con roles, remitentes y metadatos |
| Asignación de patrullaje | Listado de subasignaciones | Admin / entidad | PDF · XLSX | Tabular |
| Catálogos | Catálogo por categoría | SUPER_ADMIN | PDF · XLSX | Tabular |
| Castigos | Sancionados, auditoría | Moderación | PDF · XLSX · HTML | Tabular + impresión |
| Castigos | Por nivel, expediente, resumen ejecutivo | Moderación / dirección | HTML imprimible | Documentos de lectura, se imprimen |
| Mantenimiento de Flota | Listado de órdenes de mantenimiento | Admin / entidad / analista | PDF · XLSX | Tabular: PDF con membrete institucional, XLSX con resumen métrico |

## Nomenclatura de archivos (única en el proyecto)

Patrón: `Nombre_Documento_{Placeholder}.ext` — palabras en PascalCase separadas por `_`.

| Reporte | Archivo |
| --- | --- |
| Recursos | `Reporte_Recursos_Operativos_{YYYY-MM-DD}.pdf/.xlsx` |
| Incidente (Ficha) | `Reporte_Incidente_{Codigo}.pdf/.xlsx` |
| Incidentes (Listado) | `Reporte_Incidentes_{YYYY-MM-DD}.pdf/.xlsx` |
| Sala de Crisis (Chat) | `Reporte_SalaCrisis_{Codigo}_{Sala}_{YYYY-MM-DD}.pdf/.xlsx` |
| Patrullaje | `Reporte_Asignaciones_Patrullaje_{YYYY-MM-DD}.pdf/.xlsx` |
| Catálogos | `Reporte_Catalogos_{Categoria}_{YYYY-MM-DD}.pdf/.xlsx` |
| Sancionados | `Reporte_Ciudadanos_Sancionados_{YYYY-MM-DD}.pdf/.xlsx` |
| Auditoría | `Reporte_Auditoria_Moderacion_{YYYY-MM-DD}.pdf/.xlsx` |
| Mantenimiento Flota | `Reporte_Mantenimiento_Flota_{YYYY-MM-DD}.pdf/.xlsx` |

Implementación: `nombreArchivoReporte(documento, ext, placeholder)` en `src/app/shared/reports/report-format.ts`.

## Estructura del documento

| Elemento | PDF | XLSX |
| --- | --- | --- |
| Encabezado | Banda `REPORT_HEADER_COLOR` con logo del tenant, institución, título, fecha ISO y autor | Fila 1 de cada hoja de datos en negrita, texto blanco sobre `REPORT_HEADER_COLOR`, fija y con autofiltro; hoja `Resumen` con institución, título, fecha, autor, total y filtros |
| Filtros | Línea "Filtros — …" bajo el membrete | Filas en `Resumen` |
| Cuerpo | `autoTable` tema `striped`, cabecera `REPORT_HEADER_COLOR` | `Detalle` (o el nombre del dominio) + `Resumen` |
| Pie | `Cañete Seguro · Sistema de Gestión de Seguridad Ciudadana` + `REPORT_PDF_FOOTER` | — |
| Fechas | `YYYY-MM-DD HH:mm` | igual |
| Vacíos | `—` | celda vacía |
