# UK Wind Forecast Monitor

This repository implements the REint full stack challenge using:

- `frontend/`: Next.js + React charting UI
- `backend/`: FastAPI service that fetches live BMRS data and applies the horizon logic
- `notebooks/`: Jupyter notebooks for forecast-error analysis and reliable wind-supply analysis

## Repository contents

- `frontend/app/`: Next.js pages, layout, styles, and server route
- `frontend/components/`: UI components
- `frontend/lib/`: client fetch helpers and shared wind-monitoring logic
- `backend/app/`: FastAPI backend used for local/dev and notebook reuse
- `notebooks/`: analysis notebooks requested by the challenge
- `.git/`: full commit history for submission review

## What the app does

- Pulls actual generation from `FUELHH` filtered to `fuelType=WIND`
- Pulls forecast publishes from `WINDFOR`
- Restricts all analysis to January 2024
- Selects the latest forecast where `publishTime <= targetTime - horizon`
- Aligns actual and forecast data on `startTime`
- Exposes the merged series through FastAPI
- Renders a responsive line chart in Next.js

## Local setup

### Frontend-only app

```bash
cd /Users/adityakumarsingh/Documents/project/frontend
npm install
npm run dev
```

Frontend default URL: `http://127.0.0.1:3000`

The deployed Vercel app uses the Next.js server route at `/api/wind-monitoring`, so it does not require the FastAPI backend in production.

### Backend

```bash
cd /Users/adityakumarsingh/Documents/project/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend default URL: `http://127.0.0.1:8000`

## Deployment

### Frontend

- Platform: Vercel
- Live app: https://frontend-five-green-68.vercel.app
- The deployed app is self-contained and fetches BMRS data through the Next.js server route.

### Backend

- Recommended target: Render, Railway, or Heroku-style Python hosting
- Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

The standalone FastAPI backend remains in the repo for local development and analysis workflows.

## Notebooks

- `notebooks/forecast_error_analysis.ipynb`
- `notebooks/reliable_wind_supply.ipynb`

## AI usage

AI tooling was used for implementation assistance. The analytical notebooks are structured to make the reasoning, assumptions, and calculations explicit rather than opaque.
