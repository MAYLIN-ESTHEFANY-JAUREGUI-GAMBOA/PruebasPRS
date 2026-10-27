# Pruebas de carga con Apache JMeter

El plan `flota-ordenes.jmx` consulta `GET /api/v1/maintenance-orders`. Es una lectura segura para medir el servicio sin crear órdenes ni modificar datos. Requiere el backend levantado y un token JWT autorizado para lectura.

## Escenarios propuestos

Ejecute cada escenario por separado, conservando la duración y el endpoint para comparar resultados:

| Escenario | Usuarios concurrentes | Ramp-up | Duración | Interpretación |
|---|---:|---:|---:|---|
| Verde | 5 | 10 s | 60 s | Carga baja; establecer latencia y throughput base |
| Amarillo | 20 | 20 s | 120 s | Carga media; observar crecimiento de latencia y errores |
| Rojo | 50 | 30 s | 120 s | Estrés controlado; detectar saturación, errores y recuperación |

Son valores iniciales para laboratorio, no objetivos de capacidad ni garantías. Coordine la prueba y no la ejecute contra producción. Puede ajustar usuarios y duración según los recursos disponibles.

## Ejecución en Windows

Instale Apache JMeter 5.6.x y configure un token de prueba en la sesión actual de PowerShell (no lo escriba en archivos ni lo comparta):

```powershell
$env:JMETER_TOKEN = "TOKEN_DE_PRUEBA"
$token = $env:JMETER_TOKEN

jmeter -n -t .\load-tests\flota-ordenes.jmx -Jhost=localhost -Jport=9012 -Jtoken=$token -Jusers=5 -JrampUp=10 -Jduration=60 -l .\target\jmeter-verde.jtl -e -o .\target\jmeter-verde
jmeter -n -t .\load-tests\flota-ordenes.jmx -Jhost=localhost -Jport=9012 -Jtoken=$token -Jusers=20 -JrampUp=20 -Jduration=120 -l .\target\jmeter-amarillo.jtl -e -o .\target\jmeter-amarillo
jmeter -n -t .\load-tests\flota-ordenes.jmx -Jhost=localhost -Jport=9012 -Jtoken=$token -Jusers=50 -JrampUp=30 -Jduration=120 -l .\target\jmeter-rojo.jtl -e -o .\target\jmeter-rojo
```

Cada corrida genera un `.jtl` y un reporte HTML. Use un directorio de salida distinto por corrida. Si obtiene 401/403, primero corrija el token/roles: esa corrida no mide satisfactoriamente la consulta del negocio.

## Qué reportar e interpretar

Registre para cada escenario el promedio, mediana, percentiles 90/95/99, throughput (solicitudes/s), porcentaje y tipo de errores, y uso de CPU/memoria del contenedor. Compare cómo varían al aumentar usuarios; no concluya que el sistema soporta más carga solo por completar una corrida.

- **Verde:** sirve como línea base; valide que no haya errores y anote la latencia habitual.
- **Amarillo:** compare throughput y percentiles con verde; un aumento pronunciado de latencia o errores puede indicar contención.
- **Rojo:** identifique el punto donde crecen errores/latencia o cae el throughput; documente si el servicio se recupera al terminar la carga.

No invente resultados: complete la tabla con los valores observados en JMeter y adjunte capturas de los reportes generados.
