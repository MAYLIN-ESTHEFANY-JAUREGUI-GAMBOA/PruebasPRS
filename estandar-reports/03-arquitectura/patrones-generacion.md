# Patrones de generación

## Reporte tabular (un formato por servicio)

```ts
// core/reports/recurso/recurso-reporte.model.ts — columnas y título viven aquí
export function reporteRecursos(filas: RecursoReporteFila[], filtros: RecursoReporteFiltros): ReporteTabla { … }

// recurso-pdf.service.ts
generarPdf(filas, filtros) { return this.pdf.generar(reporteRecursos(filas, filtros)); }

// componente: solo datos + estado
await this.recursoPdf.generarPdf(this.filasReporte(), this.filtrosReporte());
```

## PDF de varias secciones (incidente)

```ts
const pdf = await this.pdf.abrir(titulo, filtros);          // membrete
this.pdf.tabla(pdf, { columnas: DETALLE, filas });          // sección 1
this.pdf.tabla(pdf, { columnas: BITACORA, filas });         // sección 2
await this.pdf.cerrar(pdf, 'Reporte_Incidente', codigo);    // pie + descarga
```

## XLSX

`ReportExcelService.generar(reporte)` → hoja de datos (cabecera en negrita sobre `REPORT_HEADER_COLOR`, fila fija, autofiltro) + `Resumen`. Varias hojas: `libro(titulo, filtros, hojas, documento, placeholder)`. `construir(...)` devuelve el `Workbook` sin descargar (para pruebas).

## HTML imprimible (castigos)

Ventana con el mismo membrete y colores; pie con `@page` (`counter(page)` / `counter(pages)`). Todo dato del usuario se escapa con `esc()` antes de `document.write`.

## Estado de la UI

Botón `[disabled]` sin datos o mientras genera; ícono girando + "Generando…" durante la generación; toast de éxito o error.

## Estrategia de imports

- Prohibido importar estáticamente `jspdf`, `jspdf-autotable`, `exceljs` o `file-saver`.
- Tipos con `import type`; motores con `await import(...)`.
- Medido: bundle inicial 2.58 MB → 1.66 MB.
