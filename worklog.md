# Chambita — Client Flow Implementation Worklog

## Date: 2025-01-XX

## Summary
Implemented the complete client flow for the Chambita mobile services platform. Previously, clients were anonymous "guests" with no registration/login system. Now clients can register, login, manage their profile, and have their identity persisted across sessions.

---

## Files Created

### 1. `/home/z/my-project/src/app/api/clients/register/route.ts`
- **POST** endpoint for client registration
- Accepts `{ name, phone, photo? }`
- If phone already exists, returns existing client (auto-login behavior)
- Returns `{ success: true, client, alreadyExists? }`

### 2. `/home/z/my-project/src/app/api/clients/login/route.ts`
- **POST** endpoint for client login (phone-only, no PIN)
- Accepts `{ phone }`
- Returns client data or 404 error
- Uses same coding patterns as existing provider API routes

### 3. `/home/z/my-project/src/app/api/clients/[id]/route.ts`
- **GET**: Fetch client by ID
- **PUT**: Update client profile (name, phone, photo, bio, lat, lng)
- Follows existing Next.js dynamic route pattern with `params: Promise<{ id: string }>`

---

## Files Modified

### 4. `/home/z/my-project/src/app/page.tsx` (Major modifications)

#### a) New ViewType values
- Added `'clientLogin' | 'clientRegister' | 'clientPanel'` to the ViewType union

#### b) Client state variables
- `currentClient`: `{ id, name, phone, photo } | null` — tracks logged-in client
- `clientLoginPhone`, `clientLoginError`: client login form state
- `clientRegisterForm`, `clientRegisterPhoto`, `clientRegistering`: client registration form state
- `shareTargetProviderId`: tracks which provider a location share is for

#### c) Client session persistence
- On startup, loads client session from `localStorage('chambita_client')`
- Saves client data on login/register
- Clears on logout

#### d) Welcome view changes
- Added "Soy Cliente" button (blue) BEFORE "Soy Proveedor" button (orange)
- Both buttons are side-by-side in a flex row
- If client is already logged in, "Soy Cliente" goes directly to map

#### e) New views implemented
- **renderClientLogin**: Phone-only login (no PIN needed). Blue-themed. If phone not found, offers registration link.
- **renderClientRegister**: Name + Phone + optional photo upload. Single-step form. Auto-login on success.
- **renderClientPanel**: Shows client avatar, name, phone. Quick actions (Map, Community). Shared locations history. Logout button.

#### f) Handler functions added
- `handleClientLogin`: Phone-only login via `/api/clients/login`
- `handleClientRegister`: Registration via `/api/clients/register` (auto-login on success)
- `handleClientLogout`: Clears client session and returns to welcome

#### g) Updated existing handlers
- `handleLogout`: Now also clears `chambita_client` from localStorage and resets `currentClient`
- `goBack`: Added routing for `clientLogin → welcome`, `clientRegister → clientLogin`, `clientPanel → welcome`
- `openChat`: Passes `currentClient?.id` instead of hardcoded `'guest'` to `fetchMessages`
- `fetchMessages`: Updated to accept optional `clientId` parameter, uses `currentClient?.id || 'guest'`
- `handleSendMessage`: Uses `currentClient?.id || 'guest'` for senderId
- `openShareLocation`: New function that pre-fills name/photo from client session

#### h) Map view updates
- `onShareLocation` now calls `openShareLocation(providerId)` which pre-fills client data
- Added "Mi Perfil" button for logged-in clients (blue-themed, next to "Mi Panel" for providers)
- "Inscríbete" button only shows when neither provider nor client is logged in

#### i) FloatingLogo fix
- Changed from `rounded-xl` + `bg-white` + `border: '2px solid #f3f4f6'` to `rounded-lg` + `style={{ backgroundColor: 'white' }}`
- Removed visible white ring/border

---

## Technical Decisions

1. **Phone-only auth for clients**: Unlike providers who need phone+PIN, clients use phone-only for simplicity. This matches the requirement and reduces friction.

2. **Auto-login on duplicate registration**: If a phone number is already registered, the register endpoint returns the existing client. The UI handles this gracefully with appropriate toast messages.

3. **Separate localStorage keys**: Uses `chambita_client` for client session, keeping it separate from `chambita_session` (provider session). This allows both sessions to coexist.

4. **Client identity in messages**: When a client is logged in, their actual ID is used for message sending instead of 'guest'. This enables proper conversation tracking.

5. **Pre-filled share location**: When a logged-in client shares their location, their name and photo are automatically pre-filled in the share location sheet.

---

## Testing Notes
- Dev server compiles and serves the page without errors
- All existing views (welcome, providers, profile, map, forums, etc.) remain functional
- New client views follow the same UI patterns and styling conventions as existing views
- Pre-existing lint warnings (static-components, set-state-in-effect) are unchanged
