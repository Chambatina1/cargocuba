'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// MapView: dynamic import to avoid Leaflet SSR issues
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

// shadcn/ui components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

// lucide icons
import {
  ArrowLeft, Phone, Star, MapPin, Camera, Edit, LogOut,
  Car, User, Stethoscope, Users, Eye, EyeOff, Navigation, X, Check,
  Shield, Trash2, KeyRound, RefreshCw, Search,
} from 'lucide-react'

// =============================================
// CONSTANTS
// =============================================

const BRAND_COLOR = '#2563eb'
const BRAND_COLOR_LIGHT = '#dbeafe'

type ViewType = 'home' | 'driver-register' | 'driver-login' | 'driver-panel' | 'driver-edit' | 'doctor' | 'cliente' | 'admin-login' | 'admin-panel'

// =============================================
// TYPES
// =============================================

interface Provider {
  id: string
  name: string
  phone: string
  pin?: string
  carBrand?: string | null
  carModel?: string | null
  bio?: string | null
  services?: string | null
  lat?: number
  lng?: number
  active: boolean
  available: boolean
  rating: number
  totalJobs: number
  photo?: string | null
  carPhoto1?: string | null
  carPhoto2?: string | null
  carPhoto3?: string | null
  suspended: boolean
  createdAt: string
  updatedAt: string
}

// =============================================
// ANIMATION VARIANTS
// =============================================

const fadeVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

const staggerItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('1') && cleaned.length === 11) return `+${cleaned}`
  if (cleaned.startsWith('53')) return `+${cleaned}`
  return `+${cleaned}`
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const MAX_SIZE = 800
    const QUALITY = 0.85

    img.onload = () => {
      let w = img.width
      let h = img.height
      if (w > MAX_SIZE || h > MAX_SIZE) {
        if (w > h) { h = (h * MAX_SIZE) / w; w = MAX_SIZE }
        else { w = (w * MAX_SIZE) / h; h = MAX_SIZE }
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function FlotaDeAutosPage() {
  // ---- Core view state ----
  const [view, setView] = useState<ViewType>(() => {
    try {
      const stored = localStorage.getItem('flota_session')
      if (stored) {
        const session = JSON.parse(stored)
        if (session.provider && session.token) return 'home'
      }
    } catch { /* ignore */ }
    return 'home'
  })

  // ---- Auth state ----
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null)
  const [currentToken, setCurrentToken] = useState<string | null>(null)

  // ---- Geolocation state ----
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // ---- Data state ----
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)

  // ---- Register form state ----
  const [regForm, setRegForm] = useState({
    name: '', phone: '', pin: '', confirmPin: '',
    carBrand: '', carModel: '', services: '',
  })
  const [regPhoto, setRegPhoto] = useState<string | null>(null)
  const [regCarPhotos, setRegCarPhotos] = useState<string[]>([])
  const [registering, setRegistering] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [showConfirmPin, setShowConfirmPin] = useState(false)

  // ---- Login state ----
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginShowPin, setLoginShowPin] = useState(false)

  // ---- Edit form state ----
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editPin, setEditPin] = useState('')
  const [editPhotos, setEditPhotos] = useState<{ photo?: string; carPhoto1?: string; carPhoto2?: string; carPhoto3?: string }>({})
  const [editShowPin, setEditShowPin] = useState(false)

  // ---- Live toggle state ----
  const [togglingLive, setTogglingLive] = useState(false)

  // ---- Admin state ----
  const [adminToken, setAdminToken] = useState<string | null>(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoginError, setAdminLoginError] = useState('')
  const [adminProviders, setAdminProviders] = useState<Provider[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminSearch, setAdminSearch] = useState('')
  const [adminDeleteId, setAdminDeleteId] = useState<string | null>(null)
  const [adminPinResetId, setAdminPinResetId] = useState<string | null>(null)
  const [adminNewPin, setAdminNewPin] = useState('')
  const [adminMsg, setAdminMsg] = useState('')

  // ---- Admin tap counter (secret: tap logo 3x) ----
  const logoTapCountRef = useRef(0)
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleLogoTap = () => {
    logoTapCountRef.current++
    if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current)
    logoTapTimerRef.current = setTimeout(() => { logoTapCountRef.current = 0 }, 3000)
    if (logoTapCountRef.current >= 3) {
      logoTapCountRef.current = 0
      setView('admin-login')
    }
  }

  // ---- Lightbox state ----
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // ---- Profile overlay state ----
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)

  // ---- Load session from localStorage ----
  useEffect(() => {
    try {
      const stored = localStorage.getItem('flota_session')
      if (stored) {
        const session = JSON.parse(stored)
        if (session.provider && session.token) {
          queueMicrotask(() => {
            setCurrentProvider(session.provider)
            setCurrentToken(session.token)
          })
        }
      }
    } catch { /* ignore */ }
  }, [])

  // ---- GEOLOCATION ----
  useEffect(() => {
    if (!navigator.geolocation) return

    const updatePosition = (lat: number, lng: number) => {
      setUserLat(lat)
      setUserLng(lng)

      if (currentProvider?.available && currentToken) {
        fetch(`/api/providers/${currentProvider.id}/toggle-live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: currentToken,
            lat,
            lng,
            _updateOnly: true,
          }),
        }).catch(() => {})
      }
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => updatePosition(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )

    const id = navigator.geolocation.watchPosition(
      (pos) => updatePosition(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    )

    watchIdRef.current = id
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [currentProvider?.available, currentProvider?.id, currentToken])

  // ---- Fix navigation guards (run in microtask to avoid cascading render) ----
  useEffect(() => {
    if ((view === 'driver-panel' || view === 'driver-edit') && !currentProvider) {
      queueMicrotask(() => setView('home'))
    }
  }, [view, currentProvider])

  // ---- Fetch providers ----
  const fetchProviders = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (userLat != null && userLng != null) {
        params.set('lat', String(userLat))
        params.set('lng', String(userLng))
      }
      const res = await fetch(`/api/providers/nearby?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (userLat != null && userLng != null && Array.isArray(data)) {
          data.sort((a: Provider, b: Provider) => {
            const dA = Math.sqrt(Math.pow((a.lat || 0) - userLat, 2) + Math.pow((a.lng || 0) - userLng, 2))
            const dB = Math.sqrt(Math.pow((b.lat || 0) - userLat, 2) + Math.pow((b.lng || 0) - userLng, 2))
            return dA - dB
          })
        }
        setProviders(data)
      }
    } catch { /* ignore */ }
  }, [userLat, userLng])

  // ---- Auto-refresh providers on home view every 8 seconds ----
  useEffect(() => {
    if (view !== 'home') return
    const interval = setInterval(fetchProviders, 8000)
    return () => clearInterval(interval)
  }, [view, fetchProviders])

  // =============================================
  // HANDLERS
  // =============================================

  const handleLogin = async () => {
    setLoginError('')
    if (!loginPhone || !loginPin) {
      setLoginError('Teléfono y PIN son obligatorios')
      return
    }
    try {
      const res = await fetch('/api/providers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, pin: loginPin }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCurrentProvider(data.provider)
        setCurrentToken(data.token)
        localStorage.setItem('flota_session', JSON.stringify({ provider: data.provider, token: data.token }))
        toast.success('¡Bienvenido de vuelta!')
        setView('driver-panel')
        setLoginPhone('')
        setLoginPin('')
      } else {
        setLoginError(data.error || 'Error al iniciar sesión')
      }
    } catch {
      setLoginError('Error de conexión')
    }
  }

  const handleRegister = async () => {
    if (!regForm.name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!regForm.phone.trim()) { toast.error('El teléfono es obligatorio'); return }
    if (!regForm.pin.trim() || regForm.pin.length < 4 || regForm.pin.length > 6) {
      toast.error('El PIN debe tener entre 4 y 6 dígitos'); return
    }
    if (regForm.pin !== regForm.confirmPin) { toast.error('Los PINs no coinciden'); return }

    setRegistering(true)
    try {
      const payload: Record<string, unknown> = {
        name: regForm.name.trim(),
        phone: regForm.phone.trim(),
        pin: regForm.pin.trim(),
        carBrand: regForm.carBrand.trim() || undefined,
        carModel: regForm.carModel.trim() || undefined,
        bio: regForm.services.trim() || undefined,
      }
      // Send GPS coordinates if available
      if (userLat != null) payload.lat = userLat
      if (userLng != null) payload.lng = userLng
      if (regPhoto) payload.photo = regPhoto
      if (regCarPhotos[0]) payload.carPhoto1 = regCarPhotos[0]
      if (regCarPhotos[1]) payload.carPhoto2 = regCarPhotos[1]
      if (regCarPhotos[2]) payload.carPhoto3 = regCarPhotos[2]

      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok || data.alreadyExists) {
        toast.success('¡Registro exitoso!')
        // Auto-login
        try {
          const loginRes = await fetch('/api/providers/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: regForm.phone.trim(), pin: regForm.pin.trim() }),
          })
          const loginData = await loginRes.json()
          if (loginRes.ok && loginData.success) {
            setCurrentProvider(loginData.provider)
            setCurrentToken(loginData.token)
            localStorage.setItem('flota_session', JSON.stringify({ provider: loginData.provider, token: loginData.token }))
          }
        } catch { /* ignore */ }
        setView('driver-panel')
        setRegForm({ name: '', phone: '', pin: '', confirmPin: '', carBrand: '', carModel: '', services: '' })
        setRegPhoto(null)
        setRegCarPhotos([])
      } else {
        toast.error(data.error || 'Error al registrarse')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setRegistering(false)
  }

  const handleToggleLive = async () => {
    if (!currentProvider || !currentToken) return
    setTogglingLive(true)
    try {
      const res = await fetch(`/api/providers/${currentProvider.id}/toggle-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken, lat: userLat, lng: userLng }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCurrentProvider(data.provider)
        localStorage.setItem('flota_session', JSON.stringify({ provider: data.provider, token: currentToken }))
        toast.success(data.available ? '🟢 ¡Estás en vivo en el mapa!' : '⚫ Te has desconectado')
      } else {
        toast.error(data.error || 'Error al cambiar estado')
      }
    } catch {
      toast.error('Error de conexión')
    }
    setTogglingLive(false)
  }

  const handleSaveProfile = async () => {
    if (!currentProvider) return
    if (!editPin) { toast.error('Ingresa tu PIN para guardar cambios'); return }
    try {
      const payload: Record<string, unknown> = { pin: editPin, ...editForm }
      // Always send current GPS coordinates when editing profile
      if (userLat != null) payload.lat = userLat
      if (userLng != null) payload.lng = userLng
      if (editPhotos.photo !== undefined) payload.photo = editPhotos.photo
      if (editPhotos.carPhoto1 !== undefined) payload.carPhoto1 = editPhotos.carPhoto1
      if (editPhotos.carPhoto2 !== undefined) payload.carPhoto2 = editPhotos.carPhoto2
      if (editPhotos.carPhoto3 !== undefined) payload.carPhoto3 = editPhotos.carPhoto3

      const res = await fetch(`/api/providers/${currentProvider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const updated = await res.json()
        setCurrentProvider(updated)
        localStorage.setItem('flota_session', JSON.stringify({ provider: updated, token: currentToken }))
        toast.success('Perfil actualizado correctamente')
        setView('driver-panel')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleLogout = () => {
    setCurrentProvider(null)
    setCurrentToken(null)
    localStorage.removeItem('flota_session')
    toast.success('Sesión cerrada')
    setView('home')
  }

  const openEdit = () => {
    if (!currentProvider) return
    setEditForm({
      name: currentProvider.name,
      phone: currentProvider.phone,
      carBrand: currentProvider.carBrand || '',
      carModel: currentProvider.carModel || '',
      services: currentProvider.bio || '',
    })
    setEditPhotos({})
    setEditPin('')
    setView('driver-edit')
  }

  // =============================================
  // RENDER VIEWS
  // =============================================

  // ---- HOME VIEW (Map + floating buttons) ----
  const renderHome = () => (
    <div className="relative w-full h-screen">
      {/* Full-screen Map */}
      <MapView
        providers={providers}
        userLat={userLat}
        userLng={userLng}
        onProviderClick={(p) => setSelectedProvider(p)}
        onPhotoClick={(src) => setLightboxSrc(src)}
      />

      {/* Floating Header */}
      <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
        <div className="pointer-events-auto mx-3 mt-3">
          <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-lg border border-gray-100 cursor-pointer select-none" onClick={handleLogoTap}>
            <Car className="w-5 h-5" style={{ color: BRAND_COLOR }} />
            <span className="font-bold text-sm tracking-tight" style={{ color: BRAND_COLOR }}>
              Flota de Autos
            </span>
            {currentProvider && (
              <button
                onClick={() => setView('driver-panel')}
                className="ml-auto flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
                style={{ backgroundColor: BRAND_COLOR_LIGHT, color: BRAND_COLOR }}
              >
                <MapPin className="w-3 h-3" />
                Mi Panel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setView('driver-login')}
          className="flex flex-col items-center gap-1 bg-white rounded-2xl px-5 py-3 shadow-xl border border-gray-100 hover:shadow-2xl transition-shadow"
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg" style={{ backgroundColor: BRAND_COLOR }}>
            <Car className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-gray-700">Conductor</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setView('doctor')}
          className="flex flex-col items-center gap-1 bg-white rounded-2xl px-5 py-3 shadow-xl border border-gray-100 hover:shadow-2xl transition-shadow"
        >
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-lg">
            <Stethoscope className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-gray-700">Doctor</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setView('cliente')}
          className="flex flex-col items-center gap-1 bg-white rounded-2xl px-5 py-3 shadow-xl border border-gray-100 hover:shadow-2xl transition-shadow"
        >
          <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white text-lg">
            <Users className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-gray-700">Cliente</span>
        </motion.button>
      </div>

      {/* Admin access - top right corner */}
      <button
        onClick={() => setView('admin-login')}
        className="fixed top-3 right-3 z-[10000] w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 flex items-center justify-center shadow-sm hover:bg-white hover:shadow-md transition-all"
        title="Admin"
      >
        <Shield className="w-4 h-4 text-gray-400" />
      </button>

      {/* Provider Profile Overlay */}
      {selectedProvider && (
        <div
          onClick={() => setSelectedProvider(null)}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl w-[92%] max-w-[420px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Cover Header */}
            <div className="h-24 relative" style={{ background: `linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR}cc)` }}>
              <button
                onClick={() => setSelectedProvider(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/25 text-white flex items-center justify-center text-sm backdrop-blur-sm hover:bg-white/40 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute -bottom-9 left-5 w-[72px] h-[72px] rounded-full border-4 border-white overflow-hidden shadow-lg" style={{ backgroundColor: BRAND_COLOR }}>
                {selectedProvider.photo ? (
                  <img src={selectedProvider.photo} alt={selectedProvider.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                    {selectedProvider.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pt-12 px-5 pb-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedProvider.name}</h2>
                  {(selectedProvider.carBrand || selectedProvider.carModel) && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selectedProvider.carBrand}{selectedProvider.carBrand && selectedProvider.carModel ? ' ' : ''}{selectedProvider.carModel}
                    </p>
                  )}
                </div>
                <div className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                  selectedProvider.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                )}>
                  <div className={cn(
                    'w-2 h-2 rounded-full',
                    selectedProvider.available ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                  )} />
                  {selectedProvider.available ? 'EN VIVO' : 'Desconectado'}
                </div>
              </div>

              {/* Service info */}
              {selectedProvider.bio && (
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">{selectedProvider.bio}</p>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[11px] text-gray-400 mb-0.5">📞 Teléfono</div>
                  <div className="text-sm font-semibold text-gray-900">{formatPhone(selectedProvider.phone)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[11px] text-gray-400 mb-0.5">⭐ Calificación</div>
                  <div className="text-sm font-semibold text-gray-900">{selectedProvider.rating.toFixed(1)}</div>
                </div>
              </div>

              {/* Car Photos */}
              {([selectedProvider.carPhoto1, selectedProvider.carPhoto2, selectedProvider.carPhoto3].filter(Boolean) as string[]).length > 0 && (
                <div className="mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    Fotos del Auto ({[selectedProvider.carPhoto1, selectedProvider.carPhoto2, selectedProvider.carPhoto3].filter(Boolean).length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[selectedProvider.carPhoto1, selectedProvider.carPhoto2, selectedProvider.carPhoto3].filter(Boolean).map((photo, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightboxSrc(photo)}
                      >
                        <img src={photo || ''} alt={`Auto ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Call Button */}
            <div className="p-4 border-t border-gray-100 bg-white">
              <a
                href={`tel:${selectedProvider.phone}`}
                onClick={() => setSelectedProvider(null)}
                className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm transition-colors no-underline"
              >
                <Phone className="w-4 h-4" />
                Llamar al Conductor
              </a>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/90"
        >
          <img src={lightboxSrc} alt="Foto" className="max-w-[95%] max-h-[90vh] object-contain rounded-lg" />
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )

  // ---- DRIVER REGISTER VIEW ----
  const renderDriverRegister = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-gray-50"
    >
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setView('home')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Registro de Conductor</h1>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-md mx-auto">
        {/* Profile Photo Upload */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="relative">
            <Avatar className="w-24 h-24 border-4 border-white shadow-lg">
              <AvatarImage src={regPhoto || undefined} />
              <AvatarFallback className="text-2xl font-bold" style={{ backgroundColor: BRAND_COLOR, color: 'white' }}>
                {regForm.name ? regForm.name.charAt(0).toUpperCase() : <Camera className="w-8 h-8" />}
              </AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer" style={{ backgroundColor: BRAND_COLOR }}>
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) setRegPhoto(await fileToBase64(file))
                }}
              />
            </label>
          </div>
          <span className="text-xs text-gray-400">Foto de perfil</span>
        </div>

        {/* Form Fields */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Nombre completo *</Label>
            <Input
              placeholder="Tu nombre"
              value={regForm.name}
              onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Teléfono *</Label>
            <Input
              placeholder="+53 5 1234567"
              value={regForm.phone}
              onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
              type="tel"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">PIN (4-6 dígitos) *</Label>
              <div className="relative">
                <Input
                  placeholder="••••"
                  value={regForm.pin}
                  onChange={(e) => setRegForm({ ...regForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  type={showPin ? 'text' : 'password'}
                  className="h-11 rounded-xl pr-10"
                />
                <button
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Confirmar PIN *</Label>
              <div className="relative">
                <Input
                  placeholder="••••"
                  value={regForm.confirmPin}
                  onChange={(e) => setRegForm({ ...regForm, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  type={showConfirmPin ? 'text' : 'password'}
                  className={cn(
                    'h-11 rounded-xl pr-10',
                    regForm.confirmPin && regForm.confirmPin !== regForm.pin && 'border-red-400 focus-visible:ring-red-400'
                  )}
                />
                <button
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Marca del auto</Label>
              <Input
                placeholder="Toyota"
                value={regForm.carBrand}
                onChange={(e) => setRegForm({ ...regForm, carBrand: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Modelo del auto</Label>
              <Input
                placeholder="Corolla 2020"
                value={regForm.carModel}
                onChange={(e) => setRegForm({ ...regForm, carModel: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">¿Qué servicio ofreces?</Label>
            <Textarea
              placeholder="Ej: Transporte de pasajeros La Habana-Varadero, mudanzas locales..."
              value={regForm.services}
              onChange={(e) => setRegForm({ ...regForm, services: e.target.value })}
              rows={3}
              className="rounded-xl resize-none"
            />
          </div>
        </div>

        {/* Car Photos */}
        <div>
          <Label className="text-xs font-medium text-gray-500 mb-2 block">Fotos del auto (hasta 3)</Label>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <label key={i} className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const b64 = await fileToBase64(file)
                      const newPhotos = [...regCarPhotos]
                      newPhotos[i] = b64
                      setRegCarPhotos(newPhotos)
                    }
                  }}
                />
                <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-colors overflow-hidden">
                  {regCarPhotos[i] ? (
                    <img src={regCarPhotos[i]} alt={`Auto ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-gray-300" />
                      <span className="text-[10px] text-gray-400">Foto {i + 1}</span>
                    </>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleRegister}
          disabled={registering}
          className="w-full h-12 rounded-2xl text-white font-semibold text-sm shadow-lg"
          style={{ backgroundColor: BRAND_COLOR }}
        >
          {registering ? 'Registrando...' : 'Crear Cuenta'}
        </Button>

        <p className="text-center text-xs text-gray-400">
          ¿Ya tienes cuenta?{' '}
          <button onClick={() => setView('driver-login')} className="font-semibold" style={{ color: BRAND_COLOR }}>
            Inicia sesión
          </button>
        </p>
      </div>
    </motion.div>
  )

  // ---- DRIVER LOGIN VIEW ----
  const renderDriverLogin = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-gray-50 flex flex-col"
    >
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setView('home')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Iniciar Sesión</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: BRAND_COLOR }}>
              <Car className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Conductor</h2>
            <p className="text-sm text-gray-500 mt-1">Ingresa tu teléfono y PIN</p>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Teléfono</Label>
              <Input
                placeholder="+53 5 1234567"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                type="tel"
                className="h-12 rounded-xl text-base"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">PIN</Label>
              <div className="relative">
                <Input
                  placeholder="••••"
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value)}
                  type={loginShowPin ? 'text' : 'password'}
                  className="h-12 rounded-xl text-base pr-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
                <button
                  onClick={() => setLoginShowPin(!loginShowPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {loginShowPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {loginError && (
            <p className="text-sm text-red-500 text-center bg-red-50 py-2 px-4 rounded-xl">{loginError}</p>
          )}

          <Button
            onClick={handleLogin}
            className="w-full h-12 rounded-2xl text-white font-semibold text-sm shadow-lg"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            Iniciar Sesión
          </Button>

          <p className="text-center text-xs text-gray-400">
            ¿No tienes cuenta?{' '}
            <button onClick={() => setView('driver-register')} className="font-semibold" style={{ color: BRAND_COLOR }}>
              Regístrate aquí
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  )

  // ---- DRIVER PANEL VIEW ----
  const renderDriverPanel = () => {
    if (!currentProvider) return null
    const p = currentProvider
    const carPhotos = [p.carPhoto1, p.carPhoto2, p.carPhoto3].filter(Boolean) as string[]

    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="min-h-screen bg-gray-50"
      >
        {/* Header */}
        <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setView('home')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Mi Panel</h1>
            <div className="ml-auto">
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                p.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              )}>
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  p.available ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                )} />
                {p.available ? 'EN VIVO' : 'Desconectado'}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4 max-w-md mx-auto">
          {/* Profile Card */}
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="h-24 relative" style={{ background: `linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR}bb)` }}>
              <div className="absolute -bottom-10 left-5">
                <Avatar className="w-20 h-20 border-4 border-white shadow-md">
                  <AvatarImage src={p.photo || undefined} />
                  <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: BRAND_COLOR }}>
                    {p.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
            <CardContent className="pt-12 pb-4 px-5">
              <h2 className="text-xl font-bold text-gray-900">{p.name}</h2>
              {(p.carBrand || p.carModel) && (
                <p className="text-sm text-gray-500 mt-0.5">
                  🚗 {p.carBrand}{p.carBrand && p.carModel ? ' ' : ''}{p.carModel}
                </p>
              )}
              {p.bio && (
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{p.bio}</p>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
              <Phone className="w-4 h-4 mx-auto text-gray-400 mb-1" />
              <div className="text-xs font-semibold text-gray-900">{formatPhone(p.phone)}</div>
              <div className="text-[10px] text-gray-400">Teléfono</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
              <Star className="w-4 h-4 mx-auto text-amber-400 mb-1" />
              <div className="text-xs font-semibold text-gray-900">{p.rating.toFixed(1)}</div>
              <div className="text-[10px] text-gray-400">Calificación</div>
            </div>
            <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
              <MapPin className="w-4 h-4 mx-auto text-gray-400 mb-1" />
              <div className="text-xs font-semibold text-gray-900">****</div>
              <div className="text-[10px] text-gray-400">PIN</div>
            </div>
          </div>

          {/* Go Live Toggle */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    p.available ? 'bg-green-100' : 'bg-gray-100'
                  )}>
                    <Navigation className={cn(
                      'w-5 h-5',
                      p.available ? 'text-green-600' : 'text-gray-400'
                    )} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {p.available ? 'Estás en VIVO' : 'Ir en Vivo'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {p.available ? 'Los usuarios pueden verte en el mapa' : 'Aparece en el mapa en tiempo real'}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={p.available}
                  onCheckedChange={() => handleToggleLive()}
                  disabled={togglingLive}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Car Photos */}
          {carPhotos.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Fotos del Auto</h3>
                <div className="grid grid-cols-3 gap-2">
                  {carPhotos.map((photo, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
                      onClick={() => setLightboxSrc(photo)}
                    >
                      <img src={photo} alt={`Auto ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              onClick={openEdit}
              variant="outline"
              className="w-full h-12 rounded-2xl font-semibold text-sm"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar Perfil
            </Button>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full h-12 rounded-2xl font-semibold text-sm text-red-500 border-red-200 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Lightbox */}
        {lightboxSrc && (
          <div onClick={() => setLightboxSrc(null)} className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/90">
            <img src={lightboxSrc} alt="Foto" className="max-w-[95%] max-h-[90vh] object-contain rounded-lg" />
            <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </motion.div>
    )
  }

  // ---- DRIVER EDIT VIEW ----
  const renderDriverEdit = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-gray-50"
    >
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setView('driver-panel')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Editar Perfil</h1>
        </div>
      </div>

      <div className="p-4 space-y-5 max-w-md mx-auto">
        {/* Profile Photo */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="relative">
            <Avatar className="w-24 h-24 border-4 border-white shadow-lg">
              <AvatarImage src={editPhotos.photo ?? currentProvider?.photo ?? undefined} />
              <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: BRAND_COLOR }}>
                {editForm.name ? editForm.name.charAt(0).toUpperCase() : currentProvider?.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer" style={{ backgroundColor: BRAND_COLOR }}>
              <Camera className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) setEditPhotos({ ...editPhotos, photo: await fileToBase64(file) })
                }}
              />
            </label>
          </div>
          <span className="text-xs text-gray-400">Toca para cambiar foto</span>
        </div>

        {/* Form Fields */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Nombre completo</Label>
            <Input
              value={editForm.name || ''}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="h-11 rounded-xl"
            />
          </div>

          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Teléfono</Label>
            <Input
              value={editForm.phone || ''}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              type="tel"
              className="h-11 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Marca del auto</Label>
              <Input
                value={editForm.carBrand || ''}
                onChange={(e) => setEditForm({ ...editForm, carBrand: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Modelo del auto</Label>
              <Input
                value={editForm.carModel || ''}
                onChange={(e) => setEditForm({ ...editForm, carModel: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">¿Qué servicio ofreces?</Label>
            <Textarea
              value={editForm.services || ''}
              onChange={(e) => setEditForm({ ...editForm, services: e.target.value })}
              rows={3}
              className="rounded-xl resize-none"
            />
          </div>

          <Separator />

          {/* PIN Verification */}
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1 block">Confirma tu PIN para guardar *</Label>
            <div className="relative">
              <Input
                placeholder="••••"
                value={editPin}
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                type={editShowPin ? 'text' : 'password'}
                className="h-11 rounded-xl pr-10"
              />
              <button
                onClick={() => setEditShowPin(!editShowPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {editShowPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Car Photos */}
        <div>
          <Label className="text-xs font-medium text-gray-500 mb-2 block">Fotos del auto</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['carPhoto1', 'carPhoto2', 'carPhoto3'] as const).map((key, i) => {
              const currentPhoto = currentProvider?.[key] || null
              const editPhoto = editPhotos[key]
              const displayPhoto = editPhoto !== undefined ? editPhoto : currentPhoto
              const label = ['Auto 1', 'Auto 2', 'Auto 3'][i]

              return (
                <label key={key} className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) setEditPhotos({ ...editPhotos, [key]: await fileToBase64(file) })
                    }}
                  />
                  <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 transition-colors overflow-hidden">
                    {displayPhoto ? (
                      <img src={displayPhoto} alt={label} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Camera className="w-5 h-5 text-gray-300" />
                        <span className="text-[10px] text-gray-400">{label}</span>
                      </>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSaveProfile}
          className="w-full h-12 rounded-2xl text-white font-semibold text-sm shadow-lg"
          style={{ backgroundColor: BRAND_COLOR }}
        >
          <Check className="w-4 h-4 mr-2" />
          Guardar Cambios
        </Button>
      </div>
    </motion.div>
  )

  // ---- DOCTOR VIEW (Placeholder) ----
  const renderDoctor = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-gray-50 flex flex-col"
    >
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setView('home')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Doctor</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 bg-green-100 flex items-center justify-center">
            <Stethoscope className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Próximamente</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            El servicio de doctores estará disponible pronto. Podrás buscar médicos en la Florida y el Caribe directamente desde el mapa.
          </p>
          <Button
            onClick={() => setView('home')}
            className="mt-6 rounded-2xl text-white"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            Volver al Mapa
          </Button>
        </div>
      </div>
    </motion.div>
  )

  // ---- CLIENTE VIEW (Placeholder) ----
  const renderCliente = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-gray-50 flex flex-col"
    >
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setView('home')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Cliente</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 bg-amber-100 flex items-center justify-center">
            <Users className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Próximamente</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            El servicio para clientes estará disponible pronto. Podrás solicitar servicios de transporte, carga y más desde tu ubicación.
          </p>
          <Button
            onClick={() => setView('home')}
            className="mt-6 rounded-2xl text-white"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            Volver al Mapa
          </Button>
        </div>
      </div>
    </motion.div>
  )

  // =============================================
  // ADMIN HANDLERS
  // =============================================

  const adminFlash = (text: string) => { setAdminMsg(text); setTimeout(() => setAdminMsg(''), 3000) }

  const fetchAdminProviders = useCallback(async () => {
    setAdminLoading(true)
    try {
      const params = new URLSearchParams()
      if (adminSearch) params.set('search', adminSearch)
      params.set('all', 'true')
      const res = await fetch(`/api/admin/providers?${params}`, {
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken || '' },
      })
      if (res.ok) {
        setAdminProviders(await res.json())
      } else if (res.status === 401) {
        setAdminToken(null); setView('home')
      }
    } catch { /* ignore */ }
    setAdminLoading(false)
  }, [adminSearch, adminToken])

  // Auto-refresh admin list
  useEffect(() => {
    if (view === 'admin-panel' && adminToken) fetchAdminProviders()
  }, [view, adminToken, fetchAdminProviders])

  const handleAdminLogin = async () => {
    setAdminLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAdminToken(data.token)
        setAdminPassword('')
        setView('admin-panel')
      } else {
        setAdminLoginError(data.error || 'Error')
      }
    } catch { setAdminLoginError('Error de conexión') }
  }

  const handleAdminDelete = async () => {
    if (!adminDeleteId || !adminToken) return
    try {
      const res = await fetch(`/api/admin/providers/${adminDeleteId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      })
      const data = await res.json()
      if (res.ok) {
        adminFlash(`${data.deletedName} eliminado`)
        setAdminDeleteId(null)
        fetchAdminProviders()
      } else { adminFlash(data.error || 'Error') }
    } catch { adminFlash('Error de conexión') }
  }

  const handleAdminResetPin = async () => {
    if (!adminPinResetId || !adminToken) return
    try {
      const res = await fetch(`/api/admin/providers/${adminPinResetId}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ pin: adminNewPin || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        adminFlash(`PIN de ${data.name}: ${data.newPin}`)
        setAdminPinResetId(null); setAdminNewPin('')
        fetchAdminProviders()
      } else { adminFlash(data.error || 'Error') }
    } catch { adminFlash('Error de conexión') }
  }

  const handleAdminToggle = async (id: string, field: 'active' | 'available' | 'suspended', value: boolean) => {
    if (!adminToken) return
    try {
      const res = await fetch(`/api/admin/providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ [field]: !value }),
      })
      if (res.ok) fetchAdminProviders()
    } catch { adminFlash('Error') }
  }

  // =============================================
  // ADMIN LOGIN VIEW
  // =============================================
  const renderAdminLogin = () => (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-gray-50 flex flex-col"
    >
      <div className="bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setView('home')} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Administración</h1>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-red-500 to-orange-500">
              <Shield className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Panel Admin</h2>
            <p className="text-sm text-gray-500 mt-1">Flota de Autos</p>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-gray-500 mb-1 block">Contraseña</Label>
              <Input
                type="password"
                placeholder="Contraseña de admin"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                className="h-12 rounded-xl text-base"
              />
            </div>
          </div>
          {adminLoginError && (
            <p className="text-sm text-red-500 text-center bg-red-50 py-2 px-4 rounded-xl">{adminLoginError}</p>
          )}
          <Button
            onClick={handleAdminLogin}
            className="w-full h-12 rounded-2xl text-white font-semibold text-sm shadow-lg bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
          >
            Entrar al Panel
          </Button>
        </div>
      </div>
    </motion.div>
  )

  // =============================================
  // ADMIN PANEL VIEW
  // =============================================
  const renderAdminPanel = () => {
    if (!adminToken) return null
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="min-h-screen bg-gray-50"
      >
        {/* Header */}
        <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => { setAdminToken(null); setView('home') }} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">Admin</h1>
              <p className="text-xs text-gray-400">{adminProviders.length} conductores</p>
            </div>
            <button
              onClick={fetchAdminProviders}
              className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center"
            >
              <RefreshCw className={cn("w-4 h-4 text-blue-600", adminLoading && "animate-spin")} />
            </button>
            <button
              onClick={() => { setAdminToken(null); setView('home') }}
              className="px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold"
            >
              Salir
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nombre o teléfono..."
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                className="h-10 rounded-xl pl-9 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Toast message */}
        {adminMsg && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white text-sm px-5 py-2.5 rounded-xl shadow-xl">
            {adminMsg}
          </div>
        )}

        {/* Provider List */}
        <div className="p-4 space-y-3 max-w-2xl mx-auto">
          {adminLoading ? (
            <p className="text-center text-gray-400 py-10">Cargando...</p>
          ) : adminProviders.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No se encontraron conductores</p>
          ) : (
            adminProviders.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "bg-white rounded-2xl p-4 shadow-sm border-2 transition-colors",
                  p.suspended ? "border-red-200" : p.available ? "border-green-200" : "border-gray-100",
                  !p.active && "opacity-50"
                )}
              >
                <div className="flex gap-3">
                  {/* Photo */}
                  <Avatar className="w-12 h-12 flex-shrink-0 cursor-pointer" onClick={() => p.photo && setLightboxSrc(p.photo)}>
                    <AvatarImage src={p.photo || undefined} />
                    <AvatarFallback className="text-base font-bold text-white" style={{ backgroundColor: BRAND_COLOR }}>
                      {p.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-gray-900 truncate">{p.name}</span>
                      {p.available && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">EN VIVO</span>
                      )}
                      {p.suspended && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">SUSPENDIDO</span>
                      )}
                    </div>
                    {(p.carBrand || p.carModel) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.carBrand}{p.carBrand && p.carModel ? ' ' : ''}{p.carModel}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>
                      <span className="font-semibold text-gray-600">PIN: {p.pin}</span>
                      <span className="flex items-center gap-1"><Star className="w-3 h-3" />{p.rating.toFixed(1)}</span>
                    </div>
                    {p.bio && (
                      <p className="text-xs text-gray-400 mt-1 truncate">{p.bio}</p>
                    )}

                    {/* Car photos */}
                    {([p.carPhoto1, p.carPhoto2, p.carPhoto3].filter(Boolean).length > 0) && (
                      <div className="flex gap-1.5 mt-2">
                        {[p.carPhoto1, p.carPhoto2, p.carPhoto3].filter(Boolean).map((photo, i) => (
                          <div
                            key={i}
                            className="w-10 h-10 rounded-lg overflow-hidden cursor-pointer border border-gray-200"
                            onClick={() => photo && setLightboxSrc(photo)}
                          >
                            <img src={photo || ''} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => handleAdminToggle(p.id, 'available', p.available)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 h-9 rounded-xl text-xs font-semibold transition-colors",
                      p.available ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                    )}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {p.available ? 'Desconectar' : 'Activar Live'}
                  </button>
                  <button
                    onClick={() => handleAdminToggle(p.id, 'suspended', p.suspended)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1 h-9 rounded-xl text-xs font-semibold transition-colors",
                      p.suspended ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                    {p.suspended ? 'Reactivar' : 'Suspender'}
                  </button>
                  <button
                    onClick={() => setAdminPinResetId(p.id)}
                    className="flex-1 flex items-center justify-center gap-1 h-9 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Nuevo PIN
                  </button>
                  <button
                    onClick={() => setAdminDeleteId(p.id)}
                    className="flex-1 flex items-center justify-center gap-1 h-9 rounded-xl text-xs font-semibold bg-red-50 text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Reset PIN Modal */}
        {adminPinResetId && (
          <div
            onClick={() => { setAdminPinResetId(null); setAdminNewPin('') }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-[85%] max-w-[360px] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Nuevo PIN</h3>
                  <p className="text-xs text-gray-500">Deja vacío para PIN aleatorio</p>
                </div>
              </div>
              <Input
                placeholder="Nuevo PIN (4-6 dígitos)"
                value={adminNewPin}
                onChange={(e) => setAdminNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-11 rounded-xl mb-4 text-center text-lg tracking-widest"
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleAdminResetPin}
                  className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                >
                  Generar PIN
                </Button>
                <Button
                  onClick={() => { setAdminPinResetId(null); setAdminNewPin('') }}
                  variant="outline"
                  className="h-11 rounded-xl"
                >
                  Cancelar
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {adminDeleteId && (
          <div
            onClick={() => setAdminDeleteId(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-[85%] max-w-[360px] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="font-bold text-red-600">Eliminar Conductor</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">Se eliminará toda la información del conductor y no se podrá recuperar.</p>
              <div className="flex gap-3">
                <Button
                  onClick={handleAdminDelete}
                  className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  Sí, Eliminar
                </Button>
                <Button
                  onClick={() => setAdminDeleteId(null)}
                  variant="outline"
                  className="h-11 rounded-xl"
                >
                  Cancelar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    )
  }

  // =============================================
  // MAIN RENDER
  // =============================================

  return (
    <AnimatePresence mode="wait">
      {view === 'home' && <div key="home">{renderHome()}</div>}
      {view === 'driver-register' && <div key="driver-register">{renderDriverRegister()}</div>}
      {view === 'driver-login' && <div key="driver-login">{renderDriverLogin()}</div>}
      {view === 'driver-panel' && <div key="driver-panel">{renderDriverPanel()}</div>}
      {view === 'driver-edit' && <div key="driver-edit">{renderDriverEdit()}</div>}
      {view === 'doctor' && <div key="doctor">{renderDoctor()}</div>}
      {view === 'cliente' && <div key="cliente">{renderCliente()}</div>}
      {view === 'admin-login' && <div key="admin-login">{renderAdminLogin()}</div>}
      {view === 'admin-panel' && <div key="admin-panel">{renderAdminPanel()}</div>}
    </AnimatePresence>
  )
}
