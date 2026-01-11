# Synthetic Friends Gmail Tracker (Extension)

Tracks Gmail sends/receives/opens and posts events to the Synthetic Friends pipeline so HubSpot stays in sync.

## What it does
- **Sent tracking**: on send, logs a `sent` event and injects open tracking pixels.
- **Open tracking**: recipients load the tracking pixel, which hits `/email/pixel.gif`.
- **Click tracking (optional)**: wraps links via `/email/redirect`.
- **Received tracking (best-effort)**: when you open a thread, logs a `received` event for the latest inbound message.

## Setup
1) Run the pipeline:

```bash
cd synthetic_friends_pipeline
uvicorn app.main:app --reload --port 8099
```

2) (Optional) Set a shared tracking token in `synthetic_friends_pipeline/.env`:

```
EMAIL_TRACKING_SECRET=your-secret
```

3) Load the extension:
- Chrome → Extensions → Developer mode → Load unpacked
- Select `product/gmail-extension`

4) Open extension settings and set:
- **Pipeline URL** (default `http://localhost:8099`)
- **Tracking Base URL** (the pipeline URL hosting pixel/redirect)
- **Tracking Token** (if enabled)
- **Your Email** (helps filter inbound/outbound)

## HubSpot properties
Run `sales_hubspot/add_these_fields.js` to create the tracking fields before you start logging events.

## Notes
- Open/click tracking requires emails to render images.
- Per-recipient tracking is most accurate when sending to one recipient at a time.
- Receive tracking depends on Gmail UI DOM and is best-effort.
- For full fidelity (server-side sent/receive), add a Gmail API watcher in your backend and post events to `/email/event`.
