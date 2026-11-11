# Amazon & Flipkart Price Drop Alert Bot

A Telegram bot that tracks product prices on Amazon and Flipkart and sends notifications when a tracked item reaches a target price. Users can also receive email alerts.

> **Project status:** Learning project / prototype. Retail websites can change their page structure and anti-bot protections, so price extraction may stop working without updates.

## Features

- Register a notification email through Telegram
- Add product URLs and set a target price
- List and remove tracked products
- Pause or resume price notifications
- Periodically check tracked products
- Send Telegram and email notifications
- Store users and tracked products in MongoDB

## Tech stack

- Node.js
- Telegraf (Telegram Bot API)
- MongoDB and Mongoose
- Axios and Cheerio for page retrieval and parsing
- Cron for scheduled checks
- Nodemailer for email alerts

## How it works

1. A user starts the bot and provides an email address.
2. The user submits an Amazon or Flipkart product URL and a target price.
3. The bot stores the tracking request in MongoDB.
4. A scheduled job checks tracked product pages.
5. When the extracted price reaches the target, the bot sends a Telegram message and an email.

## Getting started

### Prerequisites

- Node.js and npm
- A MongoDB database
- A Telegram bot token from BotFather
- An email account configured for SMTP access

### 1. Clone and install

```bash
git clone https://github.com/vishalptl7275/Amazon-Flipkart-Price-Drop-Alert.git
cd Amazon-Flipkart-Price-Drop-Alert
npm install
```

### 2. Configure credentials

Create your local configuration file from the example:

```bash
cp config.example.js config.js
```

Edit `config.js` and provide your own values:

- `SENDER_EMAIL`: email address used to send alerts
- `SENDER_PASS`: email provider app password / SMTP credential
- `BOT_TOKEN`: Telegram bot token
- `MONGO_URI`: MongoDB connection string

**Never commit `config.js`, bot tokens, email passwords, or database credentials.** The local configuration file is ignored by Git.

### 3. Start the bot

```bash
npm start
```

For development with automatic restarts:

```bash
npm run dev
```

## Telegram commands

| Command | Purpose |
|---|---|
| `/start` | Register and open the bot menu |
| `/add` | Track a product |
| `/list` | View and remove tracked products |
| `/kick` | Pause or resume notifications |
| `/help` | Show command help |

## Repository layout

```text
.
├── bot.js
├── config.example.js
├── models/
│   ├── product.js
│   └── user.js
├── package.json
└── package-lock.json
```

## Known limitations

- Price extraction relies on page selectors that retailers may change.
- Automated requests may be rate-limited or blocked by retailer anti-bot systems.
- The bot should handle unavailable prices and request failures more consistently before production use.
- The project has legacy dependencies that should be reviewed and upgraded before deployment.
- Retailer terms and applicable policies should be checked before automated page access.

## Future improvements

- Move configuration to environment variables with a validated configuration layer.
- Add robust retries, request timeouts, and structured logging.
- Add tests for parsing, price comparisons, and notification rules.
- Prevent duplicate alerts for the same price threshold.
- Replace fragile page scraping with approved retailer APIs where available.
- Upgrade dependencies and add automated security checks.

## Credits

Originally developed by Parth Sethi. Updated documentation and repository maintenance by Vishal Patel.

## License

This project is distributed under the MIT License. See [LICENSE](LICENSE) if present in the repository.
