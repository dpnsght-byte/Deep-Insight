# Ecosystem Blueprint: Deep Insight, Distributor, and User_Manager

This document serves as the master plan for the expansion of the Deep Insight ecosystem. It defines the roles, integration points, and business logic for three interconnected services.

## 1. Deep Insight (The Core Engine)
**Status:** Existing
**Role:** Heavy-duty AI analysis and high-fidelity audio generation.
- **Input:** SEC Ticker symbols.
- **Output:** "Mission Documents" (narrative), structured scripts, and raw audio files.
- **API Requirement:** Must provide a webhook or API endpoint for **Distributor** to fetch processed data.

## 2. Project: Distributor (The Public Archive & SEO Engine)
**Role:** The source of truth for all published media and the "Media Library" for the ecosystem.
- **Viral Title Logic (Strict):**
  - Format: `[Viral Hook] | [Company Name] [Annual/Quarterly] Report - Audited Statement [Date]`
  - Example: *"The $50 Billion Buyback Bombshell | Salesforce Annual Report - Audited Statement Dec 31, 2025"*
- **Key Features:**
  - **YouTube/Spotify Integration:** Combines audio with a static image to create video podcasts.
  - **Short Form Video:** Generates 30-second video shorts from the provided shorts audio and script.
  - **SEO Engine:** Generates titles, show notes, and hashtags.
  - **API for User_Manager:**
    - `GET /api/exists/{ticker}`: Returns the most recent YouTube link and thumbnail.
- **Integration:** Receives raw data from Deep Insight (including `audioUrl` and `shortAudioUrl`) and handles the "Public" side of the content.

## 3. Project: User_Manager (The Gatekeeper & WhatsApp Concierge)
**Role:** Manages user identity, subscriptions, and personalized delivery.

### A. The Web Portal (Command Center)
- **Signup:** Phone number entry $\rightarrow$ OTP via WhatsApp $\rightarrow$ Web verification.
- **Ticker Management:**
  - **Limit:** Maximum of 3 tickers per user.
  - **Validation:** Checks SEC list and Distributor API.
  - **Admin Notification:** If a ticker is valid but not in Distributor, sends an automated email to the Admin to trigger Deep Insight.
- **Exclusivity:** Signup and adding/removing tickers **CANNOT** be done via WhatsApp.

### B. The WhatsApp Bot (Delivery Agent)
- **Command: "My Subscriptions"**
  - Returns the list of 3 tickers and a link to the Web Portal.
- **Command: "Send podcast for [TICKER]"**
  - **Logic:**
    1. Check if the user is subscribed to `[TICKER]` in the database.
    2. **If NOT subscribed:** Return Error: *"Access Denied. You are not subscribed to [TICKER]. Manage your portfolio at [Link]."*
    3. **If subscribed but missing:** Return: *"Analysis in Progress. We will message you when it's ready."*
    4. **If subscribed and found:** Send the **Thumbnail Image** with the **YouTube Link** in the caption.
- **Push Notifications:** Automatically blasts the "Visual Link" to subscribed users when Distributor finishes an upload.

---
**Task Status:** Planned. Call this file to begin implementation of individual components.
