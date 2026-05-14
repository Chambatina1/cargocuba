'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface SharedLocationItem {
  id: string
  clientName: string
  clientPhoto: string | null
  providerId: string
  lat: number
  lng: number
  address: string
  createdAt: string
}

interface MapViewProps {
  userLat: number | null
  userLng: number | null
  providers: Array<{
    id: string
    name: string
    phone: string
    serviceCategory: string
    vehicleType?: string | null
    available: boolean
    rating: number
    totalJobs?: number
    lat?: number | null
    lng?: number | null
    photo?: string | null
    businessName?: string | null
    bio?: string | null
    services?: string | null
    priceRange?: string | null
    schedule?: string | null
    notes?: string | null
    carPhoto1?: string | null
    carPhoto2?: string | null
    carPhoto3?: string | null
    route1From?: string | null
    route1To?: string | null
    route2From?: string | null
    route2To?: string | null
    route3From?: string | null
    route3To?: string | null
  }>
  categories: Record<string, { label: string; emoji: string; color: string; desc: string }>
  vehicleTypes?: Record<string, string>
  onProviderClick: (id: string) => void
  onShareLocation?: (providerId: string) => void
  onPhotoClick?: (src: string) => void
  filterCategory: string | null
  availableOnly: boolean
  sharedLocations?: SharedLocationItem[]
}

// Load Leaflet from CDN
function loadLeafletScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) { resolve(); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Leaflet'))
    document.head.appendChild(script)
  })
}

export default function MapView({
  userLat, userLng, providers, categories, vehicleTypes,
  onProviderClick, onShareLocation, onPhotoClick, filterCategory, availableOnly,
  sharedLocations = [],
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [selectedProvider, setSelectedProvider] = useState<typeof providers[0] | null>(null)

  // Cuba + Florida default center
  const DEFAULT_CENTER: [number, number] = [23.5, -80.5]
  const DEFAULT_ZOOM = 5

  const createMap = useCallback(async () => {
    if (!containerRef.current) return
    await loadLeafletScript()
    const L = (window as any).L
    if (!L) return

    if (mapRef.current) {
      updateMarkers(L)
      return
    }

    // ALWAYS start with Cuba + Florida view
    const center = DEFAULT_CENTER
    const zoom = DEFAULT_ZOOM

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView(center, zoom)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(map)

    mapRef.current = map
    updateMarkers(L)
  }, [userLat, userLng, providers, filterCategory, availableOnly, categories, sharedLocations])

  const updateMarkers = useCallback((L: any) => {
    if (!mapRef.current) return
    const map = mapRef.current

    markersRef.current.forEach((m: any) => map.removeLayer(m))
    markersRef.current = []

    providers.forEach((p) => {
      if (!p.lat || !p.lng) return
      if (availableOnly && !p.available) return

      const cat = categories[p.serviceCategory]
      const color = cat?.color || '#ea580c'
      const emoji = cat?.emoji || '\u{1F4CD}'
      const initial = p.name.charAt(0).toUpperCase()
      const photoSrc = p.photo || ''
      const vType = vehicleTypes?.[p.vehicleType || ''] || p.vehicleType || ''

      // Water drop marker with profile photo
      const iconHtml = `
        <div style="position:relative;width:52px;height:66px;cursor:pointer;">
          <!-- Water drop shape -->
          <svg viewBox="0 0 52 66" width="52" height="66" style="position:absolute;top:0;left:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
            <defs>
              <clipPath id="drop-${p.id}">
                <path d="M26 0 C26 0 0 28 0 40 C0 51.046 11.654 60 26 60 C40.346 60 52 51.046 52 40 C52 28 26 0 26 0 Z"/>
              </clipPath>
            </defs>
            <!-- Drop border -->
            <path d="M26 0 C26 0 0 28 0 40 C0 51.046 11.654 60 26 60 C40.346 60 52 51.046 52 40 C52 28 26 0 26 0 Z"
              fill="${color}" stroke="white" stroke-width="2.5"/>
            ${photoSrc ? `
              <image href="${photoSrc}" x="2" y="2" width="48" height="56" preserveAspectRatio="xMidYMid slice"
                clip-path="url(#drop-${p.id})"/>
            ` : `
              <text x="26" y="36" text-anchor="middle" fill="white" font-size="22" font-weight="bold"
                font-family="system-ui,sans-serif">${initial}</text>
            `}
            <!-- Green dot for available -->
            ${p.available ? `
              <circle cx="40" cy="12" r="7" fill="#22c55e" stroke="white" stroke-width="2"/>
            ` : ''}
          </svg>
        </div>
      `

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [52, 66],
        iconAnchor: [26, 60],
        popupAnchor: [0, -62],
      })

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)

      // On tap/click: open full profile card
      marker.on('click', () => {
        setSelectedProvider(p)
      })

      markersRef.current.push(marker)
    })

    // User location marker (blue pulsing dot)
    if (userLat && userLng) {
      const userIcon = L.divIcon({
        html: `<div style="position:relative;width:20px;height:20px;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(59,130,246,0.5);z-index:2;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:20px;height:20px;background:rgba(59,130,246,0.25);border-radius:50%;animation:userpulse 2s infinite;"></div>
          <style>@keyframes userpulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.7}50%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}</style>
        </div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      const userMarker = L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map)
      markersRef.current.push(userMarker)
    }

    // ===== CLIENT SHARED LOCATION MARKERS =====
    // Show client locations shared with any provider - these appear as blue/orange person markers
    sharedLocations.forEach((loc) => {
      if (!loc.lat || !loc.lng) return
      const clientInitial = loc.clientName ? loc.clientName.charAt(0).toUpperCase() : '?'
      const clientPhoto = loc.clientPhoto || ''

      const clientIconHtml = `
        <div style="position:relative;width:44px;height:58px;cursor:pointer;">
          <svg viewBox="0 0 44 58" width="44" height="58" style="position:absolute;top:0;left:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
            <defs>
              <clipPath id="client-loc-${loc.id}">
                <path d="M22 0 C22 0 0 24 0 34 C0 43.941 9.859 52 22 52 C34.141 52 44 43.941 44 34 C44 24 22 0 22 0 Z"/>
              </clipPath>
            </defs>
            <!-- Blue drop for client -->
            <path d="M22 0 C22 0 0 24 0 34 C0 43.941 9.859 52 22 52 C34.141 52 44 43.941 44 34 C44 24 22 0 22 0 Z"
              fill="#3b82f6" stroke="white" stroke-width="2"/>
            ${clientPhoto ? `
              <image href="${clientPhoto}" x="2" y="2" width="40" height="48" preserveAspectRatio="xMidYMid slice"
                clip-path="url(#client-loc-${loc.id})"/>
            ` : `
              <text x="22" y="32" text-anchor="middle" fill="white" font-size="18" font-weight="bold"
                font-family="system-ui,sans-serif">${clientInitial}</text>
            `}
            <!-- Pulsing ring to indicate shared location -->
            <circle cx="34" cy="10" r="6" fill="#f59e0b" stroke="white" stroke-width="2"/>
            <text x="34" y="13" text-anchor="middle" fill="white" font-size="8" font-weight="bold"
              font-family="system-ui,sans-serif">C</text>
          </svg>
          <!-- Client name label -->
          <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(255,255,255,0.95);padding:1px 6px;border-radius:8px;font-size:9px;font-weight:600;color:#1e40af;box-shadow:0 1px 3px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;">
            ${loc.clientName}
          </div>
        </div>
      `

      const clientIcon = L.divIcon({
        html: clientIconHtml,
        className: '',
        iconSize: [44, 74],
        iconAnchor: [22, 52],
      })

      const clientMarker = L.marker([loc.lat, loc.lng], { icon: clientIcon, zIndexOffset: 900 }).addTo(map)

      // Click to show client info
      clientMarker.on('click', () => {
        if (mapRef.current) {
          const timeAgo = (dateStr: string) => {
            const now = new Date()
            const date = new Date(dateStr)
            const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
            if (seconds < 60) return 'ahora mismo'
            if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
            if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`
            return `hace ${Math.floor(seconds / 86400)} d`
          }
          L.popup({ className: 'client-popup' })
            .setLatLng([loc.lat, loc.lng])
            .setContent(`
              <div style="text-align:center;padding:4px;min-width:140px;font-family:system-ui,sans-serif;">
                ${clientPhoto ? `<img src="${clientPhoto}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;margin:0 auto 6px;display:block;border:2px solid #3b82f6;" />` : ''}
                <div style="font-weight:700;color:#1e40af;font-size:14px;">${loc.clientName}</div>
                <div style="font-size:11px;color:#6b7280;margin-top:2px;">Cliente compartiendo ubicación</div>
                <div style="font-size:10px;color:#9ca3af;margin-top:4px;">${timeAgo(loc.createdAt)}</div>
              </div>
            `)
            .openOn(mapRef.current)
        }
      })

      markersRef.current.push(clientMarker)
    })

    // Fit bounds to show ALL markers + Cuba+Florida region
    const cubaFL = [
      L.latLng(21.0, -85.5),
      L.latLng(23.5, -74.0),
      L.latLng(30.5, -87.5),
      L.latLng(25.0, -80.0),
    ]
    const points = [...cubaFL]
    markersRef.current.forEach((m: any) => points.push(m.getLatLng()))
    if (userLat && userLng) points.push(L.latLng(userLat, userLng))
    try {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 8 })
    } catch { /* ignore */ }
  }, [providers, filterCategory, availableOnly, categories, vehicleTypes, userLat, userLng, sharedLocations])

  // Init map
  useEffect(() => {
    createMap()
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // Update markers on data change
  useEffect(() => {
    if (mapRef.current && (window as any).L) updateMarkers((window as any).L)
  }, [providers, filterCategory, availableOnly, sharedLocations, updateMarkers])

  // Update markers when user location changes
  useEffect(() => {
    if (mapRef.current && userLat && userLng && (window as any).L) {
      updateMarkers((window as any).L)
    }
  }, [userLat, userLng])

  const closeProfile = () => setSelectedProvider(null)

  const sp = selectedProvider
  const spCat = sp ? categories[sp.serviceCategory] : null
  const spVType = sp ? (vehicleTypes?.[sp.vehicleType || ''] || sp.vehicleType || '') : ''
  const spPhotos = sp ? [sp.carPhoto1, sp.carPhoto2, sp.carPhoto3].filter(Boolean) : []
  const spRoutes = sp ? [
    sp.route1From && sp.route1To ? `${sp.route1From} \u2192 ${sp.route1To}` : null,
    sp.route2From && sp.route2To ? `${sp.route2From} \u2192 ${sp.route2To}` : null,
    sp.route3From && sp.route3To ? `${sp.route3From} \u2192 ${sp.route3To}` : null,
  ].filter(Boolean) : []

  return (
    <>
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

      {/* ===== FULL PROFILE CARD OVERLAY ===== */}
      {sp && spCat && (
        <div
          onClick={closeProfile}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '92%',
              maxWidth: 420,
              maxHeight: '85vh',
              backgroundColor: 'white',
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Cover header */}
            <div
              style={{
                background: `linear-gradient(135deg, ${spCat.color}, ${spCat.color}cc)`,
                height: 100,
                position: 'relative',
              }}
            >
              {/* Close button */}
              <button
                onClick={closeProfile}
                style={{
                  position: 'absolute',
                  top: 12, right: 12,
                  width: 32, height: 32,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  border: 'none',
                  color: 'white',
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {'\u2715'}
              </button>

              {/* Profile avatar */}
              <div style={{
                position: 'absolute',
                bottom: -36,
                left: 20,
                width: 76,
                height: 76,
                borderRadius: '50%',
                border: '4px solid white',
                overflow: 'hidden',
                backgroundColor: spCat.color,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                {sp.photo ? (
                  <img
                    src={sp.photo}
                    alt={sp.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 28, fontWeight: 'bold',
                    fontFamily: 'system-ui, sans-serif',
                  }}>
                    {sp.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: 44, paddingBottom: 20, padding: '44px 20px 20px' }}>
              {/* Name + Badge */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>{sp.name}</h2>
                  {sp.businessName && sp.businessName !== sp.name && (
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>{sp.businessName}</p>
                  )}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 20,
                  backgroundColor: spCat.color, color: 'white',
                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {spCat.emoji} {spCat.label}
                </span>
              </div>

              {/* Status + Rating + Jobs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: sp.available ? '#22c55e' : '#9ca3af',
                    ...(sp.available ? { animation: 'pulse 2s infinite' } : {}),
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: sp.available ? '#16a34a' : '#9ca3af' }}>
                    {sp.available ? 'EN VIVO' : 'Desconectado'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <span style={{ color: '#eab308' }}>{'\u2B50'}</span>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{sp.rating.toFixed(1)}</span>
                </div>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{sp.totalJobs || 0} servicios</span>
              </div>

              {/* Bio */}
              {sp.bio && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Acerca de</h3>
                  <p style={{ margin: 0, fontSize: 14, color: '#4b5563', lineHeight: 1.5 }}>{sp.bio}</p>
                </div>
              )}

              {/* Info grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 16,
              }}>
                {spVType && (
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{'\u{1F697}'} Vehiculo</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{spVType}</div>
                  </div>
                )}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{'\u{1F4DE}'} Telefono</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{sp.phone}</div>
                </div>
                {sp.priceRange && (
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{'\u{1F4B0}'} Precio</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{sp.priceRange}</div>
                  </div>
                )}
                {sp.schedule && (
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{'\u{1F552}'} Horario</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{sp.schedule}</div>
                  </div>
                )}
              </div>

              {/* Routes */}
              {spRoutes.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Rutas frecuentes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {spRoutes.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: '#f9fafb', borderRadius: 10, padding: '8px 12px',
                      }}>
                        <span style={{ color: spCat.color, fontSize: 14 }}>{'\u{1F4CD}'}</span>
                        <span style={{ fontSize: 13, color: '#374151' }}>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {sp.notes && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Notas</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>{sp.notes}</p>
                </div>
              )}

              {/* Car Photos */}
              {spPhotos.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    Fotos del vehiculo ({spPhotos.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(spPhotos.length, 3)}, 1fr)`, gap: 8 }}>
                    {spPhotos.map((photo, i) => (
                      <div key={i} style={{
                        aspectRatio: '1',
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: '#f3f4f6',
                        cursor: 'pointer',
                      }}
                        onClick={() => onPhotoClick?.(photo)}
                      >
                        <img
                          src={photo || ''}
                          alt={`Foto ${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky bottom actions */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid #f3f4f6',
              display: 'flex',
              gap: 8,
              backgroundColor: 'white',
            }}>
              <a
                href={`tel:${sp.phone}`}
                onClick={() => closeProfile()}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: '#16a34a',
                  color: 'white',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {'\u{1F4DE}'} Llamar
              </a>
              <button
                onClick={() => {
                  closeProfile()
                  onProviderClick(sp.id)
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: spCat.color,
                  color: 'white',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {'\u{1F4AC}'} Mensaje
              </button>
              {onShareLocation && (
                <button
                  onClick={() => {
                    closeProfile()
                    onShareLocation(sp.id)
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    fontSize: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title="Compartir mi ubicación"
                >
                  {'\u{1F4CD}'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation + client popup styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .client-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(59,130,246,0.25);
          border: 2px solid #3b82f6;
        }
        .client-popup .leaflet-popup-content {
          margin: 8px 12px;
        }
      `}</style>
    </>
  )
}
