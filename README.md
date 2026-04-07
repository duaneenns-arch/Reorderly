# ReOrderly

Scan household items as you run out → build a reorder list → order directly on Walmart.

## Setup

1. Deploy to Netlify
2. Set environment variable: `BLUECART_API_KEY=your_key_here`
3. Connect your custom domain (reorderlysolutions.com)

## How it works

- Scan any barcode with a Bluetooth scanner or phone camera
- App looks up the product in Walmart's catalog via BlueCart API
- Add items to your reorder list with quantity controls
- Tap "Order all on Walmart" to shop everything at once

## Tech Stack

- HTML/CSS/JS frontend
- Netlify Functions (serverless backend)
- BlueCart API (Walmart product data)
- UPCitemdb + Open Food Facts (fallback databases)
