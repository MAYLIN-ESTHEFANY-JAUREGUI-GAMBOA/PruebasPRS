# Configuración y despliegue de reportes

## Variables de reporte (§14)

Versionadas en `frontend/web/.env.example`; se pasan como `--build-arg` al `Dockerfile`, que las inyecta con `ng build --define` (`src/app/core/config/report-config.ts`).

| Variable | Uso | Por defecto |
| --- | --- | --- |
| `REPORT_LOGO_URL` | Logo de la plataforma (SUPER_ADMIN o municipalidad sin logo) | vacío = escudo SVG embebido |
| `REPORT_HEADER_COLOR` | Color institucional de cabecera (PDF, Excel, impresión) | `#1E5BA1` |
| `REPORT_PDF_FOOTER` | Pie del PDF (`{X}` página, `{Y}` total) | `Página {X} de {Y}` |

```bash
docker build --build-arg REPORT_HEADER_COLOR=#1E5BA1 --build-arg "REPORT_PDF_FOOTER=Página {X} de {Y}" -t canete-web .
```

## Patrón de plantilla y recursos (§16): **B — assets en el frontend**

La plantilla (membrete, colores, pie, logo de la plataforma) vive en el bundle. El logo de la municipalidad no es un recurso de la plantilla: es un dato del tenant (`logoUrl`) que se descarga en el navegador al generar.

- Logos de municipalidades: cuenta Cloudinary de auth, carpeta `municipalidades/logos`, subida firmada por `vg-ms-municipalidades`.
- Se piden transformados `f_png,w_256` (PNG ≤ 256 px, < 200 KB).
- Se valida `res.ok` y `content-type: image/*`; si falla, se usa el logo de la plataforma.

## Rutas usadas

Las mismas rutas `/api/...` del gateway que usa la pantalla, más `GET /api/municipalities/public/{id}` (pública) para el membrete. No hay endpoints de descarga.

## Bundle

`jspdf`, `jspdf-autotable`, `exceljs` y `file-saver` quedan en chunks diferidos. Revisar `ng build` (Initial total) en cada PR.
