# School Management Backend API

Express.js + Prisma + MySQL backend API, migrated from Laravel `school-system-be`.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js 4.x
- **ORM**: Prisma 5.x
- **Database**: MySQL
- **Auth**: JWT (jsonwebtoken)
- **Validation**: express-validator

## Project Structure

```
school-be/
├── src/
│   ├── config/          # Prisma client & CORS config
│   │   ├── prisma.js
│   │   └── cors.js
│   ├── controllers/     # Thin request handlers
│   ├── services/        # Business logic
│   ├── middleware/       # Auth, error handler, validator
│   ├── routes/          # Express router definitions
│   └── helpers/         # Pagination & response helpers
├── prisma/
│   └── schema.prisma    # MySQL schema
├── app.js               # Express app setup
├── bin/www              # HTTP server entry
└── .env
```

## Getting Started

### 1. Clone & Install

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Key settings in `.env`:
```env
DATABASE_URL="mysql://admin:password@127.0.0.1:3306/school_management"
JWT_SECRET=your_super_secret_jwt_key
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 3. Generate Prisma Client

```bash
npx prisma generate
```

### 4. Create Database Tables

```bash
npx prisma db push
```

### 5. Run Development Server

```bash
npm run dev
```

## CORS Configuration

CORS is configured via the `CORS_ORIGINS` env variable:

| Value | Behavior |
|-------|----------|
| `*` | Allow all origins |
| `http://localhost:3000,http://localhost:5173` | Allow specific origins (comma-separated) |

## API Endpoints

All endpoints are prefixed with `/api`.

### Auth (Public)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/user/login` | Login (alias) |
| `POST` | `/api/auth/forgot-password` | Request password reset token |
| `POST` | `/api/auth/reset-password` | Reset password with token |
| `GET`  | `/api/health` | Health check |
| `GET`  | `/api/app-config/public/:id` | Get public app config |

### Auth (Protected — requires `Authorization: Bearer <token>`)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/logout` | Logout |
| `GET`  | `/api/auth/me` | Get current user |
| `PUT`  | `/api/auth/change-password` | Change password |

### Users
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/user` | List users (paginated) |
| `GET`  | `/api/user/all` | All users (no pagination) |
| `POST` | `/api/user` | Create user |
| `GET`  | `/api/user/:id` | Get user by ID |
| `PUT`  | `/api/user/:id` | Update user |
| `DELETE` | `/api/user/:id` | Delete user |
| `PUT`  | `/api/user/active-status/:id` | Toggle active status |
| `PUT`  | `/api/user/fcm-token/:id` | Update FCM token |

### Roles
`GET/POST /api/roles`, `GET/PUT/DELETE /api/roles/:id`, `GET /api/roles/all`

### Menus
`GET/POST /api/menu`, `GET/PUT/DELETE /api/menu/:id`, `GET /api/menu/all`, `GET /api/menu/tree`

### Menu-Role
`GET /api/menu-role?roleId=`, `GET /api/menu-role/trx`, `POST /api/menu-role/bulk`

### Master Data (Institution, Position, Department, Person, Level)
All support: `GET /`, `GET /all`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`

## Pagination Query Params

| Param | Default | Description |
|-------|---------|-------------|
| `pageNumber` | 1 | Page number |
| `pageSize` | 10 | Items per page |
| `q` | - | Search keyword |
| `sortBy` | varies | Field to sort |
| `sortType` | `asc` | `asc` or `desc` |

## Response Format

```json
// Success
{ "success": true, "message": "...", "data": { ... } }

// Paginated
{ "success": true, "data": { "items": [], "total": 0, "pageNumber": 1, "pageSize": 10, "totalPages": 0 } }

// Validation Error
{ "success": false, "message": "Validasi gagal", "errors": [{ "field": "username", "message": "..." }] }

// Error
{ "success": false, "message": "..." }
```
