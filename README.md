# MindRipper

Automated web scraper with translation and Notion integration. Scrapes a target URL daily, translates content to French using self-hosted LibreTranslate (100% free & unlimited), and stores both versions in a Notion database.

## Features

- **Automated Scraping**: Daily scraping via configurable cron schedule
- **Smart Content Extraction**: Intelligently extracts title, author, date, and main content
- **100% Free Translation**: Self-hosted LibreTranslate included - no API key, unlimited translations
- **Notion Integration**: Stores bilingual content with full history in Notion database
- **Complete Docker Setup**: LibreTranslate + MindRipper in one docker-compose
- **Robust Error Handling**: Retry logic, exponential backoff, error logging
- **Health Monitoring**: HTTP endpoints for health checks and manual triggers

## Quick Start

### Prerequisites

- Docker & Docker Compose (required for deployment)
- Notion account (for data storage)
- ~1.5GB RAM for both services (MindRipper + LibreTranslate)
- (Optional) Node.js 20+ for local development without Docker

### Local Development

1. **Clone and install dependencies**:
   ```bash
   cd MindRipper
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Translation Setup**:
   - ✅ Already configured! LibreTranslate runs automatically via docker-compose
   - ✅ 100% free and unlimited
   - ✅ No API key needed
   - ✅ Only loads EN→FR models to save memory

4. **Setup Notion**:
   - Go to [Notion Integrations](https://www.notion.so/my-integrations)
   - Create new integration named "MindRipper"
   - Copy Internal Integration Token to `.env` as `NOTION_API_KEY`
   - Create a database in Notion (or let the app create it)
   - Share the database with your integration
   - Copy database ID from URL to `.env` as `NOTION_DATABASE_ID`

5. **Run in development mode**:
   ```bash
   npm run dev
   ```

6. **Test the scraper**:
   ```bash
   curl -X POST http://localhost:3000/trigger
   ```

### Docker Deployment (Recommended)

1. **Build and start** (starts both MindRipper + LibreTranslate):
   ```bash
   docker-compose up -d
   ```

   First startup takes ~2 minutes to download LibreTranslate models.

2. **View logs**:
   ```bash
   docker-compose logs -f mindripper      # MindRipper logs
   docker-compose logs -f libretranslate  # Translation service logs
   ```

3. **Check health**:
   ```bash
   curl http://localhost:3000/health
   ```

4. **Stop**:
   ```bash
   docker-compose down
   ```

**What runs:**
- `libretranslate` service: Translation engine (internal, port 5000)
- `mindripper` service: Scraper + scheduler (exposed, port 3000)

## Configuration

All configuration is done via environment variables (see `.env.example`):

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TARGET_URL` | URL to scrape | `https://example.com/article` |
| `SCRAPE_CRON` | Cron schedule | `0 9 * * *` (daily at 9 AM) |
| `NOTION_API_KEY` | Notion integration token | `secret_...` |
| `NOTION_DATABASE_ID` | Notion database ID | `abc123...` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | HTTP server port |
| `TZ` | `Europe/Paris` | Timezone for cron |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

**Note:** LibreTranslate URL is automatically configured via docker-compose to `http://libretranslate:5000/translate`

### Cron Expression Examples

- `0 9 * * *` - Every day at 9:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 1` - Every Monday at midnight
- `30 8 * * 1-5` - Weekdays at 8:30 AM

## API Endpoints

### GET /health

Health check endpoint. Returns application status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "scheduler": {
    "isScheduled": true,
    "isRunning": false
  },
  "environment": {
    "nodeEnv": "production",
    "hasTargetUrl": true,
    "hasCronExpression": true,
    "hasGoogleTranslateKey": true,
    "hasNotionKey": true,
    "hasNotionDatabaseId": true
  }
}
```

### POST /trigger

Manually trigger scraping workflow (without waiting for cron).

**Response:**
```json
{
  "message": "Scraping workflow started",
  "url": "https://example.com/article",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /status

Get scheduler status and configuration.

**Response:**
```json
{
  "scheduler": {
    "isScheduled": true,
    "isRunning": false,
    "cronExpression": "0 9 * * *"
  },
  "config": {
    "targetUrl": "https://example.com/article",
    "hasGoogleTranslateKey": true,
    "hasNotionKey": true,
    "hasNotionDatabaseId": true
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Notion Database Structure

The app creates/uses a Notion database with these properties:

| Property | Type | Description |
|----------|------|-------------|
| Name | Title | Article title (EN) |
| Date | Date | Scraping date |
| URL | URL | Source URL |
| Titre EN | Rich Text | Original title |
| Titre FR | Rich Text | Translated title |
| Contenu EN | Rich Text | Original content (preview) |
| Contenu FR | Rich Text | Translated content (preview) |
| Auteur | Rich Text | Author (if available) |
| Date publication | Date | Publication date (if available) |
| Statut | Select | success or error |
| Word count | Number | Word count of original content |

Full content is stored as page blocks (unlimited length).

## Deployment on Dokploy

### 1. Prepare Repository

```bash
# Commit all changes
git add .
git commit -m "Initial MindRipper setup"
git push origin main
```

### 2. Configure Dokploy

1. Create new **Docker Compose** application
2. Connect to your GitHub repository
3. Select branch (e.g., `main`)
4. Set working directory to `MindRipper`

### 3. Configure Environment Variables

In Dokploy UI, add these environment variables:

```
TARGET_URL=https://your-target-url.com/article
SCRAPE_CRON=0 9 * * *
NOTION_API_KEY=secret_your-notion-key
NOTION_DATABASE_ID=your-database-id
NODE_ENV=production
TZ=Europe/Paris
# LibreTranslate URL is automatically configured via docker-compose
```

### 4. Deploy

Click "Deploy" in Dokploy. The application will:
- Build Docker image
- Start container
- Run automatic scraping based on cron schedule

### 5. Monitor

- View logs in Dokploy UI
- Check health: `curl https://your-domain.com/health`
- Trigger manually: `curl -X POST https://your-domain.com/trigger`

## Development

### Project Structure

```
MindRipper/
├── src/
│   ├── scraper.ts      # Web scraping with Cheerio
│   ├── translator.ts   # Google Translate integration
│   ├── notion.ts       # Notion API client
│   ├── scheduler.ts    # Cron job orchestration
│   ├── logger.ts       # Centralized logging
│   └── index.ts        # HTTP server & entry point
├── Dockerfile          # Multi-stage production image
├── docker-compose.yml  # Service orchestration
├── package.json
├── tsconfig.json
└── .env.example
```

### Available Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Build TypeScript
npm start        # Start production build
```

### Adding Features

The codebase is modular and easy to extend:

- **Add new scrapers**: Extend `src/scraper.ts`
- **Support more languages**: Modify `src/translator.ts`
- **Custom Notion fields**: Update `src/notion.ts`
- **Additional schedules**: Modify `src/scheduler.ts`

## Troubleshooting

### LibreTranslate Connection Failed

**Error:** `Translation failed` or connection errors to LibreTranslate

**Solution:**
- Check LibreTranslate service is running: `docker-compose ps`
- View LibreTranslate logs: `docker-compose logs libretranslate`
- Restart services: `docker-compose restart`
- First startup takes ~2 minutes to download models - be patient!

### Notion Connection Failed

**Error:** `Notion connection failed`

**Solution:**
- Verify `NOTION_API_KEY` is correct
- Ensure database is shared with integration
- Check `NOTION_DATABASE_ID` format (no dashes or special chars)

### Scraping Fails

**Error:** `Could not extract content from page`

**Solution:**
- Verify target URL is accessible
- Check if page requires JavaScript rendering (Cheerio only works with static HTML)
- Inspect page structure and adjust selectors in `src/scraper.ts`

### Cron Not Running

**Solution:**
- Verify `SCRAPE_CRON` expression is valid
- Check timezone with `TZ` environment variable
- Review logs: `docker-compose logs -f mindripper`

## Cost Estimation

### 100% Free Solution
- **LibreTranslate**: FREE & UNLIMITED (self-hosted)
- **Notion**: FREE - Unlimited pages (Personal plan)
- **Hosting**: $5-15/month (VPS with 2GB RAM)

**Total cost: $5-15/month for hosting only**

### Resource Requirements
- **RAM**: ~1.5GB total (MindRipper: ~256MB, LibreTranslate: ~1GB)
- **Storage**: ~500MB for Docker images + models
- **CPU**: Minimal (translation is fast with loaded models)
- **Bandwidth**: Minimal (only scraping 1 article/day)

## Security

- ✅ Never commit `.env` file
- ✅ Keep Notion integration token secure
- ✅ Use self-hosted LibreTranslate for complete data privacy
- ✅ Run as non-root user in Docker
- ✅ Regular dependency updates

## License

ISC

## Support

For issues or questions:
- Check logs: `docker-compose logs -f`
- Test endpoints: `/health`, `/status`
- Trigger manually: `POST /trigger`
