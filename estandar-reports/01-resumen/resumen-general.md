# Resumen general — Reportes de Cañete Seguro (PRS)

Estándar aplicado: **Guía de Estándares de Reportes AS241S6**.

## Alcance

Todos los reportes del panel web (`frontend/web`): recursos operativos, incidentes, asignaciones de patrullaje, catálogos y sanciones ciudadanas (castigos).

## Principios

| Principio | Cómo se cumple |
| --- | --- |
| El dueño del dato es el dueño del reporte | Cada reporte sale del endpoint REST del microservicio dueño; no hay microservicio de reportes. |
| Client-side por defecto | PDF (jsPDF + autotable) y XLSX (exceljs) se arman en el navegador. No hay generación server-side. |
| Lo que se ve es lo que se exporta | El componente exporta las mismas filas filtradas de la pantalla y los filtros se imprimen en el documento. |
| Una sola plantilla | Membrete, colores, pie y nombre de archivo se definen una vez en `src/app/shared/reports/`. |
| Tenant del JWT | El membrete y los datos dependen del claim `mid`; nunca de parámetros del body o del query. |

## Mapa de responsabilidades

| Pieza | Responsabilidad | No hace |
| --- | --- | --- |
| Componente (página) | Filtros, botones, spinner; entrega sus filas filtradas como DTO tipado | Columnas, estructura del documento |
| `core/reports/<dominio>/<dominio>-reporte.model.ts` | DTO del reporte, columnas, título, nombre de archivo | HTTP, dibujo |
| `<dominio>-pdf.service.ts` / `<dominio>-excel.service.ts` | Un formato por dominio sobre el adaptador común | HTTP |
| `ReportPdfService` / `ReportExcelService` | Adaptadores: membrete, tabla, estilos, pie | Reglas de dominio |
| `download.util.ts` | Descarga (file-saver) | — |
| `ReportBrandingService` | Logo e institución del tenant, permiso de exportar | Dibujar |
| `report-format.ts` | Nombre de archivo y fechas ISO-8601 | Lógica de dominio |
| Microservicio dueño | JSON filtrado por tenant (`TenantScope`) | Plantillas o formatos |

## Decisiones clave

- **Logo del reporte:** el de la municipalidad del usuario (claim `mid`), también para el personal de sus entidades. SUPER_ADMIN, o si el logo no carga, ve la marca de la plataforma (escudo de Cañete Seguro).
- **Catálogos** se migró de iText 7 + POI (server-side) al cliente: se quitó la única excepción y `vg-ms-catalogo` ya no empaqueta esos motores.
