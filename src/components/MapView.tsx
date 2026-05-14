'use client'

import { useEffect, useRef, useCallback } from 'react'

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

// Load Leaflet from CDN via script tags to avoid SSR/bundling issues
function loadLeafletScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) { resolve(); return }
    
    // Load CSS first
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    // Then JS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Leaflet'))
    document.head.appendChild(script)
  })
}

export default function MapView({
  userLat, userLng, providers, categories,
  onProviderClick, filterCategory, availableOnly,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  const createMap = useCallback(async () => {
    if (!containerRef.current) return

    await loadLeafletScript()

    const L = (window as any).L
    if (!L) return

    // If map already exists, just update
    if (mapRef.current) {
      updateMarkers(L)
      return
    }

    const center: [number, number] = userLat && userLng
      ? [userLat, userLng]
      : [20, 0]

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView(center, userLat ? 13 : 2)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    // Profile click handler
    const handler = (e: any) => onProviderClick(e.detail)
    document.addEventListener('chambita-goto-profile', handler)

    updateMarkers(L)

    return () => {
      document.removeEventListener('chambita-goto-profile', handler)
    }
  }, [userLat, userLng, providers, filterCategory, availableOnly, categories, onProviderClick])

  const updateMarkers = useCallback((L: any) => {
    if (!mapRef.current) return
    const map = mapRef.current

    // Clear markers
    markersRef.current.forEach((m: any) => map.removeLayer(m))
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
          width:40px;height:40px;
          border-radius:50%;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          font-size:20px;
          ${p.available ? 'animation:cpulse 2s infinite;' : 'opacity:0.5;'}
        ">${emoji}</div>
        <style>@keyframes cpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}</style>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -24],
      })

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)
      marker.bindPopup(`
        <div style="min-width:200px;font-family:system-ui;padding:4px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:24px;">${emoji}</span>
            <div>
              <strong style="font-size:15px;">${p.name}</strong>
              ${p.businessName ? `<br/><span style="color:#666;font-size:12px;">${p.businessName}</span>` : ''}
            </div>
          </div>
          <div style="font-size:13px;color:#555;margin-bottom:4px;">
            ${cat?.label || p.serviceCategory}
            ${p.available ? ' &bull; <span style="color:#16a34a;font-weight:600;">Disponible</span>' : ''}
          </div>
          ${p.rating ? `<div style="font-size:13px;margin-bottom:4px;">&#11088; ${p.rating.toFixed(1)}</div>` : ''}
          ${p.bio ? `<div style="font-size:12px;color:#777;margin-bottom:8px;">${p.bio.substring(0, 80)}${p.bio.length > 80 ? '...' : ''}</div>` : ''}
          <div style="display:flex;gap:8px;margin-top:8px;">
            <a href="tel:${p.phone}" style="
              display:inline-flex;align-items:center;gap:4px;
              padding:8px 14px;background:${color};color:white;
              border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;
            ">&#128222; Llamar</a>
            <button onclick="document.dispatchEvent(new CustomEvent('chambita-goto-profile',{detail:'${p.id}'}))"
              style="
              display:inline-flex;align-items:center;gap:4px;
              padding:8px 14px;background:#f3f4f6;color:#374151;
              border:1px solid #e5e7eb;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;
            ">Ver Perfil</button>
          </div>
        </div>
      `, { maxWidth: 300 })
      markersRef.current.push(marker)
    })

    // Fit bounds
    if (markersRef.current.length > 0 && userLat && userLng) {
      const points = markersRef.current.map((m: any) => m.getLatLng())
      points.push(L.latLng(userLat, userLng))
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 })
    } else if (userLat && userLng) {
      map.setView([userLat, userLng], 13)
    }
  }, [providers, filterCategory, availableOnly, categories, userLat, userLng])

  // Init map
  useEffect(() => {
    createMap()

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // Update markers on data change
  useEffect(() => {
    if (mapRef.current && (window as any).L) {
      updateMarkers((window as any).L)
    }
  }, [providers, filterCategory, availableOnly, updateMarkers])

  // Update center on user location change
  useEffect(() => {
    if (mapRef.current && userLat && userLng && (window as any).L) {
      mapRef.current.setView([userLat, userLng], 13)
    }
  }, [userLat, userLng])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
      }}
    />
  )
}
