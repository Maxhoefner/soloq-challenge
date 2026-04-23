# Soloq Challenge — Setup & Deploy Guide

A live ranked leaderboard for a group of friends, powered by the Riot Games API.

---

## 🚀 Option 1: Deploy to Railway (Recommended — Free, always online)

Railway hosts the app in the cloud so it runs 24/7 without needing your own computer on.

### Step 1 — Get a Riot API Key

1. Go to [https://developer.riotgames.com](https://developer.riotgames.com)
2. Log in with your League of Legends account
3. Under **"Development API Key"**, copy the key (looks like `RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

> ⚠️ **Important:** Development keys expire every 24 hours. For permanent hosting you need a **Production key** — apply for one at the same site under "Register Product". This is free but requires a short description of your project.

---

### Step 2 — Upload the project to GitHub

Railway deploys from GitHub, so you need to upload the code there first.

1. Go to [https://github.com](https://github.com) and create a free account if you don't have one
2. Click **"New repository"** → name it `soloq-challenge` → set it to **Private** → click **Create**
3. On your computer, open a terminal in this folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/soloq-challenge.git
git push -u origin main
```

> Replace `YOUR_USERNAME` with your actual GitHub username.

---

### Step 3 — Deploy on Railway

1. Go to [https://railway.app](https://railway.app) and sign up with your GitHub account
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `soloq-challenge` repository
4. Railway will detect it's a Python app and start deploying automatically

---

### Step 4 — Add your Riot API Key

1. In Railway, click on your deployed project
2. Go to **"Variables"** tab
3. Click **"Add Variable"**
4. Set:
   - **Name:** `RIOT_API_KEY`
   - **Value:** your key from Step 1 (e.g. `RGAPI-xxxx-xxxx-xxxx`)
5. Click **Save** — Railway will restart the app automatically

---

### Step 5 — Get your public URL

1. In Railway, go to **"Settings"** → **"Networking"**
2. Click **"Generate Domain"**
3. You'll get a URL like `https://soloq-challenge-production.up.railway.app`
4. Share this URL with everyone — it's your live leaderboard! 🎉

---

## 💻 Option 2: Run locally on your own computer

If you just want to run it on your own machine:

### Requirements
- Python 3.9 or higher — download from [https://python.org](https://python.org)

### Setup

1. Open a terminal in this folder
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file (copy from `.env.example`):
   ```bash
   copy .env.example .env
   ```
4. Edit `.env` and replace the placeholder with your real Riot API key:
   ```
   RIOT_API_KEY=RGAPI-your-real-key-here
   ```
5. Start the server:
   ```bash
   python server.py
   ```
6. Open your browser at [http://localhost:5000](http://localhost:5000)

---

## ❓ FAQ

**Q: The page shows "RIOT_API_KEY no configurada"**
→ You haven't added the API key yet. Follow Steps 1 + 4 above.

**Q: My Development API key expired (it stops working after 24h)**
→ Go back to [developer.riotgames.com](https://developer.riotgames.com), generate a new key, and update the `RIOT_API_KEY` variable in Railway (or your `.env` file).

**Q: The data isn't updating**
→ The app automatically refreshes player data every time you click "Actualizar". The LP chart updates daily at 23:55 automatically.

**Q: Can I change the players in the leaderboard?**
→ Yes — edit the `PLAYERS` list in `server.py`. Each entry has `gameName` and `tagLine` (the part after `#` in your Riot ID).

---

## 📁 Project Structure

```
soloq-challenge/
├── server.py          # Flask backend — all Riot API logic
├── requirements.txt   # Python dependencies
├── Procfile           # Railway/Heroku start command
├── .env.example       # Template for your API key
├── templates/
│   └── index.html     # Main page HTML
├── static/
│   ├── css/style.css  # Styles
│   └── js/app.js      # Frontend logic + Chart
└── data/
    ├── cache.json      # Cached player data (auto-generated)
    └── lp_history.json # Daily LP snapshots for the chart