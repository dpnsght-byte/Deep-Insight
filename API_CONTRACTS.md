# API Ecosystem Contracts: Deep Insight, Distributor, and User_Manager

This document defines the communication protocols between the three independent services. All communication is over HTTPS using JSON payloads.

---

## 1. Deep Insight (The Producer) $\rightarrow$ Distributor
**Trigger:** Deep Insight completes the AI analysis and audio generation for a filing.

### `POST Distributor/api/v1/ingest`
**Payload:**
```json
{
  "filingId": "uuid-123",
  "ticker": "CRM",
  "companyName": "Salesforce Inc.",
  "formType": "10-K",
  "reportDate": "2025-12-31",
  "isAudited": true,
  "narrative": "Salesforce is pivoting to Agentforce...",
  "audioUrl": "https://deep-insight.app/media/audio/crm_10k.wav",
  "shortAudioUrl": "https://deep-insight.app/media/audio/crm_10k_shorts.wav",
  "thumbnailUrl": "https://deep-insight.app/media/images/crm_10k.png",
  "script": [ { "speaker": "Puck", "text": "..." }, ... ],
  "shortsScript": { "shortsScript": "..." }
}
```
**Response:** `202 Accepted` + `jobId`.

---

## 2. Distributor $\rightarrow$ User_Manager
**Trigger:** Distributor successfully uploads the video to YouTube and Spotify.

### `POST User_Manager/api/v1/webhook/published`
**Payload:**
```json
{
  "ticker": "CRM",
  "formType": "10-K",
  "youtubeUrl": "https://youtube.com/watch?v=xyz",
  "spotifyUrl": "https://open.spotify.com/episode/abc",
  "thumbnailUrl": "https://distributor.app/cdn/crm_10k_final.png",
  "viralTitle": "The $50 Billion Buyback Bombshell | Salesforce Annual Report - Audited Statement Dec 31, 2025"
}
```
**Response:** `200 OK`.

---

## 3. User_Manager $\rightarrow$ Distributor
**Trigger:** User logs into the Web Portal or asks the WhatsApp Bot for a ticker.

### `GET Distributor/api/v1/status/{ticker}`
**Response:**
```json
{
  "exists": true,
  "lastUpdate": "2026-04-14T12:00:00Z",
  "latest": {
    "youtubeUrl": "https://youtube.com/watch?v=xyz",
    "thumbnailUrl": "https://distributor.app/cdn/crm_10k_final.png",
    "formType": "10-K"
  }
}
```

---

## 4. User_Manager $\rightarrow$ Deep Insight
**Trigger:** User adds a valid SEC ticker on the Web Portal that is NOT in the Distributor's archive.

### `POST Deep Insight/api/v1/request-analysis`
**Payload:**
```json
{
  "ticker": "NVDA",
  "requestedBy": "user_manager_service",
  "priority": "normal"
}
```
**Response:** `202 Accepted`. (Note: This triggers an internal notification for the Admin to approve the processing).

---

## Security & Authentication
1.  **Service-to-Service:** All requests must include an `X-Internal-Secret` header. This is a shared secret key known only to the three projects.
2.  **Media Access:** Deep Insight provides a temporary, signed URL for the audio file so the Distributor can download it securely without making the file public to the world.
3.  **Rate Limiting:** Distributor and User_Manager will implement a 5-second cooldown on status checks per user to prevent API abuse.

---
**Task Status:** Documented. Call this file to implement the API routes in any of the three services.
