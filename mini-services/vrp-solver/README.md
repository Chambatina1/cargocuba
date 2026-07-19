# vrp-solver (mini-servicio)

Optimizador **VRP de ultima milla** para cargocuba. Recibe vehicles + stops y devuelve
rutas optimizadas (secuencia, distancia, duracion, ETA por parada).

## Motor

1. **Google OR-Tools** (binding nativo `node_or_tools`) — si esta instalado y compila.
2. **Fallback savings-TS** (`src/savings-solver.ts`) — Clarke-Wright + 2-opt + nearest-neighbor,
   sin dependencias nativas. Garantizado que funciona en cualquier entorno.

El servidor detecta en runtime cual esta disponible y lo reporta en `/health`.

## API

### `POST /solve`

```json
{
  "vehicles": [
    { "id": "chofer-1", "start": [28.6, -81.3], "capacity": 20,
      "timeWindow": [1719700000, 1719730000] }
  ],
  "stops": [
    { "id": "p-1", "lat": 28.9, "lng": -81.2, "demand": 1, "serviceMinutes": 5,
      "timeWindow": [1719701000, 1719705000], "priority": 0 }
  ],
  "matrix": { "distances": [[...]], "durations": [[...]] }
}
```

`matrix` es opcional; si se omite, el solver la calcula con haversine + velocidad
promedio. Para calidad real, el caller la envia pre-calculada con OSRM table.

Respuesta:

```json
{
  "ok": true,
  "data": {
    "routes": [
      { "vehicleId": "chofer-1",
        "stops": [ { "id": "p-1", "orden": 0, "arrivalSec": 1719701200, "distanceMeters": 1200 } ],
        "totalDistance": 1200, "totalDuration": 80, "load": 1 }
    ],
    "unassigned": [],
    "solverUsed": "savings-ts"
  },
  "ms": 4
}
```

### `GET /health`

```json
{ "ok": true, "ortools": false, "solver": "savings-ts" }
```

## Caso de ejemplo

Deposito del chofer: **2581 Galliano Cir E, Winter Park 32792**.
Paradas: varias casas de **Deltona**. El optimizador devuelve el orden optimo de
visita con ETA absoluto por casa, respetando capacidad del vehiculo y ventanas
de tiempo.

## Ejecucion

```bash
bun src/index.ts        # desarrollo
# o via el sistema de mini-services del proyecto:
../../.zscripts/mini-services-start.sh
```

El puerto se toma de `process.env.PORT` (default 3010).
