# MindRipper - IdeaBrowser Edition

Specialized automated scraper for **ideabrowser.com** business idea analysis. Extracts detailed business intelligence, translates EN→FR using self-hosted LibreTranslate (100% free & unlimited), and stores comprehensive bilingual data in Notion with 42 structured properties.

## Features

- **IdeaBrowser Specialized**: Extracts 42 data points including Business Fit analysis, Keywords metrics, and Categorization
- **Automated Scraping**: Daily scraping via configurable cron schedule with Puppeteer (JavaScript rendering)
- **Deep Data Extraction**: Business opportunities, problems, market analysis, keywords with search volumes and growth rates
- **Comprehensive Translation**: 26-batch intelligent translation (EN→FR) with graceful fallbacks
- **100% Free Translation**: Self-hosted LibreTranslate included - no API key, unlimited translations
- **Rich Notion Integration**: 42 properties + full-text blocks with bilingual content
- **Complete Docker Setup**: LibreTranslate + MindRipper + Chromium in one docker-compose
- **Robust Error Handling**: Retry logic, exponential backoff, error logging with Notion tracking
- **Health Monitoring**: HTTP endpoints for health checks, manual triggers, and status queries

## What Gets Scraped

Unlike generic scrapers, MindRipper extracts structured business intelligence from ideabrowser.com:

- **Business Fit** (7 sections): Opportunities, Problems, Why Now, Feasibility, Revenue Potential, Execution Difficulty, Go-to-Market
- **Keywords** (with metrics): Names, monthly search volumes, growth rates, trends
- **Categorization** (5 dimensions): Type, Market, Target Audience, Main Competitor, Trend Analysis
- **Metadata**: Open Graph tags, publication dates, word counts, translation metrics

All content is translated EN→FR and stored bilingually in Notion with 42 properties.

See [IDEABROWSER.md](./IDEABROWSER.md) for complete documentation.

## Quick Start

### Prerequisites

- Docker & Docker Compose (required for deployment)
- Notion account (for data storage)
- **~2GB RAM** for all services (MindRipper + LibreTranslate + Chromium)
- (Optional) Node.js 20+ for local development without Docker
- **Note**: Increased RAM requirement due to Puppeteer/Chromium for JavaScript rendering

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

4. **Setup Notion** (42 properties required for IdeaBrowser):
   - Go to [Notion Integrations](https://www.notion.so/my-integrations)
   - Create new integration named "MindRipper IdeaBrowser"
   - Copy Internal Integration Token to `.env` as `NOTION_API_KEY`
   - Create a database in Notion with 42 properties (see [IDEABROWSER.md](./IDEABROWSER.md) for complete list)
   - Share the database with your integration (click "..." → "Connections")
   - Copy database ID from URL to `.env` as `NOTION_DATABASE_ID`
   - **Test connection**: `npx tsx scripts/diagnose-notion.ts`

5. **Run in development mode**:
   ```bash
   npm run dev
   ```

6. **Test the complete workflow**:
   ```bash
   # Test Notion connection first
   npx tsx scripts/diagnose-notion.ts

   # Test complete scraping workflow
   npx tsx scripts/test-workflow-complete.ts

   # Or trigger via HTTP endpoint
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

### IdeaBrowser Edition: 42 Properties

The app creates/uses a Notion database with **42 structured properties** for comprehensive business intelligence storage:

**Property Groups:**
- **General** (6): Name, Date scraping, Date publication, URL, Statut, Image Preview
- **Business Fit EN** (7): Opportunities, Problems, Why Now, Feasibility, Revenue Potential, Execution Difficulty, Go-to-Market
- **Business Fit FR** (7): French translations of all Business Fit sections
- **Keywords** (6): Keywords list, Top Keyword, Keywords Count, Avg Volume, High Growth Count, Total Volume
- **Categorization EN** (5): Type, Market, Target Audience, Main Competitor, Trend Analysis
- **Categorization FR** (5): French translations of all Categorization fields
- **Metrics** (5): Word Count EN/FR, Total Score, Translation Duration, Failed Translations
- **Errors** (1): Error messages

Full content and detailed keyword data are stored as structured page blocks.

**See [IDEABROWSER.md](./IDEABROWSER.md) for complete property list, types, and recommended views.**

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
│   ├── scraper.ts         # IdeaBrowser scraping with Puppeteer
│   ├── translator.ts      # LibreTranslate integration (26-batch system)
│   ├── notion.ts          # Notion API client (42 properties)
│   ├── scheduler.ts       # Cron job orchestration
│   ├── logger.ts          # Centralized logging
│   ├── index.ts           # HTTP server & entry point
│   └── types/
│       ├── scraper.types.ts    # IdeaBrowser content interfaces
│       └── translation.types.ts # Translation metadata types
├── scripts/
│   ├── diagnose-notion.ts          # Notion connection tester
│   └── test-workflow-complete.ts   # E2E workflow test
├── Dockerfile          # Multi-stage with Chromium
├── docker-compose.yml  # LibreTranslate + MindRipper
├── package.json
├── tsconfig.json
├── .env.example
├── README.md           # This file
├── CLAUDE.md           # AI assistant guidance
└── IDEABROWSER.md      # Complete IdeaBrowser docs
```

### Available Scripts

```bash
# Development
npm run dev      # Development with hot reload
npm run build    # Build TypeScript
npm start        # Start production build

# Testing
npm run test:complete  # Complete E2E workflow test
npx tsx scripts/diagnose-notion.ts  # Test Notion connection

# Docker
docker-compose build   # Build services
docker-compose up -d   # Start in background
docker-compose logs -f # Follow logs
```

### Extending for Other Sites

While specialized for IdeaBrowser, the codebase can be adapted:

- **Scraper**: Modify `src/scraper.ts` with new Puppeteer selectors
- **Notion schema**: Update `src/notion.ts` property mapping
- **Translation batching**: Adjust `src/translator.ts` batch strategy
- **Cron schedule**: Modify `SCRAPE_CRON` in `.env`

**Note**: Non-IdeaBrowser sites may require different Notion database structure.

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

**Error:** `Could not extract content from page` or `Timeout waiting for selector`

**Solution:**
- Verify target URL is accessible and is from ideabrowser.com
- IdeaBrowser requires JavaScript rendering (uses Puppeteer, not Cheerio)
- Check if ideabrowser.com changed their HTML structure
- Inspect page with browser DevTools and adjust selectors in `src/scraper.ts`
- Increase `PUPPETEER_TIMEOUT` if page loads slowly

**Error:** `Chromium not found` or `Browser launch failed`

**Solution:**
- Local: Run `npx puppeteer browsers install chrome`
- Docker: Ensure Dockerfile installs Chromium (`apk add chromium`)
- Check `PUPPETEER_EXECUTABLE_PATH` environment variable

### Cron Not Running

**Solution:**
- Verify `SCRAPE_CRON` expression is valid
- Check timezone with `TZ` environment variable
- Review logs: `docker-compose logs -f mindripper`

## Cost Estimation

### 100% Free Solution
- **LibreTranslate**: FREE & UNLIMITED (self-hosted)
- **Notion**: FREE - Unlimited pages (Personal plan)
- **Hosting**: $10-20/month (VPS with 2GB RAM for IdeaBrowser edition)

**Total cost: $10-20/month for hosting only**

### Resource Requirements (IdeaBrowser Edition)
- **RAM**: ~2GB total (MindRipper + Chromium: ~768MB, LibreTranslate: ~1GB)
- **Storage**: ~700MB for Docker images + models + Chromium
- **CPU**: 0.5-1.0 core (Puppeteer + translation)
- **Bandwidth**: Minimal (scraping 1 article/day, ~45 seconds per workflow)

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
