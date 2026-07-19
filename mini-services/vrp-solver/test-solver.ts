// Test rapido del solver savings-TS con el caso Galliano -> Deltona
import { solveVrp } from './src/savings-solver.js';

const vehicles = [
  { id: 'chofer-boris', start: [28.5997, -81.3392] as [number, number], capacity: 30 },
];

const stops = [
  { id: 'deltona-1', lat: 28.9005, lng: -81.2614, demand: 2 },
  { id: 'deltona-2', lat: 28.9210, lng: -81.2480, demand: 1 },
  { id: 'deltona-3', lat: 28.8820, lng: -81.2700, demand: 3 },
  { id: 'deltona-4', lat: 28.9360, lng: -81.2300, demand: 1 },
  { id: 'deltona-5', lat: 28.8700, lng: -81.2900, demand: 2 },
];

const result = solveVrp(vehicles, stops);
console.log('SOLVER:', result.solverUsed);
console.log('UNASSIGNED:', result.unassigned);
for (const r of result.routes) {
  console.log(`\nRuta vehiculo ${r.vehicleId}:`);
  console.log(`  Distancia total: ${(r.totalDistance / 1000).toFixed(2)} km`);
  console.log(`  Duracion total: ${(r.totalDuration / 60).toFixed(1)} min`);
  console.log(`  Carga: ${r.load}`);
  r.stops.forEach(s => {
    const eta = new Date(s.arrivalSec * 1000).toLocaleTimeString('en-US');
    console.log(`  ${s.orden + 1}. ${s.id} -> ETA ${eta} (${(s.distanceMeters / 1000).toFixed(2)} km desde la anterior)`);
  });
}
