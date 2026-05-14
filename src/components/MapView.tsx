'use client'

import { useEffect, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix leaflet default marker icons
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

interface MapViewProps {
  userLat: number | null
  userLng: number | null
  providers: Array<{
    id: string
    name: string
    phone: string
    serviceCategory: string
    available: boolean
    rating: number
    lat?: number | null
    lng?: number | null
    businessName?: string | null
    bio?: string | null
  }>
  categories: Record<string, { label: string; emoji: string; color: string; desc: string }>
  onProviderClick: (id: string) => void
  onCategoryFilter: (cat: string | null) => void
  filterCategory: string | null
  availableOnly: boolean
  onToggleAvailable: () => void
}

export default function MapView({
  userLat, userLng, providers, categories,
  onProviderClick, onCategoryFilter, filterCategory,
  availableOnly, onToggleAvailable,
}: MapViewProps) {
  const [mapReady, setMapReady] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!mapReady) {
      setMapReady(true)
      // Small delay to ensure DOM is ready
      const t = setTimeout(() => initMap(), 100)
      return () => clearTimeout(t)
    }
  }, [mapReady])

  // Update markers when providers change
  useEffect(() => {
    if (mapReady) {
      setTimeout(() => updateMarkers(), 50)
    }
  }, [mapReady, providers, filterCategory])

  const initMap = () => {
    const mapEl = document.getElementById('chambita-map')
    if (!mapEl || mapEl._leaflet_id) return

    const center: L.LatLngExpression = userLat && userLng
      ? [userLat, userLng]
      : [23.1136, -82.3666]

    const map = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, 13)

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    // User location marker
    if (userLat && userLng) {
      const userIcon = L.divIcon({
        html: `<div style="width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
      L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>Tu ubicación</b>')
    }

    // Store map reference for marker updates
    ;(mapEl as any)._chambitaMap = map

    // Initial markers
    addMarkers(map)
  }

  const addMarkers = (map: L.Map) => {
    // Clear existing markers
    ;(map as any)._chambitaMarkers?.forEach((m: L.Marker) => map.removeLayer(m))
    const markers: L.Marker[] = []

    providers.forEach((p) => {
      if (!p.lat || !p.lng) return
      if (availableOnly && !p.available) return

      const cat = categories[p.serviceCategory]
      const color = cat?.color || '#ea580c'
      const emoji = cat?.emoji || '📍'

      const icon = L.divIcon({
        html: `<div style="
          background:${color};
          width:36px;height:36px;
          border-radius:50%;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;
          ${p.available ? 'animation:pulse 2s infinite;' : 'opacity:0.6;'}
        ">${emoji}</div>
        <style>@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}</style>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -22],
      })

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)
      marker.bindPopup(`
        <div style="min-width:180px;font-family:system-ui;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:20px;">${emoji}</span>
            <div>
              <strong style="font-size:14px;">${p.name}</strong>
              ${p.businessName ? `<br/><span style="color:#666;font-size:12px;">${p.businessName}</span>` : ''}
            </div>
          </div>
          <div style="font-size:12px;color:#555;margin-bottom:4px;">
            ${cat?.label || p.serviceCategory}
            ${p.available ? ' • <span style="color:#16a34a;">● Disponible</span>' : ''}
          </div>
          ${p.rating ? `<div style="font-size:12px;">⭐ ${p.rating.toFixed(1)}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:8px;">
            <a href="tel:${p.phone}" style="
              display:inline-flex;align-items:center;gap:4px;
              padding:6px 12px;background:${color};color:white;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;
            ">📞 Llamar</a>
            <button onclick="document.dispatchEvent(new CustomEvent('chambita-goto-profile',{detail:'${p.id}'}))"
              style="
              display:inline-flex;align-items:center;gap:4px;
              padding:6px 12px;background:#f3f4f6;color:#374151;
              border:1px solid #e5e7eb;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
            ">Ver Perfil</button>
          </div>
        </div>
      `, { maxWidth: 260 })
      markers.push(marker)
    })

    ;(map as any)._chambitaMarkers = markers

    // Listen for profile navigation events
    const handler = (e: CustomEvent) => {
      onProviderClick(e.detail)
    }
    document.addEventListener('chambita-goto-profile', handler as EventListener)
    ;(map as any)._chambitaProfileHandler = handler
  }

  const updateMarkers = () => {
    const mapEl = document.getElementById('chambita-map')
    if (!mapEl) return
    const map = (mapEl as any)._chambitaMap as L.Map | undefined
    if (map) addMarkers(map)
  }

  return null // Map is created imperatively
}
