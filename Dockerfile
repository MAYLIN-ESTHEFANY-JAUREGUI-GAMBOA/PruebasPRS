# Build: corre nativo en la máquina que compila (el jar sirve para amd64 y arm64).
# La caché de ~/.m2 persiste entre builds: las dependencias se descargan una sola vez.
FROM --platform=$BUILDPLATFORM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
COPY src src
RUN --mount=type=cache,target=/root/.m2 mvn -q -B -DskipTests package

# Runtime: JRE Alpine multi-arquitectura (~70 MB), sin root.
FROM bellsoft/liberica-openjre-alpine:17
COPY --from=build /build/target/*.jar /app.jar
USER nobody
EXPOSE 9012
ENTRYPOINT ["java", "-jar", "/app.jar"]
