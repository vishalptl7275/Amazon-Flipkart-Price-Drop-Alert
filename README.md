# Amazon & Flipkart Price Drop Alert Bot

A Telegram bot prototype that tracks Amazon and Flipkart product prices and sends a Telegram notification when a target price is reached. Optional email notifications use SMTP.

## Features

- Register a notification email through Telegram
- Add product URLs and target prices
- List and remove tracked products
- Pause or resume tracking notifications
- Check tracked products on a scheduled interval
- Store users and products in MongoDB
- Optional email notifications

## Stack

Node.js 20+, Telegraf, MongoDB/Mongoose, Axios, Cheerio, Cron and Nodemailer.

## Run locally with Docker

Requirements: Docker Desktop with Docker Compose and a Telegram bot token from BotFather.

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Add your Telegram token to `.env`. Email settings are optional.
3. Start MongoDB and the bot:

   ```bash
   docker compose up --build -d
   ```

4. Open Telegram, find your bot and send `/start`.

View logs:

```bash
docker compose logs -f bot
```

Stop the services:

```bash
docker compose down
```

MongoDB data is stored in the `mongo_data` Docker volume. Do not run multiple bot instances with the same token because each instance uses Telegram polling.

## Run without Docker

Requirements: Node.js 20+ and MongoDB.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set environment variables in your shell:

   ```bash
   export BOT_TOKEN="your-botfather-token"
   export MONGO_URI="mongodb://127.0.0.1:27017/price-alerts"
   export SENDER_EMAIL="your-smtp-email" # optional
   export SENDER_PASS="your-smtp-app-password" # optional
   ```

3. Check syntax and start:

   ```bash
   npm run check
   npm start
   ```

Never commit tokens, SMTP passwords or database credentials. Configure them as private environment variables on your hosting provider.

## Telegram commands

| Command | Purpose |
|---|---|
| `/start` | Register and open the bot menu |
| `/add` | Track a product |
| `/list` | View and remove tracked products |
| `/kick` | Pause or resume notifications |
| `/help` | Show available commands |

## Deployment notes

This is a continuously running Telegram worker, not a static website. It needs a host that supports background workers and a reachable MongoDB database. The included Dockerfile and Compose file support container-based deployment and local testing. Add `BOT_TOKEN` and a production `MONGO_URI` as secrets in the hosting provider before starting the worker.

Retailer pages and anti-bot rules change frequently. Price extraction may fail if Amazon or Flipkart changes its HTML or blocks automated requests. Check the logs and retailer terms before relying on this prototype for real alerts.

## Known limitations

- The project uses legacy Telegraf 3 and Mongoose 5 APIs; upgrade and regression-test before production use.
- Retailer scraping selectors are fragile and may need updates.
- Add tests for parsing, duplicate alerts, retry behavior and user flows before production.
- Use approved retailer APIs where available and comply with each retailer's terms.

## Credits

Originally developed by Parth Sethi. Repository maintenance by Vishal Patel.

## License

MIT
