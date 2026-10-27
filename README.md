# vg-gateway-caneteseguro (vg-ms-api-gateway)

Punto de entrada único del backend **Cañete Seguro**: valida el access token de Keycloak (único emisor; RS256),
autoriza por rol todas las rutas de auth / usuarios / castigos / municipalidades (único lugar: `security/SecurityConfig`), propaga la identidad (`X-User-Id`, `X-User-Subject`, `X-User-Roles`,
`X-User-Eid`; las que envía el cliente se descartan) y enruta a cada microservicio.

**Stack:** Java 17 · Spring Boot 4 · Spring Cloud Gateway (WebFlux) · OAuth2 Resource Server

## Estructura

```text
pe.edu.vallegrande.caneteseguro.gateway/
├── GatewayApplication.java
├── config/      # CorsConfig, ApiInventoryRouteConfig (GET /api/admin/inventory definido en código)
├── filter/      # IdentityHeadersGatewayFilter (propaga identidad validada)
├── security/    # SecurityConfig (todas las rutas y roles), KeycloakRealmRoleConverter
└── exception/   # GatewayExceptionHandler: {error, message, status}; micro caído → 503
resources/application.yml   # rutas y configuración no secreta
```

Tests (`src/test/java/...`): reescritura de rutas a `/api/v1`, autorización por rol, filtro de identidad, CORS y errores.
`mvn test` (JDK 17).

| Servicio | Puerto (host) | Puerto (contenedor) |
|---|---|---|
| **API Gateway** | **9000** | 9000 (compose: 9100) |
| vg-ms-auth | 9001 (solo red Docker / debug) | 9001 |
| vg-ms-entidades | 9002 (solo red Docker / debug) | 9002 |

El frontend (Angular) debe usar solo: `http://localhost:9000`

Credenciales del gateway y de auth / usuarios / castigos / municipalidades: un solo `.env` en esta carpeta (plantilla `.env.example`).

---|---|---|
| **API Gateway** | **9000** | 9000 |
| vg-ms-auth | 9001 (solo red Docker / debug) | 9001 |
| vg-ms-entidades | 9002 (solo red Docker / debug) | 9002 |

El frontend (Angular) debe usar solo: `http://localhost:9000`

## Inventario de APIs (OWASP API9)

- Documento: [../../docs/API9-INVENTARIO-PRS.md](../../docs/API9-INVENTARIO-PRS.md)
- Manifest JSON: `src/main/resources/api-inventory.json`
- Consulta runtime (ADMIN): `GET /api/admin/inventory`

**Pruebas con Postman:** ver [GUIA-PRUEBAS.md](./GUIA-PRUEBAS.md) e importar [postman/Canete-Seguro-Backend.postman_collection.json](./postman/Canete-Seguro-Backend.postman_collection.json).

---

## Opción A — Docker Compose (recomendado)

Desde **esta carpeta** (`vg-ms-api-gateway`):

Imágenes por defecto:

| Servicio | Imagen |
|----------|--------|
| Entidades | `andrehermoza/vg-ms-entidades:1.0` |
| Auth | `andrehermoza/vg-ms-auth:1.0` |
| Gateway | `andrehermoza/vg-ms-api-gateway:1.0` |

Puedes cambiar el tag en `.env` (`VG_MS_*_IMAGE`).

**Arranque del gateway:** si ves `SimpleDiscoveryClientAutoConfiguration` o `ServerProperties` en el log, la imagen es antigua. Este proyecto usa Spring Cloud BOM **2025.1.0** (compatible con Spring Boot 4). Reconstruye la imagen `vg-ms-api-gateway` desde este `pom.xml` y vuelve a publicarla.

### 3. Verificar que responde

**Health interno de entidades** (desde otra terminal, si expones el puerto — opcional):

```powershell
# Solo si mapeas 9002 en compose para debug; por defecto entidades no publica puerto en el host
```

**Prueba vía gateway (puerto 9000):**

```powershell
# Login entidad (RUC) — reemplaza la contraseña por la que usaste al crear la entidad
curl -X POST http://localhost:9000/api/auth/login/entidad `
  -H "Content-Type: application/json" `
  -d "{\"ruc\":\"20987654321\",\"password\":\"TU_PASSWORD\"}"
```

Respuesta esperada: JSON con `token`, `roles` (incluye `ENTIDAD_ADMIN`), `entidadId`, `ruc`, etc.

```powershell
# Login operador (DNI) — usuario con entidad_perteneciente_id y rol OPERADOR_ENTIDAD
curl -X POST http://localhost:9000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"dni\":\"12345678\",\"password\":\"TU_PASSWORD\",\"contexto\":\"PANEL_ENTIDAD\"}"
```

```powershell
# Perfil (con token del login anterior)
curl http://localhost:9000/api/auth/profile `
  -H "Authorization: Bearer TU_TOKEN"
```

### 4. Detener

```powershell
docker compose down
```

---

## Opción B — Ejecución local con Maven (desarrollo)

Abre **3 terminales** en este orden:

```powershell
# Terminal 1 — Entidades (9002)
cd ..\vg-ms-entidades
mvn spring-boot:run

# Terminal 2 — Auth (9001)
cd ..\vg-ms-auth
mvn spring-boot:run

# Terminal 3 — Gateway (9000)
cd ..\vg-ms-api-gateway
mvn spring-boot:run
```

Mismas pruebas `curl` contra `http://localhost:9000`.

---

## Rutas del gateway

| Prefijo público | Destino |
|---|---|
| `/api/auth/login`, `/register`, `/registro/estado`, `/login/entidad`, `/login/operativo` | vg-ms-auth `/api/v1/auth/*` |
| `/api/cloudinary/signature-registro` | vg-ms-auth `/api/v1/auth/cloudinary/signature-registro` |
| `/api/auth/profile`, `/api/auth/castigo` | vg-ms-usuarios `/api/v1/auth/*` |
| `/api/auth/entidad/**` | vg-ms-usuarios `/api/v1/entidad/*` |
| `/api/auth/admin/**` | vg-ms-usuarios `/api/v1/admin/*` |
| `/api/auth/admin/usuarios/*/castigo`, `/api/auth/admin/castigos/**` | vg-ms-castigos `/api/v1/admin/*` |
| `/api/municipalidades/**` | vg-ms-municipalidades `/api/v1/municipalidades/*` (ADMIN; `GET /publico/{id}` público) |
| `/api/entidades/**` | vg-ms-entidades |

Rutas **públicas** (sin token): login, registro, estado de registro y firma de selfie (ver `SecurityConfig`).

El resto de `/api/**` exige header: `Authorization: Bearer <token>`. `/api/auth/admin/**` y `/api/admin/inventory` → ADMIN;
`/api/auth/entidad/**` → ADMIN / ENTIDAD_ADMIN / OPERADOR_ENTIDAD / ANALISTA_ENTIDAD.

---

## Datos del usuario en el token (Keycloak)

vg-ms-auth guarda en Keycloak los datos de cada cuenta en cada login/registro; el access token los trae como claims
(listos para mostrar quién está logueado). `eid` es la entidad (comisaría, bomberos, serenazgo…), no la municipalidad;
el tenant será el `id` de vg-ms-municipalidades.

| Cuenta (rol) | Claims |
|---|---|
| Ciudadano (`CIUDADANO`) | `given_name`, `family_name`, `name`, `email`, `dni`, `telefono`, `uid`, `roles`, `loginTipo=PERSONAL` |
| Super admin (`ADMIN`) | `given_name`, `family_name`, `name`, `email`, `dni`, `uid`, `roles` |
| Entidad (`ENTIDAD_ADMIN`, login RUC) | `given_name` = razón social de la entidad, `family_name` = tipo, `razonSocial`, `ruc`, `tipoEntidad`, `eid`, `uid`, `roles`, `loginTipo=INSTITUCIONAL` |
| Operador / analista (`OPERADOR_ENTIDAD`, `ANALISTA_ENTIDAD`) | datos personales + `eid`, `razonSocial`, `ruc`, `tipoEntidad` de su entidad |

Perfil del realm (`keycloak/user-profile.json`): nombres y apellidos obligatorios; email, DNI/RUC, teléfono e ids con formato
validado; los atributos de identidad y tenant solo los escribe un admin (vg-ms-auth). Email obligatorio en altas nuevas
(registro y creación por admin/entidad); las entidades aún no tienen email en vg-ms-entidades.
`VERIFY_PROFILE` activo: Keycloak no emite token a perfiles incompletos (auth responde 422 `PERFIL_INVALIDO`).

Keycloak ya desplegado (el import del realm solo corre la primera vez): ejecutar una vez
`KEYCLOAK_URL=... KEYCLOAK_ADMIN_USERNAME=... KEYCLOAK_ADMIN_PASSWORD=... sh keycloak/apply-user-profile.sh`.

## Publicar solo auth (compose antiguo)

Si solo necesitas el contenedor de auth aislado, usa `../vg-ms-auth/docker-compose.yml` (puerto **9001**).

Para el stack completo, usa siempre **este** `docker-compose.yml`.
