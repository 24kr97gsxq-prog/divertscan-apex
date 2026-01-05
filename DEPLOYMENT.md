# DivertScan™ Apex - Deployment Guide

This guide covers deploying DivertScan™ to various platforms.

---

## Quick Deploy Options

### Option 1: Railway (Recommended for simplicity)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add services
railway add --name postgres
railway add --name redis

# Set environment variables
railway variables set JWT_SECRET=your-secret-key
railway variables set STRIPE_SECRET_KEY=sk_test_...
# ... etc

# Deploy
railway up
```

### Option 2: Fly.io (Best for iPad field access)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app
fly apps create divertscan-apex

# Create Postgres
fly postgres create --name divertscan-db

# Create Redis
fly redis create --name divertscan-redis

# Attach database
fly postgres attach divertscan-db

# Set secrets
fly secrets set JWT_SECRET=your-secret-key
fly secrets set STRIPE_SECRET_KEY=sk_test_...

# Deploy
fly deploy
```

**fly.toml:**
```toml
app = "divertscan-apex"
primary_region = "dfw"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[env]
  NODE_ENV = "production"

[[services]]
  protocol = "tcp"
  internal_port = 8000

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = 10000
    grace_period = "5s"
    method = "get"
    path = "/health"
    protocol = "http"
    timeout = 2000
```

### Option 3: Docker Compose (Self-hosted)

```bash
# Clone repository
git clone https://github.com/divertscan/apex-enterprise.git
cd apex-enterprise

# Configure environment
cp .env.example .env
nano .env  # Edit with your values

# Start services
docker-compose --profile production up -d

# Run database migrations
docker-compose exec api psql $DATABASE_URL -f database/schema.sql

# Check status
docker-compose ps
docker-compose logs -f api
```

---

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379/0` |
| `JWT_SECRET` | Auth signing key (32+ chars) | `abc123...` |
| `STRIPE_SECRET_KEY` | Stripe API key | `sk_live_...` |

### QuickBooks Online (Optional)

| Variable | Description |
|----------|-------------|
| `QBO_CLIENT_ID` | OAuth client ID |
| `QBO_CLIENT_SECRET` | OAuth client secret |
| `QBO_REDIRECT_URI` | OAuth callback URL |
| `QBO_ENVIRONMENT` | `sandbox` or `production` |

### Twilio SMS (Optional)

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Account SID |
| `TWILIO_AUTH_TOKEN` | Auth token |
| `TWILIO_PHONE_NUMBER` | From number (+1...) |

### AI/OCR (Optional)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | GPT-4o fallback |

### Storage

| Variable | Description |
|----------|-------------|
| `STORAGE_PROVIDER` | `r2` or `s3` |
| `R2_ACCOUNT_ID` | Cloudflare account |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | Bucket name |
| `R2_PUBLIC_URL` | Public CDN URL |

---

## Database Setup

### Initial Schema

```bash
# Using psql
psql $DATABASE_URL -f database/schema.sql

# Or via Docker
docker-compose exec postgres psql -U divertscan -d divertscan -f /docker-entrypoint-initdb.d/01-schema.sql
```

### Demo Data

The schema includes demo data for testing:
- Tenant: Dalmex Recycling LLC
- User: demo@dalmex.com / demo123
- Projects: Downtown Office Tower, Children's Hospital

---

## SSL/HTTPS Setup

### With Cloudflare (Recommended)

1. Add domain to Cloudflare
2. Enable "Full (strict)" SSL mode
3. Point DNS to your server

### With Let's Encrypt

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d app.divertscan.com

# Auto-renewal is configured automatically
```

---

## Scaling

### Horizontal Scaling

```bash
# Docker Compose
docker-compose up -d --scale api=3

# Fly.io
fly scale count 3

# Railway
# Set in dashboard: Replicas = 3
```

### Database Scaling

For PostgreSQL:
- Use connection pooling (PgBouncer)
- Set `DATABASE_POOL_SIZE=20`
- Consider read replicas for analytics

### Redis Scaling

- Use Redis Cluster for high availability
- Consider Redis Sentinel for failover

---

## Monitoring

### Health Checks

```bash
# API health
curl https://app.divertscan.com/health

# Response
{"status": "healthy", "version": "3.0.0"}
```

### Logging

```bash
# Docker logs
docker-compose logs -f api

# Fly.io logs
fly logs

# Railway logs
railway logs
```

### Error Tracking (Sentry)

```bash
# Set Sentry DSN
SENTRY_DSN=https://...@sentry.io/...
```

---

## Backup & Recovery

### Database Backup

```bash
# Manual backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Automated Backups

Railway and Fly.io include automated daily backups. For self-hosted:

```bash
# Add to crontab
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/db-$(date +\%Y\%m\%d).sql.gz
```

---

## Security Checklist

- [ ] JWT_SECRET is at least 32 characters
- [ ] All API keys are production keys
- [ ] HTTPS is enforced
- [ ] CORS origins are restricted
- [ ] Rate limiting is enabled
- [ ] Database has strong password
- [ ] Redis has authentication
- [ ] Firewall allows only necessary ports

---

## Troubleshooting

### API not responding

```bash
# Check container status
docker-compose ps

# Check logs
docker-compose logs api

# Restart
docker-compose restart api
```

### Database connection errors

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check if database exists
psql $DATABASE_URL -c "\l"
```

### OCR not working

```bash
# Verify API keys
curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages
```

### SMS not sending

```bash
# Test Twilio
curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -d "From=$TWILIO_PHONE_NUMBER" \
  -d "To=+1234567890" \
  -d "Body=Test"
```

---

## Support

- Documentation: https://docs.divertscan.com
- Email: support@divertscan.com
- Status: https://status.divertscan.com
