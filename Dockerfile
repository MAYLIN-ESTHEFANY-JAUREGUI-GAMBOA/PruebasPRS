# Panel web Angular (estático + nginx)
#
#   cd frontend/web
#   docker build -t andrehermoza/canete-seguro-web:1.0 .
#   docker push andrehermoza/canete-seguro-web:1.0
#
# Dokploy / Traefik:
#   - Path público:  /web-seguro-app
#   - Puerto contenedor: 8080  (mobile usa 80 → sin cruce)
#
# El build Angular tarda ~1-3 min; no canceles con Ctrl+C.

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund

COPY . .

ARG NG_APP_API_URL=https://lab.vallegrande.edu.pe/canete-seguro
ARG NG_APP_BASE_HREF=/web-seguro-app/
ENV NG_APP_API_URL=${NG_APP_API_URL}
ENV CI=true
ENV NODE_OPTIONS=--max-old-space-size=3072

# Variables de reporte (estándar AS241S6 §14); vacías = valores de marca del código
ARG REPORT_LOGO_URL=
ARG REPORT_HEADER_COLOR=#1E5BA1
ARG REPORT_PDF_FOOTER="Página {X} de {Y}"

# SPA estática (sin SSR en runtime); base-href = path público en Traefik
RUN npm run build:docker -- --base-href="${NG_APP_BASE_HREF}" \
      --define "NG_APP_REPORT_LOGO_URL='${REPORT_LOGO_URL}'" \
      --define "NG_APP_REPORT_HEADER_COLOR='${REPORT_HEADER_COLOR}'" \
      --define "NG_APP_REPORT_PDF_FOOTER='${REPORT_PDF_FOOTER}'"

# Alias para healthcheck y fallback nginx
RUN cp dist/canete-seguro/browser/index.csr.html dist/canete-seguro/browser/index.html

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/canete-seguro/browser /usr/share/nginx/html

# 8080 = panel web | mobile = 80 en su imagen
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/web-seguro-app/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
