# FreshGuard Render Auto-Deployment Guide

This project is fully configured for continuous integration & automated deployment on [Render](https://render.com). Every commit pushed to the `main` branch will automatically trigger a clean build and zero-downtime deployment.

---

## Architecture Overview
The platform uses a unified monolithic deployment model on Render:
- **Build Step**: Compiles the backend TypeScript into `server/dist/` and the Vite React frontend into `app/dist/`.
- **Runtime**: Express backend serves:
  - All REST endpoints (`/api/auth`, `/api/devices`, `/api/telemetry`, `/api/alerts`, `/api/nutrition`).
  - Real-time WebSockets (`/socket.io`).
  - The single-page React frontend bundle (`app/dist/index.html`).
- **Database**: Automatically uses embedded in-memory PostgreSQL (`pg-mem`) by default, or connects to external PostgreSQL if `DATABASE_URL` is set.

---

## Method 1: 1-Click Blueprint Deployment (Recommended)

1. Open [dashboard.render.com](https://dashboard.render.com) and log in.
2. Click **New +** (top right) and select **Blueprint**.
3. Connect your GitHub repository:
   ```
   mshiva5626/FreshTag-ethylene-trap-box-
   ```
4. Render will automatically read [`render.yaml`](./render.yaml).
5. When prompted for environment variables, fill in your API keys:
   - `GEMINI_API_KEY`: `<your_gemini_api_key>`
   - `OPENROUTER_API_KEY`: `<your_openrouter_api_key>`
   - `VITE_GEMINI_API_KEY`: `<your_gemini_api_key>`
   - `VITE_OPENROUTER_API_KEY`: `<your_openrouter_api_key>`
6. Click **Apply**.
7. Render will build both services, link the domain (`https://freshguard-platform.onrender.com`), and enable **Auto-Deploy on push**!

---

## Method 2: Manual Web Service Setup

If you prefer configuring via the web UI without blueprints:

1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select **Build and deploy from a Git repository**.
3. Choose `mshiva5626/FreshTag-ethylene-trap-box-`.
4. Configure the settings:
   - **Name**: `freshguard-platform`
   - **Region**: Any (e.g. *Oregon, USA* or *Frankfurt, EU*)
   - **Branch**: `main`
   - **Root Directory**: *(leave blank — runs from project root)*
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm start
     ```
   - **Plan**: `Free`
5. Under **Advanced** -> **Health Check Path**, enter:
   ```
   /api/health
   ```
6. Under **Advanced** -> **Auto-Deploy**, ensure **Yes** is selected.
7. Add the following **Environment Variables**:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `10000` | Render standard port (Render will inject automatically) |
| `USE_PG_MEM` | `true` | In-memory PostgreSQL engine |
| `JWT_SECRET` | *(click Generate or enter any 32+ char secret)* | JWT signature token |
| `GEMINI_API_KEY` | `<your_gemini_api_key>` | Google Gemini 3.5 AI key |
| `OPENROUTER_API_KEY` | `<your_openrouter_api_key>` | Google Gemma 4 31B OpenRouter key |
| `VITE_GEMINI_API_KEY` | `<your_gemini_api_key>` | Frontend client Gemini key |
| `VITE_OPENROUTER_API_KEY` | `<your_openrouter_api_key>` | Frontend client Gemma key |

8. Click **Create Web Service**.

---

## How Auto-Deploy Works

- Whenever you run:
  ```bash
  git push origin main
  ```
- GitHub notifies Render via webhook.
- Render automatically pulls the latest commit, runs `npm install && npm run build`, validates the `/api/health` endpoint, and deploys the new version live with zero downtime!

---

## Deploy Hook (Optional Manual Trigger)
If you want to trigger deployments programmatically or from GitHub Actions:
1. In Render Web Service settings, scroll to **Deploy Hook**.
2. Copy the unique URL: `https://api.render.com/deploy/srv-xxxxxxxx?key=yyyyyyyy`.
3. In GitHub repo **Settings** -> **Webhooks** -> **Add webhook**, paste the URL with content type `application/json` on `push` events.
