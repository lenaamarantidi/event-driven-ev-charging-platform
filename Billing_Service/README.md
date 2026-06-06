# Billing Service

## Overview
Billing Service handles invoice generation, payment processing, and billing management for service providers.

**Port**: 3103  
**Database**: billing_db (MariaDB)  
**Events**: Consumes reservation events via RabbitMQ

## Features
- **UC05**: View provider invoices
- **UC07**: Process invoice payments
- **Billing Events**: Tracks API calls, reservations, and charges
- **Invoice Generation**: Auto-generates monthly invoices from billable events
- **Payment Tracking**: Maintains payment history and outstanding invoices

## API Endpoints
- `GET /api/billing/invoice/:providerId` - Current month invoice
- `GET /api/billing/invoices/:providerId` - All invoices with pagination
- `POST /api/billing/invoices/:providerId/:invoiceId/pay` - Process payment (UC07)
- `GET /api/billing/provider/:providerId/payments` - Payment history
- `GET /api/billing/outstanding/:providerId` - Outstanding invoices
- `GET /api/billing/summary/:providerId` - Billing summary
- `GET /health` - Health check

## Database Schema
- **billable_events**: Records billable actions (reservations, charging hours)
- **invoices**: Monthly invoices for providers with status tracking
- **invoice_line_items**: Detailed line items per invoice
- **pricing_config**: Configurable pricing per provider

## Environment Variables
See `.env.template` for full configuration

## Running
```bash
npm install
npm start          # Production
npm run dev        # Development with nodemon
npm test           # Run tests
```