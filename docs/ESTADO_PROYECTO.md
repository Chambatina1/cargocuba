# Transport Next — Estado del proyecto

## Objetivo
Convertir `cargocuba` en la aplicación independiente de transporte/logística de Chambatina, manteniendo `Plataformachambatina` fuera de riesgo. La aplicación se desplegará separadamente y luego Chambatina enlazará hacia ella mediante un botón/link.

## Regla de trabajo
- Desarrollo nuevo en la rama `transport-next` hasta validar build, datos y despliegue.
- No modificar ni desplegar `Plataformachambatina` como parte de este proyecto.
- No borrar la implementación anterior de Cargo Cuba antes de rescatar sus funciones útiles.
- No guardar secretos ni credenciales en Git.
- Cada avance importante debe actualizar este documento.

## Lo que ya existe en Cargo Cuba y debemos aprovechar
El historial confirma que ya hay una base logística valiosa: GPS en vivo del conductor, cálculo de distancias, optimización VRP, tracking con Socket.IO, panel de rutas, Route/RouteStop y autenticación de administración. Antes de reemplazar código se auditarán estas funciones para reutilizarlas.

## Producto objetivo
### Cliente
- Solicitar transporte/carga.
- Punto de origen y destino.
- Múltiples puntos de recogida.
- Almacén/descarga y destino final.
- Estado y seguimiento del servicio.

### Conductor
- Registro/login.
- Punto inicial y ubicación GPS actual.
- Viajes/rutas asignadas.
- Navegación por paradas.
- Inicio, recogida, entrega y finalización.

### Despacho / Administración
- Mapa operativo de conductores, clientes, recogidas, almacenes y destinos.
- Crear/asignar rutas.
- Optimización de múltiples paradas.
- Distancias y tiempos.
- Estados, historial y control de flota.

## UX
Mobile-first y utilizable desde iPhone/Android como web app. La APK antigua será referencia para recuperar diseño, pantallas y flujos cuando esté disponible para análisis. Se modernizará sin perder la lógica útil original.

## Mapas y rutas
Mantener una capa de proveedor desacoplada. Se podrá usar OpenStreetMap/Leaflet como base y conectar un proveedor de geocodificación/rutas de mayor precisión mediante variables de entorno, sin claves hardcodeadas.

## Despliegue
Objetivo: servicio independiente en Render y base de datos independiente. Después se conectará desde chambatina.com mediante un botón Transporte.

## Estado actual
- Repositorio seleccionado: `Chambatina1/cargocuba`.
- Rama segura creada: `transport-next`.
- Producción/main todavía no se reemplaza.
- Próximo paso: auditar estructura actual, rescatar módulos útiles y construir la nueva UX/lógica en esta rama.

## Próxima sesión
1. Leer este archivo primero.
2. Revisar los últimos commits de `transport-next`.
3. Continuar desde el último punto sin reiniciar el proyecto.
