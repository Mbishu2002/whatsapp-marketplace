# WhatsApp Marketplace

A WhatsApp-based central marketplace system that enables sellers to post products in WhatsApp groups and buyers to search, pay, and interact entirely via WhatsApp.

## Features

- **Group Bot**: Reads messages from seller groups, extracts listings using NLP, and stores them in a database.
- **Search Bot**: Public-facing bot that handles user queries and displays search results.
- **Payment System**: Integrated with Fapshi for secure escrow payments.
- **Rating System**: Allows buyers to rate sellers after purchases.

## Tech Stack

- **Group Reading**: whatsapp-web.js
- **User Bot**: WhatsApp Cloud API
- **Backend**: Node.js
- **Database**: Supabase
- **Payment**: Fapshi API
- **Hosting**: Railway.app / Fly.io / Render

## Project Structure

```
whatsapp-marketplace/
├── config/             # Configuration files
├── docs/               # Documentation
└── src/
    ├── group-bot/      # Group bot implementation
    ├── search-bot/     # Search bot implementation
    ├── database/       # Database models and connections
    ├── payment/        # Payment processing and escrow
    └── services/       # Shared services
```

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Start the group bot: `npm run start:group-bot`
5. Start the search bot: `npm run start:search-bot`

## Monetization

- **Escrow Fee**: 3-10% per transaction
- **Boosted Listings**: Sellers pay for top placement
- **Verified Badge**: Monthly fee for trusted seller badge
- **Search Alerts**: Subscription for product alerts
- **Group Hosting**: Fee for listing groups in "Trusted Groups"
- **Affiliate Selling**: Commission on third-party vendor sales
