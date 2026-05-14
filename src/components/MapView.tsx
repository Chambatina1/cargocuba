'use client'

import { useEffect, useRef } from 'react'
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
  filterCategory: string | null
  availableOnly: boolean
}

export default function MapView({
  userLat, userLng, providers, categories,
  onProviderClick, filterCategory, availableOnly,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.Marker[]>([])

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const center: L.LatLngExpression = userLat && userLng
      ? [userLat, userLng]
      : [20, 0] // World view as default

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(center, userLat ? 13 : 2)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    // Handle profile navigation from popup
    const handler = (e: CustomEvent) => {
      onProviderClick(e.detail)
    }
    document.addEventListener('chambita-goto-profile', handler as EventListener)

    return () => {
      document.removeEventListener('chambita-goto-profile', handler as EventListener)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update center when user location changes
  useEffect(() => {
    if (mapRef.current && userLat && userLng) {
      mapRef.current.setView([userLat, userLng], 13)
    }
  }, [userLat, userLng])

  // Update markers when providers or filters change
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m))
    markersRef.current = []

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
          ${p.available ? 'animation:mpulse 2s infinite;' : 'opacity:0.6;'}
        ">${emoji}</div>
        <style>@keyframes mpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}</style>`,
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
            ${p.available ? ' &bull; <span style="color:#16a34a;">Available</span>' : ''}
          </div>
          ${p.rating ? `<div style="font-size:12px;">&#11088; ${p.rating.toFixed(1)}</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:8px;">
            <a href="tel:${p.phone}" style="
              display:inline-flex;align-items:center;gap:4px;
              padding:6px 12px;background:${color};color:white;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;
            ">&#128222; Call</a>
            <button onclick="document.dispatchEvent(new CustomEvent('chambita-goto-profile',{detail:'${p.id}'}))"
              style="
              display:inline-flex;align-items:center;gap:4px;
              padding:6px 12px;background:#f3f4f6;color:#374151;
              border:1px solid #e5e7eb;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
            ">Profile</button>
          </div>
        </div>
      `, { maxWidth: 260 })
      markersRef.current.push(marker)
    })

    // Fit bounds if there are markers and user location
    if (markersRef.current.length > 0 && userLat && userLng) {
      const bounds = L.latLngBounds(
        markersRef.current.map((m) => m.getLatLng())
      )
      bounds.extend([userLat, userLng])
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, filterCategory, availableOnly])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
      }}
    />
  )
}
