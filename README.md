# Afterlife Service

> Production-ready NestJS + Prisma + MongoDB API for the Welcome to the Afterlife memorial management platform.

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]() [![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)]() [![License](https://img.shields.io/badge/license-MIT-green.svg)]()

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Features](#features)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Environment Setup](#environment-setup)
- [Milestone Summaries](#milestone-summaries)
- [Development Guide](#development-guide)
- [Security](#security)
- [Deployment](#deployment)

## 🏛️ Overview

The Afterlife Service is a comprehensive memorial management platform providing:

- **Memorial Management**: Create, manage, and share digital memorials
- **Social Features**: Follow memorials, interactive feeds, and engagement
- **Content System**: Canvas-style tributes with rich media layers
- **Fundraising**: Donation processing with Stripe integration
- **Verification**: Identity verification with DMF (Death Master File) integration
- **Upload Management**: Direct-to-cloud file uploads with Content Service integration

**Tech Stack:**
- **Backend**: NestJS 11, TypeScript (strict mode)
- **Database**: MongoDB with Prisma ORM
- **Authentication**: JWT with Passport.js
- **Payment Processing**: Stripe (via Billing Service)
- **File Storage**: Google Cloud Storage (via Content Service)
- **Documentation**: Swagger/OpenAPI

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MongoDB instance or MongoDB Atlas
- Environment variables configured (see [Environment Setup](#environment-setup))

### Installation & Development

```bash
# Clone and install dependencies
git clone <repository-url>
cd app-service-afterlife
npm install

# Generate Prisma client
npm run prisma:generate

# Start development server
npm run start:dev

# Open API documentation
open http://localhost:3000/docs
```

### Production Build

```bash
# Build for production
npm run build

# Run production server
npm run start:prod
```

## ✨ Features

### Core Memorial Management
- **Create/Update Memorials**: Rich metadata, location data, visibility controls
- **Search & Discovery**: Full-text search, tag filtering, location-based queries
- **Archive Management**: Soft deletion with recovery options
- **Ownership Controls**: Memorial owner permissions and access management

### Social & Engagement
- **Follow System**: Follow/unfollow memorials with idempotent operations
- **Interactive Feeds**: Auto-generated feeds for followed content
- **Tribute Posts**: Canvas-style posts with multimedia layers
- **Comments & Likes**: Full interaction system with engagement metrics
- **Audit Logging**: Complete activity tracking for compliance

### Fundraising & Donations
- **Fundraising Programs**: One program per memorial with goal tracking
- **Dual Payment Flows**:
  - Web: Hosted checkout URLs
  - Mobile: Payment Intents for React Native
- **Beneficiary Onboarding**: Stripe Connect integration for payouts
- **Webhook Reconciliation**: Real-time payment status updates
- **Payout Management**: Automated payout processing with status tracking

### File Upload System
- **Upload Sessions**: Pre-signed URLs for direct client-to-cloud uploads
- **Batch Operations**: Support for multiple file uploads (max 50 files)
- **Content Policies**: Automatic policy selection based on file type and visibility
- **Asset Management**: Integration with Content Service for metadata tracking

### Verification System
- **Identity Verification**: SSN-based identity checks
- **DMF Integration**: Death Master File validation via Compliancely
- **Document Upload**: Death certificate processing with OCR
- **Manual Review Workflow**: Admin review and approval system
- **Sensitive Data Handling**: AES-256-GCM encryption with automatic cleanup

## 📚 API Documentation

### Authentication
All protected endpoints require a Bearer token:

```bash
# Get authentication token (implement your login flow)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Use in API calls
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/endpoint
```

### Key Endpoints

#### Users
```bash
# Get current user profile
GET /users/me
# Get current user statistics
GET /users/me/stats
# Update current user profile
PATCH /users/me
# Get user's posts (paginated)
GET /users/me/posts?page=1&limit=10
# Get user's memorials (paginated)
GET /users/me/memorials?page=1&limit=10
```

#### Memorials
```bash
# Create memorial
POST /memorials
# Get memorial
GET /memorials/:id
# Search memorials
GET /memorials?query=john&tags=father&tags=teacher
# Update memorial (owner only)
PATCH /memorials/:id
# Archive memorial (owner only)
DELETE /memorials/:id
```

#### Tributes & Posts
```bash
# Create tribute post
POST /posts
# Get post
GET /posts/:id
# List posts by memorial
GET /posts?memorialId=:id
# Update post (author only)
PATCH /posts/:id
```

#### Interactions
```bash
# Toggle like
POST /likes
# Get like status
GET /likes/:postId
# Create comment
POST /comments
# List comments
GET /comments/:postId
```

#### Fundraising
```bash
# Create fundraising program
POST /fundraising/programs
# Get program by memorial
GET /fundraising/programs/:memorialId
# Create donation checkout (web)
POST /fundraising/programs/:memorialId/checkout
# Create payment intent (mobile)
POST /fundraising/programs/:memorialId/payment-intent
# Start beneficiary onboarding
POST /fundraising/programs/:memorialId/beneficiary/start-onboarding
# Request payout
POST /fundraising/programs/:memorialId/payouts
```

#### File Uploads
```bash
# Bootstrap upload sessions (supports shouldFlip parameter for front-facing camera correction)
POST /uploads/bootstrap
# Complete upload sessions
POST /uploads/complete
# Get asset variants (original, thumbnails, etc.)
GET /uploads/assets/:assetId/variants
# Memorial-specific uploads
POST /memorials/:id/upload/images/session
POST /memorials/:id/upload/documents/session
```

**Image Processing Features:**
- **shouldFlip**: Add `shouldFlip: true` to upload session to flip images from front-facing cameras
- **Variants**: Access original files and processed thumbnails via the variants endpoint
- **Format Support**: JPEG, PNG, WEBP, GIF image processing with automatic thumbnail generation

**Upload Examples:**

```bash
# Bootstrap upload session with image flipping for front-facing camera
curl -X POST http://localhost:3000/uploads/bootstrap \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "name": "profile-photo.jpg",
        "type": "image/jpeg",
        "size": 2048000
      }
    ],
    "shouldFlip": true
  }'

# Complete upload session
curl -X POST http://localhost:3000/uploads/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-uuid-here",
    "files": [
      {
        "name": "profile-photo.jpg",
        "etag": "etag-from-upload"
      }
    ]
  }'

# Get asset variants (original, thumbnails, etc.)
curl -X GET http://localhost:3000/uploads/assets/{assetId}/variants \
  -H "Authorization: Bearer $TOKEN"

# Response includes original and processed variants
{
  "variants": [
    {
      "id": "variant-id",
      "assetId": "asset-id",
      "type": "original",
      "url": "https://cdn.example.com/original.jpg",
      "readUrl": "https://cdn.example.com/original.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 2048000,
      "metadata": {...}
    },
    {
      "id": "variant-id-2",
      "assetId": "asset-id",
      "type": "thumbnail",
      "url": "https://cdn.example.com/thumb.jpg",
      "readUrl": "https://cdn.example.com/thumb.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 15000,
      "metadata": {...}
    }
  ]
}
```

#### Verification
```bash
# Create verification case
POST /verification/cases
# Run DMF check
POST /verification/cases/:id/provider-checks/dmf
# Submit manual review
POST /verification/cases/:id/manual-reviews
# Get public verification status
GET /memorials/:id/verification-summary
```

### Complete API Documentation
Visit [http://localhost:3000/docs](http://localhost:3000/docs) for interactive Swagger documentation.

## 🏗️ Architecture

### Project Structure

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root module
├── prisma/
│   ├── prisma.service.ts           # Database service with lifecycle hooks
│   └── prisma.module.ts            # Prisma module exports
├── config/
│   └── configuration.module.ts     # Environment configuration
├── common/
│   ├── filters/                    # Global exception filters
│   ├── http-client/               # External service clients
│   ├── utils/                     # Shared utilities
│   └── cache/                     # Caching services
├── modules/
│   ├── auth/                      # JWT authentication & guards
│   ├── memorials/                 # Memorial management
│   ├── posts/                     # Tribute posts with canvas layers
│   ├── interactions/              # Likes, comments, engagement
│   ├── follows/                   # Memorial following system
│   ├── feeds/                     # Activity feeds
│   ├── fundraising/              # Donations & fundraising
│   ├── uploads/                  # File upload management
│   ├── verification/             # Identity & document verification
│   ├── users/                    # User management
│   └── audit/                    # Activity audit logging
├── health/
│   └── health.controller.ts       # Health & readiness checks
└── test/                          # E2E test suite
```

### Data Models

#### Core Models
- **Memorial**: Central entity with metadata, location, and settings
- **User**: User accounts with authentication and profile data
- **Post**: Tribute posts with multimedia canvas layers
- **Follow**: Memorial following relationships
- **Feed**: Activity feeds for followed content

#### Interaction Models
- **Like**: User likes on posts with engagement metrics
- **Comment**: User comments with threading support
- **Audit**: Activity logging for compliance and analytics

#### Fundraising Models
- **FundraisingProgram**: Fundraising campaigns linked to memorials
- **DonationMirror**: Local copy of donation data from Billing Service
- **PayoutMirror**: Payout tracking and status management

#### Verification Models
- **VerificationCase**: Identity verification cases with status tracking
- **VerificationSecret**: Encrypted sensitive data storage
- **ProviderCheck**: External provider checks (DMF, etc.)
- **ManualReview**: Human review workflow with decisions

#### Content Models
- **UploadSession**: File upload session management
- **Layer**: Canvas layer definitions for posts (IMAGE, VIDEO, TEXT, etc.)

## 🔧 Environment Setup

### Required Environment Variables

Create a `.env` file with the following variables:

```bash
# ==================== Core Configuration ====================

# Database
DATABASE_URI="mongodb+srv://username:password@cluster.mongodb.net/afterlife"

# JWT Authentication
JWT_SECRET="your-super-secure-jwt-secret-key"

# Server Configuration
PORT=3000
CORS_ORIGIN="http://localhost:3000,https://app.thehereafter.tech"

# ==================== External Services ====================

# Redis (for caching)
UPSTASH_REDIS_REST_URL="https://your-redis-endpoint.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"

# Content Service Integration
CONTENT_SERVICE_URL="http://localhost:3030"
CONTENT_SERVICE_API_KEY="your-content-service-api-key"

# Billing Service Integration (for fundraising)
BILLING_SERVICE_URL="http://localhost:3040"
BILLING_SERVICE_WEBHOOK_SECRET="your-billing-webhook-secret"

# Obituary Service Integration
OBITUARY_SERVICE_URL="http://localhost:3020"
OBITUARY_CLIENT_ID="afterlife-service-client"
OBITUARY_CLIENT_SECRET="your-obituary-client-secret"

# ==================== Google Cloud Platform ====================

GCP_PROJECT_ID="your-gcp-project"
GCP_SERVICE_ACCOUNT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----"

# ==================== Verification & DMF ====================

# DMF (Death Master File) Integration via Compliancely
DMF_API_URL="https://api.compliancely.com"
DMF_API_USERNAME="your-dmf-username"
DMF_API_PASSWORD="your-dmf-password"
DMF_WEBHOOK_SECRET="your-dmf-webhook-secret"

# Sensitive Data Encryption
SENSITIVE_DATA_ENCRYPTION_KEY="your-256-bit-encryption-key"
SENSITIVE_DATA_ENCRYPTION_SALT="your-encryption-salt"

# ==================== Feature Flags ====================

# Verification Features
ENABLE_DMF_CHECKS="true"
ENABLE_MANUAL_REVIEWS="true"
ENABLE_SENSITIVE_DATA_CLEANUP="true"
```

### Development vs Production

For **development**, you can use local service URLs:
- Content Service: `http://localhost:3030`
- Billing Service: `http://localhost:3040`
- Obituary Service: `http://localhost:3020`

For **production**, use your deployed service endpoints:
- Content Service: `https://content.svc.thehereafter.tech`
- Billing Service: `https://billing.svc.thehereafter.tech`
- Obituary Service: `https://obituary.svc.thehereafter.tech`

## 📋 Milestone Summaries

### ✅ Milestone 0 & 1: Platform Foundation & Memorial Core
**Status**: Complete

**Deliverables**:
- NestJS application with TypeScript strict mode
- Prisma + MongoDB integration with lifecycle management
- JWT authentication with Passport.js
- Memorial CRUD operations with search and filtering
- Follow/unfollow system with idempotent operations
- Feed generation and management
- Comprehensive error handling and validation
- Health checks and monitoring endpoints
- Swagger/OpenAPI documentation

### ✅ Milestone 2: Canvas Tributes & Social Features
**Status**: Complete

**Deliverables**:
- Canvas-style tribute posts with multimedia layers
- Upload management with Content Service integration
- Like and comment interaction system
- Batch file upload support (max 50 files)
- Layer types: IMAGE, VIDEO, AUDIO, TEXT, STICKER, LIVESTREAM
- Visibility controls: PUBLIC, UNLISTED, PRIVATE
- Engagement metrics and analytics
- OCR text extraction for content discovery

### ✅ Milestone 3: Fundraising & Payments
**Status**: Complete

**Deliverables**:
- Fundraising program management (one per memorial)
- Dual payment flows: hosted checkout (web) + Payment Intents (mobile)
- Stripe integration via Billing Service
- Beneficiary onboarding with Stripe Connect
- Webhook reconciliation for payment events
- Payout management with status tracking
- Currency validation and cents-based calculations
- Comprehensive financial reporting

### ✅ Milestone 4: Verification & DMF Integration
**Status**: Complete

**Deliverables**:
- Identity verification with SSN validation
- DMF (Death Master File) integration via Compliancely
- Document upload and processing with OCR
- Manual review workflow for admin oversight
- Sensitive data handling with AES-256-GCM encryption
- Automatic data cleanup on verification completion
- Webhook handlers for asynchronous DMF results
- Public verification status API (no sensitive data exposure)

## 🛠️ Development Guide

### Code Quality Standards

- **TypeScript**: Strict mode enabled with comprehensive type checking
- **ESLint**: Enforced code style with Biome configuration
- **Prettier**: Automatic code formatting
- **Testing**: Jest unit tests with comprehensive coverage
- **Documentation**: JSDoc comments for all public APIs

### Best Practices

#### Database Operations
```typescript
// Always use transactions for multi-model operations
await this.prisma.$transaction(async (tx) => {
  await tx.memorial.update({ /* ... */ });
  await tx.auditLog.create({ /* ... */ });
});

// Use proper error handling
try {
  const memorial = await this.prisma.memorial.findUniqueOrThrow({
    where: { id: memorialId },
  });
} catch (error) {
  if (error instanceof PrismaClientKnownRequestError) {
    throw new NotFoundException('Memorial not found');
  }
  throw error;
}
```

#### Authentication & Authorization
```typescript
// Use guards for route protection
@UseGuards(JwtAuthGuard)
@Post('memorials')
async createMemorial(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: CreateMemorialDto
) {
  return this.memorialsService.create(dto, user.id);
}
```

#### Error Handling
```typescript
// Use appropriate HTTP exceptions
if (!memorial) {
  throw new NotFoundException('Memorial not found');
}

if (memorial.ownerUserId !== userId) {
  throw new ForbiddenException('Insufficient permissions');
}

// Validate input data
if (amountCents <= 0) {
  throw new BadRequestException('Amount must be positive');
}
```

### Testing

```bash
# Run unit tests
npm run test

# Run e2e tests
npm run test:e2e

# Run tests with coverage
npm run test:cov

# Watch mode for development
npm run test:watch
```

### Database Management

```bash
# Generate Prisma client after schema changes
npm run prisma:generate

# View database in Prisma Studio
npm run prisma:studio

# Reset database (development only)
npm run prisma:reset
```

## 🔒 Security

### Authentication & Authorization
- **JWT Tokens**: 7-day expiration with secure secret rotation
- **Route Guards**: Protected endpoints require valid Bearer tokens
- **User Context**: `@CurrentUser()` decorator for secure user identification
- **Permission Checks**: Owner-only operations validated at service layer

### Data Protection
- **Input Validation**: Comprehensive DTO validation with class-validator
- **SQL Injection Prevention**: Prisma ORM with parameterized queries
- **Rate Limiting**: 60 requests/minute per IP address
- **CORS Policy**: Restricted to whitelisted origins only

### Sensitive Data Handling
- **Encryption**: AES-256-GCM for SSN and sensitive identifiers
- **Hashing**: Scrypt for long-term sensitive data storage
- **Automatic Cleanup**: Sensitive data purged after verification completion
- **Audit Logging**: All sensitive data operations tracked

### External Service Security
- **Webhook Verification**: HMAC signature validation for all webhooks
- **Service-to-Service Auth**: JWT or API key authentication for internal services
- **TLS Encryption**: All external communications over HTTPS

### Compliance & Privacy
- **PII Protection**: No personally identifiable information in logs
- **Data Minimization**: Only collect and store necessary data
- **Right to Deletion**: Support for data deletion requests
- **Audit Trails**: Comprehensive logging for compliance requirements

## 🚀 Deployment

### Docker Support

```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

### Health Checks

The service provides health check endpoints for container orchestration:

- **`GET /health`**: Basic service health and uptime
- **`GET /ready`**: Database connectivity and readiness check

### Environment Configuration

Production deployments should:

1. **Use Environment Variables**: Never hardcode secrets in images
2. **Enable HTTPS**: Use TLS termination at load balancer or reverse proxy
3. **Configure CORS**: Restrict origins to production domains only
4. **Set Rate Limits**: Adjust based on expected load patterns
5. **Monitor Performance**: Use APM tools for observability

### Kubernetes Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: afterlife-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: afterlife-service
  template:
    metadata:
      labels:
        app: afterlife-service
    spec:
      containers:
      - name: afterlife-service
        image: afterlife-service:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URI
          valueFrom:
            secretKeyRef:
              name: afterlife-secrets
              key: database-uri
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
```

---

## 📞 Support & Contributing

### Issues & Bug Reports
Please use GitHub Issues for bug reports and feature requests.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Code Style
This project uses Biome for code formatting and linting. Run `npm run lint` before submitting.

---

**Built with ❤️ for The Hereafter Technologies**
