# Worklog — Flota de Autos Redesign

## Date: $(date)

## Summary
Complete redesign of "Chambita" (3,567-line monolith) into simplified "Flota de Autos" fleet/driver tracking app.

## Files Modified

### 1. `src/app/page.tsx` — COMPLETE REWRITE (~580 lines)
- Replaced monolithic 3,567-line file with clean ~580-line simplified version
- Views: `home` | `driver-register` | `driver-login` | `driver-panel` | `driver-edit` | `doctor` | `cliente`
- **Home**: Full-screen Leaflet map with floating "Flota de Autos" header + 3 action buttons (Conductor, Doctor, Cliente)
- **Conductor flow**: Register → Login → Dashboard with profile, photos, live toggle, edit
- **Doctor/Cliente**: Placeholder views with "Próximamente" message
- Single brand color `#2563eb` (blue) throughout
- Photo compression: MAX_SIZE=800, QUALITY=0.85
- Real-time GPS with watchPosition + auto-update when live
- Auto-refresh providers every 8 seconds
- Provider profile overlay with name, phone, car photos, call button
- Session stored in `flota_session` localStorage key

### 2. `src/components/MapView.tsx` — SIMPLIFIED (~200 lines)
- Removed: categories, vehicle types, shared locations, client markers, filter props
- Simplified props: `providers`, `userLat`, `userLng`, `onProviderClick`, `onPhotoClick`
- Single blue water-drop marker style for all drivers
- First photo shown as marker icon
- Green pulsing dot for available drivers
- Center: [23.5, -80.5], zoom 5 (Florida + Caribbean)

### 3. `src/app/layout.tsx` — UPDATED
- Title: "Flota de Autos — Flota de autos en tiempo real"
- Description, keywords, OG tags all updated for Flota de Autos
- Icons changed to `/logo.svg`
- Kept: Geist fonts, Toaster, lang="es"

### 4. `src/app/admin/page.tsx` — SIMPLIFIED (~440 lines)
- Renamed "Chambita" → "Flota de Autos" throughout
- Removed: CATEGORIES, VEHICLE_TYPES constants
- Replaced: category/vehicle type selects with carBrand/carModel text inputs
- Added car photo thumbnails in provider list
- Added lightbox for photo viewing
- Kept: search, create, edit, delete, reset PIN, toggle active/available/suspended

### 5. `prisma/schema.prisma` — SIMPLIFIED
- **Removed** models: Client, Forum, ForumPost, Message, Trip, Review, SharedLocation
- **Added** fields to Provider: `carBrand String?`, `carModel String?`
- Removed: serviceCategory default, vehicleType field, route fields, ForumPost relation
- Changed datasource provider to `sqlite` (matching actual DATABASE_URL)
- Clean indexes: phone, active, available

### 6. API Routes Updated
- `src/app/api/providers/route.ts` — Simplified: removed category filter, added carBrand/carModel
- `src/app/api/providers/[id]/route.ts` — Updated allowed fields, removed routes
- `src/app/api/providers/nearby/route.ts` — Removed category filter
- `src/app/api/providers/login/route.ts` — Kept as-is
- `src/app/api/providers/[id]/toggle-live/route.ts` — Kept as-is
- `src/app/api/admin/providers/route.ts` — Updated fields, removed category
- `src/app/api/admin/providers/[id]/route.ts` — Updated allowed fields
- `src/app/api/admin/providers/[id]/reset-pin/route.ts` — Kept as-is
- `src/app/api/admin/login/route.ts` — Kept as-is

### 7. Deleted Files/Directories
- `src/app/api/forums/` (entire directory)
- `src/app/api/messages/` (entire directory)
- `src/app/api/reviews/` (entire directory)
- `src/app/api/shared-locations/` (entire directory)
- `src/app/api/clients/` (entire directory)
- `src/app/api/providers/seed-drivers/` (file)
- `src/app/api/providers/set-photo/` (file)
- `src/app/api/route.ts` (file)

## Pre-existing Lint Issues (not from this change)
- `src/components/ui/carousel.tsx` — set-state-in-effect
- `src/hooks/use-mobile.ts` — set-state-in-effect
