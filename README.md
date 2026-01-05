# DivertScan™ Apex Enterprise v3.0

**Production-Ready LEED v5 Construction Waste Management Platform**

iPad-optimized multi-tenant SaaS for tracking, analyzing, and reporting construction debris diversion with real-time LEED compliance, QuickBooks integration, and AI-powered OCR.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Python 3.12+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose (optional)

### Development Setup

```bash
# Clone and install
git clone https://github.com/dalmex/divertscan-apex.git
cd divertscan-apex
npm install
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start with Docker (recommended)
docker-compose up -d

# Or start services manually
# Terminal 1: Database
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16-alpine

# Terminal 2: Backend
npm run backend:dev

# Terminal 3: Frontend
npm run dev
```

Access the app at `http://localhost:5173`

---

## 📁 Project Structure

```
divertscan-apex/
├── src/
│   ├── App.tsx                    # Main React application
│   ├── core/                      # Core business logic
│   │   ├── SaaSArchitecture.ts    # Multi-tenant, auth, Stripe billing
│   │   ├── LEEDAnalyticsEngine.ts # LEED v5 calculations, carbon tracking
│   │   ├── PlatinumFieldWorkflow.ts # Live Load module (Raul's Mode)
│   │   └── SmartCSVImporter.ts    # CSV import with auto-mapping
│   ├── modules/                   # React UI modules
│   │   ├── AnalyticsDashboard.tsx # Real-time LEED dashboard
│   │   ├── LiveLoadModule.tsx     # Two-stage weighing workflow
│   │   ├── CSVImportModule.tsx    # Drag-drop CSV import
│   │   ├── FacilityVaultModule.tsx # Permit management
│   │   ├── InvoicingModule.tsx    # QuickBooks invoicing
│   │   └── SettingsModule.tsx     # User/tenant settings
│   ├── backend/                   # Python FastAPI backend
│   │   ├── main.py                # API routes
│   │   ├── InvoiceEngine.py       # QuickBooks integration
│   │   └── UnifiedOCR.py          # AI-powered OCR
│   └── test/                      # Test files
├── database/
│   └── schema.sql                 # PostgreSQL schema
├── docker-compose.yml             # Full stack configuration
├── Dockerfile                     # Production build
├── nginx.conf                     # Production proxy
└── package.json                   # Dependencies
```

---

## 🔧 Core Features

### 1. Multi-Tenant Architecture
- Tenant isolation with `X-Tenant-ID` header
- Role-based permissions (admin, project_manager, field_operator, viewer)
- Stripe subscription billing (Starter $99, Professional $299, Enterprise $799)

### 2. Live Load Module (Raul's Mode)
Two-stage weighing workflow optimized for iPad field use:
1. **Setup** - Truck, driver, material selection
2. **Gross Weight** - Incoming weight capture
3. **Tare Weight** - Empty truck weight
4. **Photos** - Minimum 3 debris photos
5. **Signature** - Touch-optimized driver signature
6. **Review** - Confirm and submit

Features:
- High-accuracy GPS at both weighing stages
- IndexedDB session persistence (crash recovery)
- Twilio SMS receipts with digital ticket links
- Offline-first with sync queue

### 3. LEED v5 Analytics
- Real-time diversion rate calculation
- 50%/75% threshold tracking
- Material breakdown with per-ton carbon savings
- Carbon credits: CO2 avoided, trees equivalent, cars off road

### 4. AI-Powered OCR
Dual-provider OCR with intelligent source detection:
- **Anthropic Claude Sonnet 4** - Primary (handwritten B&B tickets)
- **OpenAI GPT-4o** - Fallback (thermal printouts)
- Auto-classifies: `B&B`, `Liberty`, `Generic`

### 5. QuickBooks Online Integration
- OAuth2 authentication with auto-refresh
- Auto-creates customers and invoices
- Groups tickets by material type
- PDF attachment and email via QBO

### 6. CSV Import
Smart import with:
- Auto-delimiter detection
- Fuzzy column mapping (50+ aliases)
- Validation with error/warning separation
- Status override for pending tickets

### 7. Facility Permit Vault
- Permit document storage
- Expiration tracking (30/60/90 day alerts)
- 8 permit types (solid waste, recycling, composting, etc.)

---

## 🛠 API Endpoints

### Authentication
```
POST /api/auth/signin     # Login
POST /api/auth/signup     # Register
```

### Projects
```
GET  /api/projects                      # List projects
POST /api/projects                      # Create project
GET  /api/projects/{id}                 # Get project
GET  /api/projects/{id}/analytics       # LEED analytics
```

### Weight Tickets
```
GET  /api/projects/{id}/tickets         # List tickets
POST /api/projects/{id}/tickets         # Create ticket
POST /api/projects/{id}/tickets/batch   # Batch import
PATCH /api/tickets/{id}                 # Update ticket
```

### Facilities
```
GET  /api/facilities                    # List facilities
POST /api/facilities                    # Create facility
GET  /api/facilities/{id}/permits       # List permits
POST /api/facilities/{id}/permits       # Add permit
GET  /api/facilities/permits/expiring   # Expiring permits
```

### Invoicing
```
GET  /api/projects/{id}/invoices        # List invoices
POST /api/projects/{id}/invoices/generate  # Generate invoice
POST /api/invoices/{id}/sync-qbo        # Sync to QuickBooks
POST /api/invoices/{id}/send            # Send via email
```

### Integrations
```
GET  /api/integrations/quickbooks/status    # QBO status
GET  /api/integrations/quickbooks/authorize # OAuth start
POST /api/integrations/quickbooks/callback  # OAuth callback
```

---

## 📱 iPad Optimization

- **44px minimum touch targets** for all buttons
- **High DPI canvas scaling** for signature capture
- **Image compression** before upload (max 1920x1080)
- **IndexedDB** for large data, localStorage for auth only
- **Lazy-loaded React modules** for memory efficiency
- **Touch event handling** with `passive: false`
- **Offline-first** with exponential backoff sync

---

## 🔐 Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `QBO_CLIENT_ID` | QuickBooks app client ID |
| `QBO_CLIENT_SECRET` | QuickBooks app secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `ANTHROPIC_API_KEY` | Anthropic API key for OCR |
| `OPENAI_API_KEY` | OpenAI API key for fallback OCR |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |

See `.env.example` for complete list.

---

## 🧪 Testing

```bash
# Frontend tests
npm run test

# Backend tests
pytest

# Coverage report
npm run test:coverage
```

---

## 🚢 Deployment

### Docker Production
```bash
docker-compose --profile production up -d
```

### Manual Production
```bash
# Build frontend
npm run build

# Run backend with gunicorn
npm run backend:prod
```

### Required Production Setup
1. PostgreSQL database with schema applied
2. Redis for caching
3. Cloudflare R2 or S3 for file storage
4. SSL certificates for nginx
5. Environment variables configured

---

## 📊 Material Rates (Default)

| Material | Rate/Ton | Carbon Factor |
|----------|----------|---------------|
| Concrete | $35.00 | 23 kg CO2e |
| Asphalt | $38.00 | 45 kg CO2e |
| Metal (Ferrous) | $45.00 | 1,850 kg CO2e |
| Metal (Non-Ferrous) | $85.00 | 9,100 kg CO2e |
| Wood (Clean) | $42.00 | 890 kg CO2e |
| Cardboard | $38.00 | 3,100 kg CO2e |
| Drywall | $48.00 | 178 kg CO2e |
| Mixed C&D | $52.00 | 156 kg CO2e |

---

## 📄 License

Proprietary - DivertScan™ is a trademark of Dalmex Recycling LLC.
Licensed to Dalmex Recycling LLC under commercial terms.

---

## 👥 Support

- **Technical Issues**: support@divertscan.com
- **Sales**: sales@divertscan.com
- **Documentation**: https://docs.divertscan.com

---

Built with ❤️ for the recycling industry by Dalmex Recycling LLC
