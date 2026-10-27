# Integración continua y pruebas - Flota Mantenimiento

## Jenkins, Slack y SonarQube

El `Jenkinsfile` compila el proyecto, ejecuta las pruebas unitarias, publica sus resultados JUnit, analiza el código con SonarQube y envía a Slack el resultado del pipeline.

### Requisitos de Jenkins

1. Configurar un agente con Java 17, Git y acceso de red al repositorio.
2. Instalar los plugins **Pipeline**, **JUnit**, **SonarQube Scanner for Jenkins** y **Slack Notification**.
3. En **Manage Jenkins → System**, registrar un servidor SonarQube con el nombre `SonarQube`. Configurar su URL y token en Jenkins; no poner el token en el repositorio.
4. Configurar la integración de Slack en el plugin y crear/autorizar la app de Jenkins en el workspace. El canal predeterminado es `#prs-ci`; edite `SLACK_CHANNEL` en el Jenkinsfile si el equipo usa otro.
5. Crear un Pipeline apuntando a este repositorio y ejecutar el job. La captura debe mostrar el resultado de Jenkins y la notificación recibida en Slack.

SonarQube recibe los informes de pruebas y cobertura JaCoCo. El proyecto se identifica como `vg-ms-flota-mantenimiento` en `sonar-project.properties`. En el panel revise **Quality Gate**, bugs, vulnerabilidades, code smells, cobertura, duplicación y deuda técnica. Interprete los valores reales de la corrida: no se presupone que el Quality Gate pase.

## Pruebas funcionales con Selenium

Las pruebas funcionales comprueban que las capacidades observables de un sistema se comportan según lo esperado mediante escenarios de entrada y salida. Selenium automatiza navegadores reales; WebDriver interactúa con la página como un usuario y permite validar contenido y navegación.

Este repositorio es un backend sin interfaz propia; por eso las dos pruebas Selenium verifican Swagger UI, su documentación pública de la API de órdenes:

| Prueba | Funcionalidad evaluada | Pasos | Resultado esperado |
|---|---|---|---|
| `swaggerUiCargaLaDocumentacion` | Disponibilidad de Swagger UI | Abrir `/swagger-ui.html` y esperar el contenedor de Swagger | La UI se renderiza y el título contiene `Swagger UI` |
| `swaggerUiPublicaLosEndpointsDeOrdenes` | Publicación de la API de órdenes en OpenAPI | Abrir Swagger UI y esperar la ruta `/api/v1/maintenance-orders` | La documentación muestra la ruta y la etiqueta de órdenes |

El resultado obtenido se registra después de correrlas; adjunte captura del navegador/reporte de pruebas y anote PASS/FAIL y cualquier error.

### Ejecutar Selenium localmente (Windows)

Requiere Java 17, Chrome instalado y el microservicio levantado en `http://localhost:9012`. Selenium Manager intenta resolver el ChromeDriver compatible al iniciar.

```powershell
.\mvnw.cmd -Pselenium verify
```

Para otra URL:

```powershell
.\mvnw.cmd -Pselenium verify "-Dselenium.baseUrl=http://localhost:9012"
```

Los resultados Failsafe quedan en `target\failsafe-reports`.

## Pruebas de carga con JMeter

El plan y los tres escenarios Verde/Amarillo/Rojo están definidos en [`load-tests/README.md`](./load-tests/README.md). Ejecute las pruebas contra un entorno no productivo, con un JWT de lectura válido. Registre percentiles de latencia, throughput, errores y recursos para cada escenario; agregue capturas de los reportes HTML de JMeter.

