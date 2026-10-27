# Keycloak pre-compilado
FROM quay.io/keycloak/keycloak:26.2.4 AS build
ENV KC_DB=dev-file \
    KC_CACHE=local \
    KC_HEALTH_ENABLED=true \
    KC_FEATURES_DISABLED=impersonation,kerberos,device-flow,ciba,par,organization
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.2.4
COPY --from=build /opt/keycloak/ /opt/keycloak/
# Realm baked in: Dokploy raw compose has no ./keycloak/realm on disk, so the bind mount comes up empty.
COPY realm/ /opt/keycloak/realm-seed/
