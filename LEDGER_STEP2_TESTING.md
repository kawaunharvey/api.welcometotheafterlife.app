# Ledger API Testing Guide

## Step 2 Completed: Core Ledger CRUD

### What Was Implemented

1. **Prisma Schema**: Added 5 new models and 4 enums to support Ledger domain
2. **LedgerModule**: Core module with controller and service
3. **Authentication Integration**: All endpoints use `@CurrentUser()` decorator
4. **Permission System**: `verifyAccess()` method enforces role-based access
5. **Status Updates**: Automatically created for ledger creation

### Files Created/Modified

**Schema:**
- [schema.prisma](schema.prisma) - Added Ledger domain models (lines 896-1055)

**Module Files:**
- [src/modules/ledger/ledger.module.ts](src/modules/ledger/ledger.module.ts)
- [src/modules/ledger/ledger.controller.ts](src/modules/ledger/ledger.controller.ts)
- [src/modules/ledger/ledger.service.ts](src/modules/ledger/ledger.service.ts)

**DTOs:**
- [src/modules/ledger/dto/create-ledger.dto.ts](src/modules/ledger/dto/create-ledger.dto.ts)
- [src/modules/ledger/dto/update-ledger.dto.ts](src/modules/ledger/dto/update-ledger.dto.ts)
- [src/modules/ledger/dto/ledger-response.dto.ts](src/modules/ledger/dto/ledger-response.dto.ts)

**Integration:**
- [src/app.module.ts](src/app.module.ts) - Added LedgerModule import

---

## Testing the API

All endpoints require authentication. Include a valid JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### 1. Create a Ledger

```bash
POST /ledgers
Content-Type: application/json

{
  "title": "Memorial Service Planning",
  "description": "Coordinate memorial service details",
  "linkedEntityType": "memorial",
  "linkedEntityId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "id": "676...",
  "ownerUserId": "675...",
  "title": "Memorial Service Planning",
  "description": "Coordinate memorial service details",
  "linkedEntityType": "memorial",
  "linkedEntityId": "507f1f77bcf86cd799439011",
  "createdAt": "2025-12-19T...",
  "updatedAt": "2025-12-19T..."
}
```

### 2. Get All Ledgers (User's Ledgers)

```bash
GET /ledgers
```

**Response:**
```json
[
  {
    "id": "676...",
    "ownerUserId": "675...",
    "title": "Memorial Service Planning",
    "description": "Coordinate memorial service details",
    "createdAt": "2025-12-19T...",
    "updatedAt": "2025-12-19T...",
    "_count": {
      "actions": 0,
      "collaborators": 0
    }
  }
]
```

### 3. Get Single Ledger (Basic)

```bash
GET /ledgers/:id
```

**Response:**
```json
{
  "id": "676...",
  "ownerUserId": "675...",
  "title": "Memorial Service Planning",
  "description": "Coordinate memorial service details",
  "linkedEntityType": "memorial",
  "linkedEntityId": "507f1f77bcf86cd799439011",
  "createdAt": "2025-12-19T...",
  "updatedAt": "2025-12-19T..."
}
```

### 4. Get Single Ledger (With Nested Data)

```bash
GET /ledgers/:id?include=all
```

**Response:**
```json
{
  "id": "676...",
  "ownerUserId": "675...",
  "title": "Memorial Service Planning",
  "description": "Coordinate memorial service details",
  "linkedEntityType": "memorial",
  "linkedEntityId": "507f1f77bcf86cd799439011",
  "createdAt": "2025-12-19T...",
  "updatedAt": "2025-12-19T...",
  "actions": [],
  "collaborators": [],
  "statusUpdates": [
    {
      "id": "676...",
      "ledgerId": "676...",
      "actionId": null,
      "type": "LEDGER_CREATED",
      "actorUserId": "675...",
      "actorEmail": "user@example.com",
      "message": "Ledger \"Memorial Service Planning\" created",
      "metadata": null,
      "createdAt": "2025-12-19T..."
    }
  ]
}
```

### 5. Update Ledger (Owner Only)

```bash
PATCH /ledgers/:id
Content-Type: application/json

{
  "title": "Updated Memorial Service Planning",
  "description": "Updated description"
}
```

### 6. Get User's Role for a Ledger

```bash
GET /ledgers/:id/role
```

**Response:**
```json
{
  "role": "OWNER"
}
```

### 7. Delete Ledger (Owner Only)

```bash
DELETE /ledgers/:id
```

**Response:**
```json
{
  "deleted": true
}
```

---

## Permission System

The service enforces role-based access control:

- **OWNER**: Full control (update, delete, manage collaborators)
- **EDITOR**: Can create/update actions and attachments
- **VIEWER**: Read-only access

The `verifyAccess()` method automatically:
- Checks if user is owner (grants all permissions)
- Checks if user is a collaborator with sufficient role
- Throws `NotFoundException` if ledger doesn't exist
- Throws `ForbiddenException` if user lacks permission

---

## Next Steps

Step 3 will implement:
- Actions with status management
- Action creation and update endpoints
- Status change tracking with automatic status updates
