'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// shadcn/ui components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// lucide icons
import {
  ArrowLeft, Phone, Star, MessageCircle, MapPin, Clock, Search,
  Plus, Edit, LogOut, Heart, Send, ChevronRight, User, Briefcase,
  Camera, Check, Zap, Shield, Truck, Users, X, Menu,
} from 'lucide-react'

// =============================================
// CONSTANTS
// =============================================

export const CATEGORIES: Record<string, { label: string; emoji: string; color: string; desc: string }> = {
  pasaje: { label: 'Pasaje', emoji: '🚗', color: '#ea580c', desc: 'Transporte de pasajeros' },
  carga: { label: 'Carga', emoji: '🚚', color: '#7c3aed', desc: 'Transporte de carga y mudanzas' },
  comida: { label: 'Comida', emoji: '🍕', color: '#dc2626', desc: 'Carros de comida y snacks' },
  barbero: { label: 'Barberos', emoji: '💈', color: '#2563eb', desc: 'Barberos y peluqueros itinerantes' },
  fregador: { label: 'Fregado', emoji: '🧹', color: '#16a34a', desc: 'Carros de fregado y limpieza' },
  recreativo: { label: 'Carros Recreativos', emoji: '🚘', color: '#e11d48', desc: 'Carros recreativos y de paseo' },
  bote: { label: 'Botes Recreativos', emoji: '⛵', color: '#0891b2', desc: 'Botes recreativos y acuáticos' },
  mascotas: { label: 'Mascotas', emoji: '🐕', color: '#d97706', desc: 'Transporte y cuidado de mascotas' },
  cerrajeria: { label: 'Llaves', emoji: '🔑', color: '#6d28d9', desc: 'Mecánicos de llaves y cerrajería' },
}

export const VEHICLE_TYPES: Record<string, string> = {
  bicitaxi: 'Bicitaxi',
  carro_ruso: 'Carro Ruso',
  triciclo: 'Triciclo',
  carro_moderno: 'Carro Moderno',
  almendron: 'Almendrón',
  camion_mediano: 'Camión Mediano',
  camion_grande: 'Camión Grande',
  carro_recreativo: 'Carro Recreativo',
  bote_recreativo: 'Bote Recreativo',
  carro_mascotas: 'Carro de Mascotas',
}

export const CATEGORY_VEHICLES: Record<string, string[]> = {
  pasaje: ['bicitaxi', 'carro_ruso', 'triciclo', 'carro_moderno', 'almendron'],
  carga: ['camion_mediano', 'camion_grande', 'triciclo', 'carro_moderno'],
  comida: ['triciclo', 'carro_moderno', 'carro_ruso'],
  barbero: [],
  fregador: ['triciclo', 'carro_moderno', 'bicitaxi'],
  recreativo: ['carro_recreativo', 'carro_moderno'],
  bote: ['bote_recreativo'],
  mascotas: ['carro_mascotas', 'carro_moderno'],
  cerrajeria: [],
}

const TRUST_BADGES = [
  { key: 'punctual', label: 'Puntual', icon: '⏰' },
  { key: 'respectful', label: 'Respetuoso', icon: '🤝' },
  { key: 'careful', label: 'Cuidadoso', icon: '🛡️' },
  { key: 'recommended', label: 'Recomendado', icon: '👍' },
]

type ViewType = 'welcome' | 'providers' | 'profile' | 'register' | 'login' | 'mypanel' | 'editprofile' | 'forums' | 'forumDetail'

// =============================================
// HELPER FUNCTIONS
// =============================================

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'ahora mismo'
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`
  if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} d`
  return `hace ${Math.floor(seconds / 604800)} sem`
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('53')) return `+${cleaned}`
  if (cleaned.startsWith('+53')) return cleaned
  return `+53${cleaned}`
}

// =============================================
// TYPES
// =============================================

interface Provider {
  id: string
  name: string
  phone: string
  pin?: string
  serviceCategory: string
  vehicleType: string
  lat?: number
  lng?: number
  active: boolean
  available: boolean
  rating: number
  totalJobs: number
  photo?: string | null
  bio?: string | null
  businessName?: string | null
  services?: string | null
  priceRange?: string | null
  schedule?: string | null
  socialMedia?: string | null
  carPhoto1?: string | null
  carPhoto2?: string | null
  carPhoto3?: string | null
  notes?: string | null
  suspended: boolean
  suspendedReason?: string | null
  route1From?: string | null
  route1To?: string | null
  route2From?: string | null
  route2To?: string | null
  route3From?: string | null
  route3To?: string | null
  sessionToken?: string | null
  createdAt: string
  updatedAt: string
}

interface Forum {
  id: string
  title: string
  description: string
  icon: string
  color: string
  order: number
  postsCount: number
  posts?: ForumPost[]
  _count?: { posts: number }
  createdAt: string
}

interface ForumPost {
  id: string
  forumId: string
  authorName: string
  authorPhone?: string | null
  title: string
  content: string
  likes: number
  pinned: boolean
  createdAt: string
}

interface Message {
  id: string
  content: string
  senderType: string
  senderId: string
  receiverType: string
  receiverId: string
  read: boolean
  createdAt: string
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
// MAIN COMPONENT
// =============================================

export default function ChambitaPage() {
  // ---- Core view state ----
  const [view, setView] = useState<ViewType>('welcome')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedForumId, setSelectedForumId] = useState<string | null>(null)

  // ---- Auth state ----
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null)
  const [currentToken, setCurrentToken] = useState<string | null>(null)

  // ---- Data state ----
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerDetail, setProviderDetail] = useState<Provider | null>(null)
  const [forums, setForums] = useState<Forum[]>([])
  const [forumDetail, setForumDetail] = useState<Forum | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  // ---- Providers filter ----
  const [searchQuery, setSearchQuery] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  // ---- Chat state ----
  const [chatOpen, setChatOpen] = useState(false)
  const [chatTarget, setChatTarget] = useState<Provider | null>(null)
  const [chatMessage, setChatMessage] = useState('')

  // ---- Review state ----
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewBadges, setReviewBadges] = useState({
    punctual: false, respectful: false, careful: false, recommended: false,
  })

  // ---- New forum post state ----
  const [newPostOpen, setNewPostOpen] = useState(false)
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostAuthor, setNewPostAuthor] = useState('')
  const [newPostAuthorPhone, setNewPostAuthorPhone] = useState('')

  // ---- Register wizard state ----
  const [regStep, setRegStep] = useState(1)
  const [regForm, setRegForm] = useState({
    name: '', businessName: '', phone: '', pin: '', confirmPin: '',
    serviceCategory: '', vehicleType: '', bio: '', services: '',
    priceRange: '', schedule: '',
  })
  const [regPhoto, setRegPhoto] = useState<string | null>(null)
  const [regCarPhotos, setRegCarPhotos] = useState<string[]>([])

  // ---- Login state ----
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [loginError, setLoginError] = useState('')

  // ---- Edit profile state ----
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editPin, setEditPin] = useState('')
  const [editPhotos, setEditPhotos] = useState<{ photo?: string; carPhoto1?: string; carPhoto2?: string; carPhoto3?: string }>({})

  // ---- Live toggle state ----
  const [togglingLive, setTogglingLive] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)

  // ---- Load session from localStorage (lazy init avoids set-state-in-effect) ----
  const sessionRef = useRef<{ provider: Provider | null; token: string | null }>({ provider: null, token: null })
  useEffect(() => {
    try {
      const stored = localStorage.getItem('chambita_session')
      if (stored) {
        const session = JSON.parse(stored)
        if (session.provider && session.token) {
          sessionRef.current = session
          // Defer state update to avoid synchronous setState in effect
          queueMicrotask(() => {
            setCurrentProvider(session.provider)
            setCurrentToken(session.token)
          })
        }
      }
    } catch { /* ignore */ }
  }, [])

  // ---- Seed forums on first load ----
  useEffect(() => {
    fetch('/api/forums/seed', { method: 'POST' }).catch(() => {})
  }, [])

  // ---- Auto-scroll chat ----
  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [messages])

  // ---- Navigation helpers ----
  const goProviders = useCallback((cat: string) => {
    setSelectedCategory(cat)
    setFilterCategory(cat)
    setView('providers')
  }, [])

  const goProfile = useCallback((id: string) => {
    setSelectedProviderId(id)
    setView('profile')
  }, [])

  const goForumDetail = useCallback((id: string) => {
    setSelectedForumId(id)
    setView('forumDetail')
  }, [])

  const goBack = useCallback(() => {
    if (view === 'profile' || view === 'forumDetail') setView('providers')
    else if (view === 'editprofile') setView('mypanel')
    else if (view === 'providers') setView('welcome')
    else setView('welcome')
  }, [view])

  // ---- API helpers ----
  const fetchProviders = useCallback(async (category?: string | null, onlyAvailable?: boolean, search?: string) => {
    queueMicrotask(() => setLoading(true))
    try {
      const params = new URLSearchParams()
      if (category && category !== 'all') params.set('category', category)
      if (onlyAvailable) params.set('available', 'true')
      if (search) params.set('search', search)
      const res = await fetch(`/api/providers?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setProviders(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchProviderDetail = useCallback(async (id: string) => {
    queueMicrotask(() => setLoading(true))
    try {
      const res = await fetch(`/api/providers/${id}`)
      if (res.ok) {
        const data = await res.json()
        setProviderDetail(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchForums = useCallback(async () => {
    queueMicrotask(() => setLoading(true))
    try {
      const res = await fetch('/api/forums')
      if (res.ok) {
        const data = await res.json()
        setForums(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchForumDetail = useCallback(async (id: string) => {
    queueMicrotask(() => setLoading(true))
    try {
      const res = await fetch(`/api/forums/${id}`)
      if (res.ok) {
        const data = await res.json()
        setForumDetail(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchMessages = useCallback(async (providerId: string) => {
    try {
      const params = new URLSearchParams({
        user1Type: 'client', user1Id: 'guest',
        user2Type: 'provider', user2Id: providerId,
      })
      const res = await fetch(`/api/messages/conversation?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch { /* ignore */ }
  }, [])

  // ---- Load data on view change ----
  useEffect(() => {
    if (view === 'providers') void fetchProviders(filterCategory, availableOnly, searchQuery || undefined)
    else if (view === 'profile' && selectedProviderId) void fetchProviderDetail(selectedProviderId)
    else if (view === 'forums') void fetchForums()
    else if (view === 'forumDetail' && selectedForumId) void fetchForumDetail(selectedForumId)
    else if (view === 'mypanel' && currentProvider?.id) void fetchProviderDetail(currentProvider.id)
  }, [view])

  useEffect(() => {
    if (view === 'providers') {
      void fetchProviders(filterCategory, availableOnly, searchQuery || undefined)
    }
  }, [filterCategory, availableOnly, searchQuery])

  useEffect(() => {
    if (view === 'mypanel' && selectedProviderId) {
      void fetchProviderDetail(selectedProviderId)
    }
  }, [selectedProviderId])

  // ---- When profile loads, update mypanel provider if it's the same ----
  useEffect(() => {
    if (view === 'mypanel' && providerDetail && currentProvider && providerDetail.id === currentProvider.id) {
      queueMicrotask(() => setCurrentProvider(providerDetail))
      sessionRef.current = { provider: providerDetail, token: currentToken }
      try {
        localStorage.setItem('chambita_session', JSON.stringify({ provider: providerDetail, token: currentToken }))
      } catch { /* ignore */ }
    }
  }, [providerDetail])

  // ---- Handlers ----
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
        localStorage.setItem('chambita_session', JSON.stringify({ provider: data.provider, token: data.token }))
        toast.success('¡Bienvenido de vuelta!')
        setSelectedProviderId(data.provider.id)
        setView('mypanel')
      } else {
        setLoginError(data.error || 'Error al iniciar sesión')
      }
    } catch {
      setLoginError('Error de conexión')
    }
  }

  const handleRegister = async () => {
    // Step 1 validation
    if (regStep === 1) {
      if (!regForm.name.trim()) { toast.error('El nombre es obligatorio'); return }
      if (!regForm.phone.trim()) { toast.error('El teléfono es obligatorio'); return }
      if (!regForm.pin.trim() || regForm.pin.length < 4) { toast.error('El PIN debe tener al menos 4 dígitos'); return }
      if (regForm.pin !== regForm.confirmPin) { toast.error('Los PINs no coinciden'); return }
      setRegStep(2)
      return
    }
    // Step 2 validation
    if (regStep === 2) {
      if (!regForm.serviceCategory) { toast.error('Selecciona una categoría de servicio'); return }
      setRegStep(3)
      return
    }
    // Step 3 - Submit
    try {
      const payload: Record<string, unknown> = {
        name: regForm.name.trim(),
        phone: regForm.phone.trim(),
        pin: regForm.pin.trim(),
        serviceCategory: regForm.serviceCategory,
        vehicleType: regForm.vehicleType || 'carro_moderno',
        businessName: regForm.businessName.trim() || undefined,
        bio: regForm.bio.trim() || undefined,
        services: regForm.services.split(',').map((s) => s.trim()).filter(Boolean),
        priceRange: regForm.priceRange.trim() || undefined,
        schedule: regForm.schedule.trim() || undefined,
      }
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
        toast.success('¡Registro exitoso! Inicia sesión con tu teléfono y PIN')
        setLoginPhone(regForm.phone)
        setView('login')
        // Reset form
        setRegStep(1)
        setRegForm({ name: '', businessName: '', phone: '', pin: '', confirmPin: '', serviceCategory: '', vehicleType: '', bio: '', services: '', priceRange: '', schedule: '' })
        setRegPhoto(null)
        setRegCarPhotos([])
      } else {
        toast.error(data.error || 'Error al registrarse')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleToggleLive = async () => {
    if (!currentProvider || !currentToken) return
    setTogglingLive(true)
    try {
      const res = await fetch(`/api/providers/${currentProvider.id}/toggle-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setCurrentProvider(data.provider)
        localStorage.setItem('chambita_session', JSON.stringify({ provider: data.provider, token: currentToken }))
        toast.success(data.available ? '🟢 ¡Estás en vivo!' : '⚫ Te has desconectado')
        fetchProviderDetail(currentProvider.id)
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
        localStorage.setItem('chambita_session', JSON.stringify({ provider: updated, token: currentToken }))
        toast.success('Perfil actualizado correctamente')
        setView('mypanel')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleSendMessage = async () => {
    if (!chatTarget || !chatMessage.trim()) return
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: chatMessage.trim(),
          senderType: 'client', senderId: 'guest',
          receiverType: 'provider', receiverId: chatTarget.id,
        }),
      })
      setChatMessage('')
      fetchMessages(chatTarget.id)
    } catch {
      toast.error('Error al enviar mensaje')
    }
  }

  const handleSubmitReview = async () => {
    if (!providerDetail || reviewRating === 0) return
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'provider', targetId: providerDetail.id,
          reviewerType: 'client', reviewerId: 'guest',
          rating: reviewRating, comment: reviewComment,
          ...reviewBadges,
        }),
      })
      toast.success('¡Reseña enviada! Gracias por tu opinión')
      setReviewOpen(false)
      setReviewRating(0)
      setReviewComment('')
      setReviewBadges({ punctual: false, respectful: false, careful: false, recommended: false })
      fetchProviderDetail(providerDetail.id)
    } catch {
      toast.error('Error al enviar reseña')
    }
  }

  const handleNewPost = async () => {
    if (!selectedForumId || !newPostTitle.trim() || !newPostContent.trim() || !newPostAuthor.trim()) {
      toast.error('Nombre, título y contenido son obligatorios')
      return
    }
    try {
      await fetch(`/api/forums/${selectedForumId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: newPostAuthor.trim(),
          authorPhone: newPostAuthorPhone.trim() || undefined,
          title: newPostTitle.trim(),
          content: newPostContent.trim(),
        }),
      })
      toast.success('¡Publicación creada!')
      setNewPostOpen(false)
      setNewPostTitle('')
      setNewPostContent('')
      setNewPostAuthor('')
      setNewPostAuthorPhone('')
      fetchForumDetail(selectedForumId)
    } catch {
      toast.error('Error al crear publicación')
    }
  }

  const handleLogout = () => {
    setCurrentProvider(null)
    setCurrentToken(null)
    localStorage.removeItem('chambita_session')
    toast.success('Sesión cerrada')
    setView('welcome')
  }

  // Open chat with provider
  const openChat = (provider: Provider) => {
    setChatTarget(provider)
    setChatOpen(true)
    fetchMessages(provider.id)
  }

  // File to base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // =============================================
  // RENDER VIEWS
  // =============================================

  // ---- STAR RATING COMPONENT ----
  const StarRating = ({ rating, onRate, size = 18 }: { rating: number; onRate?: (r: number) => void; size?: number }) => (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            'transition-colors',
            i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300',
            onRate && 'cursor-pointer hover:scale-110'
          )}
          size={size}
          onClick={() => onRate?.(i)}
        />
      ))}
    </div>
  )

  // ---- AVATAR COMPONENT ----
  const ProviderAvatar = ({ provider, size = 40 }: { provider: Provider; size?: number }) => {
    const cat = CATEGORIES[provider.serviceCategory]
    return (
      <Avatar style={{ width: size, height: size, minWidth: size }} className="rounded-full">
        <AvatarImage src={provider.photo || undefined} alt={provider.name} />
        <AvatarFallback style={{ backgroundColor: cat?.color || '#ea580c' }} className="text-white font-semibold">
          {provider.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    )
  }

  // ===========================
  // WELCOME VIEW
  // ===========================
  const renderWelcome = () => (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-6 pb-8">
      {/* Hero Section */}
      <div className="text-center pt-4 pb-2 px-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg mb-4"
        >
          <Truck className="text-white" size={40} />
        </motion.div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
          <span className="text-orange-600">Chambi</span>ta
        </h1>
        <p className="text-gray-500 mt-2 text-sm md:text-base">
          Tu plataforma de servicios móviles en Cuba
        </p>
      </div>

      {/* Search Bar */}
      <div className="px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            placeholder="Buscar proveedor, servicio..."
            className="pl-10 h-12 rounded-xl bg-white border-gray-200 text-base"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setFilterCategory(null)
                setSelectedCategory(null)
                setView('providers')
              }
            }}
          />
        </div>
      </div>

      {/* Category Grid */}
      <div className="px-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">¿Qué necesitas?</h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <motion.div key={key} variants={staggerItem}>
              <Card
                className="cursor-pointer hover:shadow-md transition-all duration-200 border-0 bg-white overflow-hidden group"
                onClick={() => goProviders(key)}
                style={{ gap: 0, padding: 0 }}
              >
                <div
                  className="h-1.5"
                  style={{ backgroundColor: cat.color }}
                />
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <span className="text-2xl md:text-3xl group-hover:scale-110 transition-transform">{cat.emoji}</span>
                  <span className="font-semibold text-gray-800 text-xs md:text-sm">{cat.label}</span>
                  <span className="text-[10px] md:text-xs text-gray-500 leading-tight hidden md:block">{cat.desc}</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="px-4 flex flex-col gap-3">
        <Button
          className="h-12 text-base rounded-xl font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200"
          onClick={() => setView('register')}
        >
          <Briefcase className="mr-2" size={20} />
          Soy Proveedor — Inscríbete
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-11 rounded-xl border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() => setView('login')}
          >
            <User className="mr-2" size={16} />
            Iniciar Sesión
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11 rounded-xl border-gray-200 hover:bg-gray-50"
            onClick={() => setView('forums')}
          >
            <Users className="mr-2" size={16} />
            Comunidad
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="px-4 mt-2">
        <Separator className="mb-6" />
        <h2 className="text-lg font-semibold text-gray-800 mb-4">¿Cómo funciona?</h2>
        <div className="flex flex-col gap-4">
          {[
            { icon: <Shield className="text-orange-600" size={24} />, step: '1', title: 'Regístrate', desc: 'Regístrate con tu teléfono y un PIN seguro' },
            { icon: <Edit className="text-orange-600" size={24} />, step: '2', title: 'Completa tu perfil', desc: 'Agrega tu información y sube fotos de tu negocio' },
            { icon: <Zap className="text-orange-600" size={24} />, step: '3', title: 'Activa tu servicio', desc: 'Activa tu estado y recibe clientes de inmediato' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-600 font-bold text-sm shrink-0">
                {item.step}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )

  // ===========================
  // PROVIDERS VIEW
  // ===========================
  const renderProviders = () => (
    <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={goBack}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {selectedCategory ? `${CATEGORIES[selectedCategory]?.emoji} ${CATEGORIES[selectedCategory]?.label}` : 'Todos los Proveedores'}
          </h1>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <Input
            placeholder="Buscar..."
            className="pl-9 h-9 text-sm rounded-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Badge
            variant={filterCategory === null ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer shrink-0 rounded-full px-3 text-xs font-medium transition-colors',
              filterCategory === null ? 'bg-orange-600 text-white hover:bg-orange-700 border-orange-600' : 'hover:bg-orange-50 text-gray-600'
            )}
            onClick={() => setFilterCategory(null)}
          >
            Todos
          </Badge>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <Badge
              key={key}
              variant={filterCategory === key ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer shrink-0 rounded-full px-3 text-xs font-medium transition-colors',
                filterCategory === key ? 'text-white hover:opacity-90 border-transparent' : 'hover:bg-orange-50 text-gray-600',
                filterCategory === key ? '' : ''
              )}
              style={filterCategory === key ? { backgroundColor: cat.color } : {}}
              onClick={() => setFilterCategory(key)}
            >
              {cat.emoji} {cat.label}
            </Badge>
          ))}
        </div>

        {/* Available toggle */}
        <div className="flex items-center gap-2 mt-3">
          <Switch checked={availableOnly} onCheckedChange={setAvailableOnly} />
          <span className="text-sm text-gray-600">Solo disponibles ahora</span>
        </div>
      </div>

      {/* Provider List */}
      <div className="flex-1 p-4">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </Card>
            ))}
          </div>
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Search className="text-gray-400" size={28} />
            </div>
            <p className="text-gray-500 font-medium">No hay proveedores en esta categoría aún</p>
            <p className="text-gray-400 text-sm mt-1">Prueba con otra categoría o busca algo diferente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((p) => {
              const cat = CATEGORIES[p.serviceCategory]
              const services = p.services ? (typeof p.services === 'string' ? JSON.parse(p.services) : p.services) : []
              return (
                <Card key={p.id} className="p-4 hover:shadow-md transition-shadow border-0 bg-white shadow-sm" style={{ gap: 0 }}>
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <ProviderAvatar provider={p} size={44} />
                      <div className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white',
                        p.available ? 'bg-green-500' : 'bg-gray-400'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate text-sm">{p.name}</h3>
                        <Badge
                          className="shrink-0 text-[10px] px-1.5 py-0 text-white border-0 rounded"
                          style={{ backgroundColor: cat?.color || '#ea580c' }}
                        >
                          {cat?.emoji} {cat?.label}
                        </Badge>
                      </div>
                      {p.businessName && p.businessName !== p.name && (
                        <p className="text-xs text-gray-500 truncate">{p.businessName}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <StarRating rating={Math.round(p.rating)} size={13} />
                        <span className="text-xs text-gray-400">{p.rating.toFixed(1)}</span>
                        {p.available && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
                            EN VIVO
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {services.slice(0, 3).map((s: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0 bg-gray-100 text-gray-600">
                        {s}
                      </Badge>
                    ))}
                    {services.length > 3 && (
                      <Badge variant="secondary" className="text-[10px] px-2 py-0 bg-gray-100 text-gray-600">
                        +{services.length - 3}
                      </Badge>
                    )}
                  </div>

                  {p.priceRange && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                      <span className="font-medium text-orange-600">{p.priceRange}</span>
                    </div>
                  )}

                  {p.schedule && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>{p.schedule}</span>
                    </div>
                  )}

                  {p.bio && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">{p.bio}</p>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="flex-1 h-9 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg"
                      asChild
                    >
                      <a href={`tel:${formatPhone(p.phone)}`}>
                        <Phone size={14} className="mr-1" /> Llamar
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-9 text-xs rounded-lg border-orange-200 text-orange-700 hover:bg-orange-50"
                      onClick={() => goProfile(p.id)}
                    >
                      Ver Perfil <ChevronRight size={14} className="ml-1" />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )

  // ===========================
  // PROFILE VIEW
  // ===========================
  const renderProfile = () => {
    if (loading || !providerDetail) {
      return (
        <div className="p-4 flex flex-col items-center justify-center min-h-[50vh]">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-20 w-20 rounded-full mb-4" />
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
      )
    }

    const p = providerDetail
    const cat = CATEGORIES[p.serviceCategory]
    const services = p.services ? (typeof p.services === 'string' ? JSON.parse(p.services) : p.services) : []
    const routes = [
      p.route1From && p.route1To ? `${p.route1From} → ${p.route1To}` : null,
      p.route2From && p.route2To ? `${p.route2From} → ${p.route2To}` : null,
      p.route3From && p.route3To ? `${p.route3From} → ${p.route3To}` : null,
    ].filter(Boolean)
    const photos = [p.carPhoto1, p.carPhoto2, p.carPhoto3].filter(Boolean)

    return (
      <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={goBack}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-bold text-gray-900 truncate">Perfil del Proveedor</h1>
        </div>

        <ScrollArea className="flex-1">
          <div className="pb-28">
            {/* Cover + Avatar */}
            <div className="relative">
              <div
                className="h-32 md:h-40"
                style={{ background: `linear-gradient(135deg, ${cat?.color || '#ea580c'}, ${cat?.color || '#ea580c'}99)` }}
              />
              <div className="absolute -bottom-10 left-4">
                <div className="relative">
                  <ProviderAvatar provider={p} size={80} />
                  <div className={cn(
                    'absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white',
                    p.available ? 'bg-green-500' : 'bg-gray-400'
                  )} />
                </div>
              </div>
            </div>

            <div className="px-4 pt-14">
              {/* Name and badge */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{p.name}</h2>
                  {p.businessName && p.businessName !== p.name && (
                    <p className="text-sm text-gray-500">{p.businessName}</p>
                  )}
                </div>
                <Badge
                  className="shrink-0 text-xs px-3 py-1 text-white border-0 rounded-full"
                  style={{ backgroundColor: cat?.color || '#ea580c' }}
                >
                  {cat?.emoji} {cat?.label}
                </Badge>
              </div>

              {/* Status + Rating */}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    p.available ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                  )} />
                  <span className={cn('text-sm font-medium', p.available ? 'text-green-700' : 'text-gray-500')}>
                    {p.available ? 'EN VIVO' : 'Desconectado'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <StarRating rating={Math.round(p.rating)} size={16} />
                  <span className="text-sm font-medium text-gray-700">{p.rating.toFixed(1)}</span>
                </div>
                <span className="text-sm text-gray-500">{p.totalJobs} servicios</span>
              </div>

              {/* Info sections */}
              <div className="mt-6 space-y-4">
                {p.bio && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Acerca de</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{p.bio}</p>
                  </div>
                )}

                {services.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Servicios</h3>
                    <div className="flex flex-wrap gap-2">
                      {services.map((s: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs px-2.5 py-1 bg-orange-50 text-orange-700">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {p.priceRange && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><span className="font-semibold">💰</span> Precio</span>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{p.priceRange}</p>
                    </div>
                  )}
                  {p.schedule && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12} /> Horario</span>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{p.schedule}</p>
                    </div>
                  )}
                  {p.vehicleType && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><span className="font-semibold">🚗</span> Vehículo</span>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{VEHICLE_TYPES[p.vehicleType] || p.vehicleType}</p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={12} /> Teléfono</span>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatPhone(p.phone)}</p>
                  </div>
                </div>

                {routes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Rutas frecuentes</h3>
                    <div className="space-y-2">
                      {routes.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                          <MapPin size={16} className="text-orange-600 shrink-0" />
                          <span className="text-sm text-gray-700">{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {p.notes && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Notas</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{p.notes}</p>
                  </div>
                )}

                {photos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Fotos</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo, i) => (
                        <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                          <img src={photo || ''} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Sticky Action Buttons */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t p-3 z-20">
          <div className="flex gap-2 max-w-lg mx-auto">
            <Button
              className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl"
              asChild
            >
              <a href={`tel:${formatPhone(p.phone)}`}>
                <Phone size={18} className="mr-1" /> Llamar
              </a>
            </Button>
            <Button
              className="flex-1 h-12 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl"
              onClick={() => openChat(p)}
            >
              <MessageCircle size={18} className="mr-1" /> Mensaje
            </Button>
            <Button
              className="h-12 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-xl"
              onClick={() => setReviewOpen(true)}
            >
              <Star size={18} />
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  // ===========================
  // REGISTER VIEW
  // ===========================
  const renderRegister = () => {
    const stepTitles = ['Datos básicos', 'Tu servicio', 'Personalización']

    return (
      <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={goBack}>
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Inscripción de Proveedor</h1>
            <p className="text-xs text-gray-500">Paso {regStep} de 3 — {stepTitles[regStep - 1]}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <Progress value={(regStep / 3) * 100} className="h-2 bg-orange-100" />
          <div className="flex justify-between mt-1.5">
            {[1, 2, 3].map((s) => (
              <span key={s} className={cn('text-[10px] font-medium', s <= regStep ? 'text-orange-600' : 'text-gray-400')}>
                {stepTitles[s - 1]}
              </span>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 px-4 py-6">
          <div className="max-w-md mx-auto space-y-4">
            {/* Step 1: Basic data */}
            {regStep === 1 && (
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
                <div className="text-center mb-2">
                  <div className="inline-flex w-14 h-14 rounded-full bg-orange-100 items-center justify-center mb-2">
                    <User className="text-orange-600" size={28} />
                  </div>
                  <p className="text-sm text-gray-500">Ingresa tus datos personales</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Nombre completo *</Label>
                  <Input
                    placeholder="Tu nombre"
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Nombre del negocio (opcional)</Label>
                  <Input
                    placeholder="Ej: El Rápido"
                    value={regForm.businessName}
                    onChange={(e) => setRegForm({ ...regForm, businessName: e.target.value })}
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Teléfono *</Label>
                  <Input
                    placeholder="5XXXXXXX"
                    type="tel"
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value.replace(/\D/g, '') })}
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">PIN de seguridad *</Label>
                  <Input
                    placeholder="4-6 dígitos"
                    type="password"
                    maxLength={6}
                    value={regForm.pin}
                    onChange={(e) => setRegForm({ ...regForm, pin: e.target.value.replace(/\D/g, '') })}
                    className="h-11 rounded-lg"
                  />
                  <p className="text-xs text-gray-400">Crea un PIN de 4 a 6 dígitos para acceder a tu cuenta</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Confirmar PIN *</Label>
                  <Input
                    placeholder="Repite tu PIN"
                    type="password"
                    maxLength={6}
                    value={regForm.confirmPin}
                    onChange={(e) => setRegForm({ ...regForm, confirmPin: e.target.value.replace(/\D/g, '') })}
                    className={cn(
                      'h-11 rounded-lg',
                      regForm.confirmPin && regForm.confirmPin !== regForm.pin ? 'border-red-500' : ''
                    )}
                  />
                  {regForm.confirmPin && regForm.confirmPin !== regForm.pin && (
                    <p className="text-xs text-red-500">Los PINs no coinciden</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 2: Service */}
            {regStep === 2 && (
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
                <div className="text-center mb-2">
                  <div className="inline-flex w-14 h-14 rounded-full bg-orange-100 items-center justify-center mb-2">
                    <Briefcase className="text-orange-600" size={28} />
                  </div>
                  <p className="text-sm text-gray-500">Cuéntanos sobre tu servicio</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Categoría de servicio *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(CATEGORIES).map(([key, cat]) => (
                      <Card
                        key={key}
                        className={cn(
                          'cursor-pointer p-3 transition-all text-center border-2',
                          regForm.serviceCategory === key ? 'border-orange-500 bg-orange-50' : 'border-transparent bg-white hover:border-orange-200'
                        )}
                        style={{ gap: 0 }}
                        onClick={() => setRegForm({ ...regForm, serviceCategory: key, vehicleType: '' })}
                      >
                        <span className="text-2xl">{cat.emoji}</span>
                        <p className="text-xs font-medium text-gray-700 mt-1">{cat.label}</p>
                      </Card>
                    ))}
                  </div>
                </div>

                {regForm.serviceCategory && CATEGORY_VEHICLES[regForm.serviceCategory]?.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Tipo de vehículo</Label>
                    <Select
                      value={regForm.vehicleType}
                      onValueChange={(v) => setRegForm({ ...regForm, vehicleType: v })}
                    >
                      <SelectTrigger className="h-11 w-full rounded-lg">
                        <SelectValue placeholder="Selecciona tu vehículo" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_VEHICLES[regForm.serviceCategory].map((vt) => (
                          <SelectItem key={vt} value={vt}>{VEHICLE_TYPES[vt]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Breve descripción</Label>
                  <Textarea
                    placeholder="Describe tu negocio..."
                    value={regForm.bio}
                    onChange={(e) => setRegForm({ ...regForm, bio: e.target.value })}
                    className="rounded-lg resize-none"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Servicios que ofreces</Label>
                  <Input
                    placeholder="Ej: Corte, Barba, Afeitado (separados por coma)"
                    value={regForm.services}
                    onChange={(e) => setRegForm({ ...regForm, services: e.target.value })}
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Rango de precios</Label>
                  <Input
                    placeholder="Ej: 5-15 CUP, Por cotizar"
                    value={regForm.priceRange}
                    onChange={(e) => setRegForm({ ...regForm, priceRange: e.target.value })}
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Horario de trabajo</Label>
                  <Input
                    placeholder="Ej: Lun-Sáb 7am-9pm"
                    value={regForm.schedule}
                    onChange={(e) => setRegForm({ ...regForm, schedule: e.target.value })}
                    className="h-11 rounded-lg"
                  />
                </div>
              </motion.div>
            )}

            {/* Step 3: Personalization */}
            {regStep === 3 && (
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
                <div className="text-center mb-2">
                  <div className="inline-flex w-14 h-14 rounded-full bg-orange-100 items-center justify-center mb-2">
                    <Camera className="text-orange-600" size={28} />
                  </div>
                  <p className="text-sm text-gray-500">Personaliza tu perfil (opcional)</p>
                </div>

                {/* Profile photo */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Foto de perfil</Label>
                  <div className="flex items-center gap-3">
                    {regPhoto ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={regPhoto} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-orange-200" />
                        <button
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                          onClick={() => setRegPhoto(null)}
                        >
                          <X size={12} className="text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="text-gray-400" size={24} />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) setRegPhoto(await fileToBase64(file))
                        }}
                      />
                      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm text-gray-600">
                        <Camera size={16} /> Subir foto
                      </div>
                    </label>
                  </div>
                </div>

                {/* Vehicle photos */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Fotos del vehículo/negocio (máx. 3)</Label>
                  <div className="flex gap-3 flex-wrap">
                    {regCarPhotos.map((photo, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo} alt={`Vehículo ${i + 1}`} className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
                        <button
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                          onClick={() => setRegCarPhotos(regCarPhotos.filter((_, idx) => idx !== i))}
                        >
                          <X size={12} className="text-white" />
                        </button>
                      </div>
                    ))}
                    {regCarPhotos.length < 3 && (
                      <label className="cursor-pointer">
                        <Input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const b64 = await fileToBase64(file)
                              setRegCarPhotos([...regCarPhotos, b64])
                            }
                          }}
                        />
                        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-orange-400 hover:bg-orange-50 transition-colors">
                          <Plus size={20} className="text-gray-400" />
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        {/* Footer buttons */}
        <div className="sticky bottom-0 bg-white border-t p-4">
          <div className="flex gap-3 max-w-md mx-auto">
            {regStep > 1 && (
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={() => setRegStep(regStep - 1)}
              >
                Anterior
              </Button>
            )}
            <Button
              className="flex-1 h-11 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl"
              onClick={handleRegister}
            >
              {regStep === 3 ? '✅ Inscribirme' : 'Siguiente'}
            </Button>
          </div>
        </div>
      </motion.div>
    )
  }

  // ===========================
  // LOGIN VIEW
  // ===========================
  const renderLogin = () => (
    <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={goBack}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-lg font-bold text-gray-900">Iniciar Sesión</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm space-y-6"
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg mb-4">
              <Truck className="text-white" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Bienvenido de vuelta</h2>
            <p className="text-sm text-gray-500 mt-1">Ingresa tu teléfono y PIN para acceder</p>
          </div>

          <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Teléfono</Label>
              <Input
                placeholder="5XXXXXXX"
                type="tel"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                className="h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">PIN</Label>
              <Input
                placeholder="Tu PIN de seguridad"
                type="password"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                className="h-11 rounded-lg"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {loginError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg"
              >
                {loginError}
              </motion.div>
            )}

            <Button
              className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg"
              onClick={handleLogin}
              disabled={!loginPhone || !loginPin}
            >
              Iniciar Sesión
            </Button>
          </div>

          <div className="text-center">
            <button
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
              onClick={() => setView('register')}
            >
              ¿No tienes cuenta? ¡Inscríbete aquí!
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )

  // ===========================
  // MY PANEL VIEW
  // ===========================
  const renderMyPanel = () => {
    if (!currentProvider) {
      setView('login')
      return null
    }

    const providerData = providerDetail || currentProvider
    const cat = CATEGORIES[providerData.serviceCategory]

    return (
      <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setView('welcome')}>
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Mi Panel</h1>
            <p className="text-xs text-gray-500">{providerData.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-red-500 hover:text-red-600 hover:bg-red-50">
            <LogOut size={20} />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4 py-6">
          <div className="max-w-md mx-auto space-y-6">
            {/* Profile card */}
            <Card className="p-4 border-0 shadow-md" style={{ gap: 0 }}>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <ProviderAvatar provider={providerData} size={56} />
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white',
                    providerData.available ? 'bg-green-500' : 'bg-gray-400'
                  )} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-gray-900">{providerData.name}</h2>
                  {providerData.businessName && (
                    <p className="text-sm text-gray-500">{providerData.businessName}</p>
                  )}
                  <Badge
                    className="mt-1 text-xs px-2 py-0 text-white border-0 rounded"
                    style={{ backgroundColor: cat?.color || '#ea580c' }}
                  >
                    {cat?.emoji} {cat?.label}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* BIG LIVE TOGGLE */}
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button
                className={cn(
                  'w-full h-16 text-lg font-bold rounded-2xl shadow-lg transition-all',
                  providerData.available
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-200'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                )}
                onClick={handleToggleLive}
                disabled={togglingLive}
              >
                {togglingLive ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
                ) : providerData.available ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-white mr-2 animate-pulse" />
                    Estoy Live — {providerData.totalJobs} servicios
                  </>
                ) : (
                  <>
                    <Zap size={24} className="mr-2" />
                    Ir Live
                  </>
                )}
              </Button>
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 text-center border-0 shadow-sm bg-white" style={{ gap: 0 }}>
                <Star className="mx-auto text-yellow-500 mb-1" size={20} />
                <p className="text-lg font-bold text-gray-900">{providerData.rating.toFixed(1)}</p>
                <p className="text-[10px] text-gray-500">Calificación</p>
              </Card>
              <Card className="p-3 text-center border-0 shadow-sm bg-white" style={{ gap: 0 }}>
                <Briefcase className="mx-auto text-orange-600 mb-1" size={20} />
                <p className="text-lg font-bold text-gray-900">{providerData.totalJobs}</p>
                <p className="text-[10px] text-gray-500">Servicios</p>
              </Card>
              <Card className="p-3 text-center border-0 shadow-sm bg-white" style={{ gap: 0 }}>
                <div className={cn(
                  'mx-auto w-5 h-5 rounded-full mb-1',
                  providerData.available ? 'bg-green-500' : 'bg-gray-400'
                )} />
                <p className="text-lg font-bold text-gray-900">
                  {providerData.available ? 'Sí' : 'No'}
                </p>
                <p className="text-[10px] text-gray-500">Disponible</p>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Acciones rápidas</h3>

              <Card
                className="cursor-pointer p-4 hover:shadow-md transition-shadow border-0 bg-white shadow-sm"
                style={{ gap: 0 }}
                onClick={() => {
                  if (currentProvider) {
                    setEditForm({
                      name: currentProvider.name,
                      businessName: currentProvider.businessName || '',
                      phone: currentProvider.phone,
                      serviceCategory: currentProvider.serviceCategory,
                      vehicleType: currentProvider.vehicleType,
                      bio: currentProvider.bio || '',
                      services: (() => {
                        try {
                          const parsed = currentProvider.services ? (typeof currentProvider.services === 'string' ? JSON.parse(currentProvider.services) : currentProvider.services) : []
                          return Array.isArray(parsed) ? parsed.join(', ') : ''
                        } catch { return '' }
                      })(),
                      priceRange: currentProvider.priceRange || '',
                      schedule: currentProvider.schedule || '',
                      notes: currentProvider.notes || '',
                    })
                    setEditPin('')
                    setEditPhotos({})
                    setView('editprofile')
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Edit className="text-orange-600" size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">Editar Perfil</p>
                    <p className="text-xs text-gray-500">Actualiza tu información personal</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </div>
              </Card>

              <Card
                className="cursor-pointer p-4 hover:shadow-md transition-shadow border-0 bg-white shadow-sm"
                style={{ gap: 0 }}
                onClick={() => {
                  if (currentProvider) {
                    setEditForm({
                      name: currentProvider.name,
                      businessName: currentProvider.businessName || '',
                      phone: currentProvider.phone,
                      serviceCategory: currentProvider.serviceCategory,
                      vehicleType: currentProvider.vehicleType,
                      bio: currentProvider.bio || '',
                      services: (() => {
                        try {
                          const parsed = currentProvider.services ? (typeof currentProvider.services === 'string' ? JSON.parse(currentProvider.services) : currentProvider.services) : []
                          return Array.isArray(parsed) ? parsed.join(', ') : ''
                        } catch { return '' }
                      })(),
                      priceRange: currentProvider.priceRange || '',
                      schedule: currentProvider.schedule || '',
                      notes: currentProvider.notes || '',
                    })
                    setEditPin('')
                    setEditPhotos({})
                    setView('editprofile')
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Camera className="text-blue-600" size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">Mis Fotos</p>
                    <p className="text-xs text-gray-500">Gestiona tu foto de perfil y fotos del negocio</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </div>
              </Card>

              <Card
                className="cursor-pointer p-4 hover:shadow-md transition-shadow border-0 bg-white shadow-sm"
                style={{ gap: 0 }}
                onClick={() => setView('forums')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <Star className="text-green-600" size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">Comunidad</p>
                    <p className="text-xs text-gray-500">Participa en los foros comunitarios</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </div>
              </Card>
            </div>
          </div>
        </ScrollArea>
      </motion.div>
    )
  }

  // ===========================
  // EDIT PROFILE VIEW
  // ===========================
  const renderEditProfile = () => {
    if (!currentProvider) {
      setView('login')
      return null
    }

    return (
      <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setView('mypanel')}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-lg font-bold text-gray-900">Editar Perfil</h1>
        </div>

        <ScrollArea className="flex-1 px-4 py-6">
          <div className="max-w-md mx-auto space-y-4">
            {/* PIN verification */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <Label className="text-sm font-medium text-yellow-800">Ingresa tu PIN para guardar cambios</Label>
              <Input
                placeholder="Tu PIN de seguridad"
                type="password"
                maxLength={6}
                value={editPin}
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                className="h-11 rounded-lg mt-2"
              />
            </div>

            {/* Fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Nombre completo</Label>
                <Input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-11 rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Nombre del negocio</Label>
                <Input value={editForm.businessName || ''} onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })} className="h-11 rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Teléfono</Label>
                <Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, '') })} className="h-11 rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Categoría de servicio</Label>
                <Select value={editForm.serviceCategory || ''} onValueChange={(v) => setEditForm({ ...editForm, serviceCategory: v })}>
                  <SelectTrigger className="h-11 w-full rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([k, c]) => (
                      <SelectItem key={k} value={k}>{c.emoji} {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Tipo de vehículo</Label>
                <Select value={editForm.vehicleType || ''} onValueChange={(v) => setEditForm({ ...editForm, vehicleType: v })}>
                  <SelectTrigger className="h-11 w-full rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VEHICLE_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Descripción</Label>
                <Textarea value={editForm.bio || ''} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} className="rounded-lg resize-none" rows={3} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Servicios (separados por coma)</Label>
                <Input value={editForm.services || ''} onChange={(e) => setEditForm({ ...editForm, services: e.target.value })} className="h-11 rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Rango de precios</Label>
                <Input value={editForm.priceRange || ''} onChange={(e) => setEditForm({ ...editForm, priceRange: e.target.value })} className="h-11 rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Horario</Label>
                <Input value={editForm.schedule || ''} onChange={(e) => setEditForm({ ...editForm, schedule: e.target.value })} className="h-11 rounded-lg" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Notas adicionales</Label>
                <Textarea value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="rounded-lg resize-none" rows={3} />
              </div>
            </div>

            {/* Photos section */}
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Fotos</h3>

              {/* Profile photo */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-600">Foto de perfil</Label>
                <div className="flex items-center gap-3">
                  {(editPhotos.photo !== undefined ? editPhotos.photo : currentProvider.photo) ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={(editPhotos.photo !== undefined ? editPhotos.photo : currentProvider.photo) || ''} alt="Perfil" className="w-14 h-14 rounded-full object-cover border-2 border-orange-200" />
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                        onClick={() => setEditPhotos({ ...editPhotos, photo: '' })}
                      >
                        <X size={10} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center"><User size={20} className="text-gray-400" /></div>
                  )}
                  <label className="cursor-pointer">
                    <Input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) setEditPhotos({ ...editPhotos, photo: await fileToBase64(file) })
                    }} />
                    <div className="flex items-center gap-1 px-3 py-2 border rounded-lg hover:bg-gray-50 text-xs text-gray-600">
                      <Camera size={14} /> Cambiar
                    </div>
                  </label>
                </div>
              </div>

              {/* Vehicle photos */}
              {[1, 2, 3].map((n) => {
                const key = `carPhoto${n}` as keyof typeof editPhotos
                const current = currentProvider[key] as string | null | undefined
                return (
                  <div key={n} className="space-y-1.5">
                    <Label className="text-sm text-gray-600">Foto {n} del negocio</Label>
                    <div className="flex items-center gap-3">
                      {(editPhotos[key] !== undefined ? editPhotos[key] : current) ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={(editPhotos[key] !== undefined ? editPhotos[key] : current) || ''} alt={`Foto ${n}`} className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                          <button
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                            onClick={() => setEditPhotos({ ...editPhotos, [key]: '' })}
                          >
                            <X size={10} className="text-white" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center"><Camera size={16} className="text-gray-400" /></div>
                      )}
                      <label className="cursor-pointer">
                        <Input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) setEditPhotos({ ...editPhotos, [key]: await fileToBase64(file) })
                        }} />
                        <div className="flex items-center gap-1 px-3 py-2 border rounded-lg hover:bg-gray-50 text-xs text-gray-600">
                          <Camera size={14} /> Subir
                        </div>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </ScrollArea>

        {/* Save button */}
        <div className="sticky bottom-0 bg-white border-t p-4">
          <Button
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl"
            onClick={handleSaveProfile}
            disabled={!editPin}
          >
            <Check size={18} className="mr-2" />
            Guardar Cambios
          </Button>
        </div>
      </motion.div>
    )
  }

  // ===========================
  // FORUMS VIEW
  // ===========================
  const renderForums = () => (
    <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={goBack}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Foros Comunitarios</h1>
          <p className="text-xs text-gray-500">Comparte y conecta con la comunidad</p>
        </div>
      </div>

      <div className="flex-1 p-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-3 w-full" /></Card>
            ))}
          </div>
        ) : forums.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="text-gray-300 mb-3" size={48} />
            <p className="text-gray-500 font-medium">No hay foros disponibles</p>
          </div>
        ) : (
          <div className="space-y-4">
            {forums.map((forum, i) => (
              <motion.div key={forum.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card
                  className="cursor-pointer hover:shadow-md transition-all overflow-hidden border-0 bg-white shadow-sm"
                  style={{ gap: 0 }}
                  onClick={() => goForumDetail(forum.id)}
                >
                  <div className="h-1.5" style={{ backgroundColor: forum.color }} />
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                        style={{ backgroundColor: `${forum.color}15` }}
                      >
                        {forum.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{forum.title}</h3>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{forum.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                            <MessageCircle size={12} className="mr-1" />
                            {forum._count?.posts || forum.postsCount || 0} publicaciones
                          </Badge>
                          {forum.posts && forum.posts.length > 0 && (
                            <span className="text-xs text-gray-400">
                              Último: {timeAgo(forum.posts[0].createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-400 mt-1 shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )

  // ===========================
  // FORUM DETAIL VIEW
  // ===========================
  const renderForumDetail = () => {
    if (loading || !forumDetail) {
      return (
        <div className="p-4">
          <Skeleton className="h-8 w-48 mb-4" />
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 mb-3"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-3 w-full" /></Card>
          ))}
        </div>
      )
    }

    return (
      <motion.div variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={goBack}>
            <ArrowLeft size={20} />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{forumDetail.icon}</span>
              <h1 className="text-lg font-bold text-gray-900 truncate">{forumDetail.title}</h1>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="max-w-md mx-auto">
            <p className="text-sm text-gray-500 mb-4">{forumDetail.description}</p>

            {/* FAB for new post */}
            <div className="fixed bottom-6 right-6 z-20">
              <Button
                className="w-14 h-14 rounded-full bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200"
                size="icon"
                onClick={() => setNewPostOpen(true)}
              >
                <Plus size={24} />
              </Button>
            </div>

            {/* Posts */}
            {(!forumDetail.posts || forumDetail.posts.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageCircle className="text-gray-300 mb-3" size={40} />
                <p className="text-gray-500 font-medium">No hay publicaciones aún</p>
                <p className="text-gray-400 text-sm mt-1">¡Sé el primero en publicar!</p>
              </div>
            ) : (
              <div className="space-y-3 pb-20">
                {forumDetail.posts.map((post, i) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="p-4 border-0 bg-white shadow-sm" style={{ gap: 0 }}>
                      {post.pinned && (
                        <Badge className="mb-2 bg-orange-100 text-orange-700 border-orange-200 text-[10px]">
                          📌 Fijado
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700">
                          {post.authorName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-gray-800">{post.authorName}</span>
                          <span className="text-xs text-gray-400 ml-2">{timeAgo(post.createdAt)}</span>
                        </div>
                      </div>
                      <h3 className="font-semibold text-gray-900 text-sm">{post.title}</h3>
                      <p className="text-sm text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                      <div className="flex items-center gap-1 mt-3">
                        <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
                          <Heart size={14} />
                          {post.likes > 0 && <span>{post.likes}</span>}
                        </button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* New Post Sheet */}
        <Sheet open={newPostOpen} onOpenChange={setNewPostOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
            <SheetHeader className="px-4 pt-2">
              <SheetTitle className="text-lg">Nueva Publicación</SheetTitle>
              <SheetDescription>Comparte con la comunidad</SheetDescription>
            </SheetHeader>
            <div className="px-4 py-3 space-y-3 overflow-y-auto max-h-[60vh]">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Tu nombre *</Label>
                <Input
                  placeholder="Tu nombre"
                  value={newPostAuthor}
                  onChange={(e) => setNewPostAuthor(e.target.value)}
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Teléfono (opcional)</Label>
                <Input
                  placeholder="Tu teléfono"
                  type="tel"
                  value={newPostAuthorPhone}
                  onChange={(e) => setNewPostAuthorPhone(e.target.value.replace(/\D/g, ''))}
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Título *</Label>
                <Input
                  placeholder="Título de tu publicación"
                  value={newPostTitle}
                  onChange={(e) => setNewPostTitle(e.target.value)}
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Contenido *</Label>
                <Textarea
                  placeholder="Escribe tu publicación..."
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  className="rounded-lg resize-none"
                  rows={5}
                />
              </div>
            </div>
            <SheetFooter className="px-4 pb-4">
              <Button
                className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg"
                onClick={handleNewPost}
                disabled={!newPostAuthor.trim() || !newPostTitle.trim() || !newPostContent.trim()}
              >
                <Send size={16} className="mr-2" /> Publicar
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </motion.div>
    )
  }

  // ===========================
  // MAIN RENDER
  // ===========================
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === 'welcome' && <div key="welcome">{renderWelcome()}</div>}
          {view === 'providers' && <div key="providers">{renderProviders()}</div>}
          {view === 'profile' && <div key="profile">{renderProfile()}</div>}
          {view === 'register' && <div key="register">{renderRegister()}</div>}
          {view === 'login' && <div key="login">{renderLogin()}</div>}
          {view === 'mypanel' && <div key="mypanel">{renderMyPanel()}</div>}
          {view === 'editprofile' && <div key="editprofile">{renderEditProfile()}</div>}
          {view === 'forums' && <div key="forums">{renderForums()}</div>}
          {view === 'forumDetail' && <div key="forumDetail">{renderForumDetail()}</div>}
        </AnimatePresence>
      </main>

      {/* ===========================
          CHAT SHEET
          =========================== */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-md">
          <SheetHeader className="px-4 pt-4 pb-0 border-b flex flex-row items-center gap-3">
            <div className="flex-1 flex items-center gap-3">
              {chatTarget && <ProviderAvatar provider={chatTarget} size={36} />}
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-sm truncate">
                  {chatTarget?.name}
                </SheetTitle>
                <SheetDescription className="text-xs truncate">
                  {chatTarget?.businessName || CATEGORIES[chatTarget?.serviceCategory || 'pasaje']?.label}
                </SheetDescription>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs" asChild>
                <a href={`tel:${chatTarget ? formatPhone(chatTarget.phone) : ''}`}>
                  <Phone size={14} />
                </a>
              </Button>
            </div>
          </SheetHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                <MessageCircle size={32} className="mb-2" />
                <p className="text-sm">Inicia una conversación</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMine = msg.senderType === 'client'
              return (
                <div key={msg.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[80%] px-3 py-2 rounded-2xl text-sm',
                    isMine
                      ? 'bg-orange-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  )}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p className={cn('text-[10px] mt-1', isMine ? 'text-orange-200' : 'text-gray-400')}>
                      {timeAgo(msg.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-3 flex gap-2">
            <Input
              placeholder="Escribe un mensaje..."
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1 h-10 rounded-lg"
            />
            <Button
              size="icon"
              className="h-10 w-10 bg-orange-600 hover:bg-orange-700 text-white rounded-lg"
              onClick={handleSendMessage}
              disabled={!chatMessage.trim()}
            >
              <Send size={16} />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ===========================
          REVIEW SHEET
          =========================== */}
      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="px-4 pt-2">
            <SheetTitle className="text-lg">Dejar Reseña</SheetTitle>
            <SheetDescription>
              {providerDetail?.name} — {providerDetail?.businessName}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 py-4 space-y-4">
            {/* Star rating */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Tu calificación</Label>
              <StarRating rating={reviewRating} onRate={setReviewRating} size={32} />
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Comentario (opcional)</Label>
              <Textarea
                placeholder="Cuéntanos tu experiencia..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="rounded-lg resize-none"
                rows={3}
              />
            </div>

            {/* Trust badges */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Sellos de confianza</Label>
              <div className="grid grid-cols-2 gap-2">
                {TRUST_BADGES.map((badge) => (
                  <label
                    key={badge.key}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors',
                      reviewBadges[badge.key as keyof typeof reviewBadges]
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-gray-200 hover:border-orange-200'
                    )}
                  >
                    <Checkbox
                      checked={reviewBadges[badge.key as keyof typeof reviewBadges]}
                      onCheckedChange={(checked) =>
                        setReviewBadges({ ...reviewBadges, [badge.key]: !!checked })
                      }
                    />
                    <span className="text-sm">
                      {badge.icon} {badge.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter className="px-4 pb-4">
            <Button
              className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg"
              onClick={handleSubmitReview}
              disabled={reviewRating === 0}
            >
              <Star size={16} className="mr-2" />
              Enviar Reseña
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
