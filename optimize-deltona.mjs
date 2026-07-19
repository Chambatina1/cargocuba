import { solveVrpFallback } from './src/lib/routing/fallback-solver.ts';
import { calcRoute } from './src/lib/routing/osrm.ts';

const VEHICLE_START = [28.9005, -81.2614]; // Deltona (centro)

const stops = [
  { id: '1-Madelaine',  name: 'Madelaine Bridon',   lat: 28.88888, lng: -81.20176, addr: '2401 Weatherford Dr, Deltona' },
  { id: '2-Randy',      name: 'Randy',              lat: 28.92328, lng: -81.17542, addr: '2048 Laredo Dr, Deltona' },
  { id: '3-Arely',      name: 'Arely',              lat: 28.91374, lng: -81.18732, addr: '1758 Baldock Ct, Deltona' },
  { id: '4-Aurora',     name: 'Aurora Espinosa',    lat: 28.91754, lng: -81.16930, addr: '1861 Courtland Blvd, Deltona' },
  { id: '5-Xiomara',    name: 'Xiomara González',   lat: 28.92449, lng: -81.18643, addr: '2101 Capri Cir, Deltona' },
  { id: '6-Noida',      name: 'Noida Ávila',        lat: 28.90828, lng: -81.22372, addr: '1711 Providence Blvd, Deltona' },
  { id: '7-Tania',      name: 'Tania Iglesias',     lat: 28.91288, lng: -81.24067, addr: '1174 S Cooper Dr, Deltona' },
  { id: '8-Larry',      name: 'Larry',              lat: 28.91745, lng: -81.25506, addr: '794 Elwood St, Deltona' },
  { id: '9-Jenny',      name: 'Jenny',              lat: 28.95237, lng: -81.30634, addr: '615 W French Ave, Orange City' },
  { id: '10-Ideliza',   name: 'Ideliza Artiaga',    lat: 28.91858, lng: -81.29582, addr: '2515 Enterprise Dr, Orange City' },
  { id: '11-Marielena', name: 'Marielena',          lat: 28.95939, lng: -81.18567, addr: '2873 Irondale St, Deltona' },
];

const vehicles = [{ id: 'yandier', start: VEHICLE_START, capacity: 30 }];
const now = Math.floor(Date.now() / 1000);

const result = solveVrpFallback(vehicles, stops, undefined, now);
const route = result.routes[0];

const pathPoints = [
  { lat: VEHICLE_START[0], lng: VEHICLE_START[1] },
  ...route.stops.map(s => {
    const st = stops.find(x => x.id === s.id);
    return { lat: st.lat, lng: st.lng };
  }),
  { lat: VEHICLE_START[0], lng: VEHICLE_START[1] },
];
const osrm = await calcRoute(pathPoints);

console.log('════════════════════════════════════════════════════════════');
console.log('🚛 RUTA YANDIER — DESDE DELTONA (11 casas)');
console.log('════════════════════════════════════════════════════════════');
console.log(`Origen: Deltona, FL`);
console.log(`Casas: ${route.stops.length} | Distancia: ${(route.totalDistance/1000*0.621371).toFixed(1)} mi | Duración: ${Math.floor(route.totalDuration/60)} min`);
console.log('');
route.stops.forEach((s, i) => {
  const st = stops.find(x => x.id === s.id);
  const eta = new Date(s.arrivalSec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  console.log(`  ${String(i+1).padStart(2)}. ${st.name.padEnd(20)} ETA ${eta}   (${(s.distanceMeters/1000*0.621371).toFixed(1)} mi)`);
  console.log(`      📍 ${st.addr}`);
});

const fs = await import('fs');
fs.writeFileSync('/tmp/route-deltona.json', JSON.stringify({
  vehicle: { name: 'yandier', start: VEHICLE_START, sede: 'Deltona, FL' },
  stops: route.stops.map(s => ({ ...s, ...stops.find(x => x.id === s.id) })),
  totalDistance: route.totalDistance,
  totalDuration: route.totalDuration,
  polyline: osrm?.route || [],
}, null, 2));
