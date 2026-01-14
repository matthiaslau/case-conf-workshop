# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development (starts Docker DB + Next.js dev server)
npm run dev

# Database commands
npm run db:start      # Start PostgreSQL container
npm run db:stop       # Stop PostgreSQL container
npm run db:migrate    # Run Prisma migrations
npm run db:seed       # Seed test data
npm run db:reset      # Reset database (drop and recreate)

# Other
npm run build         # Production build
npm run lint          # ESLint
npx prisma generate   # Regenerate Prisma client after schema changes
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, Chakra UI 3, TanStack Query
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL 18 via Docker, Prisma 7 ORM with `@prisma/adapter-pg`
- **Auth**: JWT tokens (localStorage), bcrypt password hashing

### Route Groups
- `app/(auth)/` - Public pages (login, signup) with minimal layout
- `app/(dashboard)/` - Protected pages (contacts, admin, settings) with sidebar/navbar
- `app/api/v1/` - REST API endpoints

### Key Patterns

**API Route Authentication** (`lib/api-utils.ts`):
```typescript
// Use requireAuth() or requireSuperuser() at start of route handlers
const result = await requireAuth(request);
if ("error" in result) return result.error;
// result.user is now available
```

**Database Access** (`lib/db.ts`):
- Import `prisma` from `@/lib/db` - it's a singleton with connection pooling
- Uses Prisma 7 with pg driver adapter (not traditional Prisma engine)

**Frontend API Calls** (`lib/client/api.ts`):
- `AuthApi`, `UsersApi`, `ContactsApi` - typed API client functions
- Token automatically attached via `getAuthHeaders()`

**Auth Hook** (`lib/client/useAuth.ts`):
- `useAuth()` provides `user`, `loginMutation`, `signUpMutation`, `logout`
- Queries `currentUser` key for user state

### Data Model
- **User**: email, hashedPassword, fullName, isActive, isSuperuser
- **Contact**: organisation, description, ownerId (belongs to User)
- Superusers see all contacts; regular users see only their own

### Test Accounts (after seeding)
- Admin: `dev@example.com` / `DevPassword`
- Users: `alice@example.com` / `AlicePassword123`, `bob@example.com` / `BobPassword123`
