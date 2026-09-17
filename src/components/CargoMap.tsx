'use client';

import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Pickup } from '@/hooks/usePickups';
import type { Driver } from '@/hooks/useDrivers';

type LatLng = [number, number];

function icon(color: string, symbol: string, pulse = false) {
  return L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;font-size:16px;${pulse ? 'animation:pulse 1.6s infinite;' : ''}">${symbol}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const icons = {
  waiting: icon('#22c55e', '📦'),
  assigned: icon('#8b5cf6', '📍'),
  done: icon('#64748b', '✓'),
  driver: icon('#2563eb', '🚙', true),
  base: icon('#f97316', '🏠'),
  me: icon('#111827', '●', true),
};

function FitMap({ points, follow }: { points: LatLng[]; follow?: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (follow) {
      map.flyTo(follow, Math.max(map.getZoom(), 15), { duration: 0.8 });
      return;
    }
    if (points.length === 1) map.setView(points[0], 13);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 14 });
  }, [map, points, follow]);
  return null;
}

export default function CargoMap({
  pickups,
  drivers,
  myLocation,
  selectedDriverPhone,
}: {
  pickups: Pickup[];
  drivers: Driver[];
  myLocation?: LatLng | null;
  selectedDriverPhone?: string | null;
}) {
  const activeDrivers = drivers.filter((d) => d.activo && Number.isFinite(d.lat) && Number.isFinite(d.lng));
  const selected = activeDrivers.find((d) => d.phone === selectedDriverPhone);
  const route = selected?.rutaActiva && Array.isArray(selected.rutaActiva.polyline)
    ? selected.rutaActiva.polyline as LatLng[]
    : [];
  const points: LatLng[] = [
    ...pickups.filter((p) => p.estado !== 'cancelado').map((p) => [p.lat, p.lng] as LatLng),
    ...activeDrivers.map((d) => [d.lat, d.lng] as LatLng),
    ...(myLocation ? [myLocation] : []),
  ];
  const follow = selected ? [selected.lat, selected.lng] as LatLng : null;

  return (
    <MapContainer center={[28.5383, -81.3792]} zoom={8} className="h-full w-full" zoomControl={false}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitMap points={points} follow={follow} />
      {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.78 }} />}
      {pickups.filter((p) => p.estado !== 'cancelado').map((p) => {
        const markerIcon = p.estado === 'recogido' ? icons.done : p.choferAsignado ? icons.assigned : icons.waiting;
        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon}>
            <Popup>
              <div className="min-w-44">
                <strong>{p.nombre}</strong>
                <div>{p.direccion}</div>
                <div>Estado: {p.estado.replaceAll('_', ' ')}</div>
                {p.choferAsignado && <div>Chofer: {p.choferAsignado}</div>}
              </div>
            </Popup>
          </Marker>
        );
      })}
      {activeDrivers.map((d) => (
        <Marker key={d.phone} position={[d.lat, d.lng]} icon={icons.driver}>
          <Popup>
            <strong>{d.nombre}</strong>
            <div>{d.mensaje || 'Conductor disponible'}</div>
            {d.precioServicio && <div>Servicio: ${d.precioServicio}</div>}
            {d.etaActual && <div>ETA: {new Date(d.etaActual).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>}
          </Popup>
        </Marker>
      ))}
      {drivers.filter((d) => d.puntoPartidaLat != null && d.puntoPartidaLng != null).map((d) => (
        <Marker key={`base-${d.phone}`} position={[d.puntoPartidaLat!, d.puntoPartidaLng!]} icon={icons.base}>
          <Popup><strong>Base de {d.nombre}</strong><div>{d.puntoPartidaDir || 'Punto de partida'}</div></Popup>
        </Marker>
      ))}
      {myLocation && <Marker position={myLocation} icon={icons.me}><Popup>Tu ubicación</Popup></Marker>}
    </MapContainer>
  );
}
