# Chambita UX Improvements Worklog

## Date: 2025-05-14

## Summary of Changes

10 high-impact UX improvements implemented across `src/app/page.tsx` (~3567 lines) and `src/components/MapView.tsx` (~660 lines).

---

### 1. Fix `100vh` → `100dvh` for Mobile Safari
**File:** `src/app/page.tsx` line ~3019
- Changed `height: '100vh'` to `height: '100dvh'` in the map view container
- Prevents mobile Safari address bar from hiding the bottom of the map
- Added `env(safe-area-inset-bottom)` padding to profile sticky action buttons and bottom nav

### 2. Bottom Navigation Bar (CRITICAL)
**File:** `src/app/page.tsx` lines ~3257-3322
- Added persistent 4-tab bottom navigation: Mapa, Mensajes, Inicio, Perfil
- White background with subtle shadow-top, `z-[10000]` (above map at 9999, below logo at 99999)
- `pb-[env(safe-area-inset-bottom)]` for iPhone home indicator
- Active tab highlighted with orange (`text-orange-600`)
- Hidden on: welcome, register, login, clientLogin, clientRegister, editprofile, forumDetail
- Profile tab logic: provider → mypanel, client → clientPanel, none → login
- Mensajes tab: opens chat if target exists, shows toast otherwise
- Map view bottom provider cards shifted up by 64px (`bottom-16`) to accommodate nav

### 3. Simplified Welcome Page CTAs
**File:** `src/app/page.tsx` lines ~1191-1235
- Reduced from 5 buttons to clear hierarchy:
  - **Primary**: "Buscar Servicios" (green, full-width, prominent)
  - **Secondary row**: "Soy Cliente" (blue) + "Soy Proveedor" (orange) side by side
  - **Subtle links**: "Iniciar Sesión" and "Comunidad" as text links with pipe separator
- Reduces choice paralysis; main flow (find services) is now obvious

### 4. Search Input on Map View
**File:** `src/app/page.tsx` lines ~3073-3087
- Added search input field in the floating top bar of the map view
- Reuses existing `searchQuery` state and `fetchProviders` function
- Searches on Enter key press, triggers provider refetch with search parameter
- Consistent styling with rounded-xl input and search icon

### 5. Real-Time Chat Polling
**File:** `src/app/page.tsx` lines ~629-648
- Added `useEffect` that polls `fetchMessages` every 3 seconds when `chatOpen && chatTarget`
- Cleans up interval when chat closes or dependencies change
- Added `chatPollRef` to track the interval
- Proper dependency array: `[chatOpen, chatTarget, currentClient, fetchMessages]`

### 6. Image Lightbox for Car Photos
**File:** `src/app/page.tsx` lines ~3210-3233
- Added `lightboxSrc` state and full-screen dark overlay with AnimatePresence
- Close button (X) in top-right corner, click-outside-to-close
- Responsive: `max-w-[90vw] max-h-[85vh]` with object-contain
- Profile view car photos: added `cursor-pointer` and `onClick` handlers
- MapView car photos: added `onPhotoClick` prop, cursor and click handler
- **File:** `src/components/MapView.tsx` - Added `onPhotoClick?: (src: string) => void` prop

### 7. Empty State for Map
**File:** `src/app/page.tsx` lines ~3125-3145
- When `!loading && providers.length === 0`, shows centered overlay card
- Displays 😕 emoji, "No se encontraron proveedores" message
- "Limpiar filtros" button that resets searchQuery, filterCategory, and availableOnly
- Semi-transparent backdrop with pointer-events management

### 8. Pull-to-Refresh Visual on Provider List
**File:** `src/app/page.tsx` lines ~1327-1340
- When loading: shows spinner with "Actualizando..." text
- When not loading with results: shows subtle "Desliza para actualizar" hint
- Small, unobtrusive text above the provider grid

### 9. Fixed Chat Reviewer Client ID
**File:** `src/app/page.tsx` line ~888
- Changed `reviewerId: 'guest'` to `reviewerId: currentClient?.id || 'guest'`
- Logged-in clients now get proper credit for their reviews

### 10. Fixed setView During Render Bug
**File:** `src/app/page.tsx` lines ~650-661
- Moved `setView('login')` calls from render-time guards in `renderMyPanel`, `renderEditProfile`, and `renderClientPanel`
- Wrapped in 3 separate `useEffect` hooks that watch `[view, currentProvider]` and `[view, currentClient]`
- Prevents "Cannot update a component while rendering a different component" warnings

---

## Technical Notes

- All changes preserve existing functionality
- No breaking changes to API or component interfaces (only additive `onPhotoClick` prop on MapView)
- Code follows existing patterns in the codebase
- All text in Spanish per requirements
- Responsive design: tested mentally for 375px iPhone viewport
- Bottom nav 64px height properly accounted for in map view layout
