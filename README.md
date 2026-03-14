# UK Wind Forecast Monitor

This repository implements the REint full stack challenge using:

- `frontend/`: Next.js + React charting UI
- `backend/`: FastAPI service that fetches live BMRS data and applies the horizon logic
- `notebooks/`: Jupyter notebooks for forecast-error analysis and reliable wind-supply analysis

## What the app does

- Pulls actual generation from `FUELHH` filtered to `fuelType=WIND`
- Pulls forecast publishes from `WINDFOR`
- Restricts all analysis to January 2024
- Selects the latest forecast where `publishTime <= targetTime - horizon`
- Aligns actual and forecast data on `startTime`
- Exposes the merged series through FastAPI
- Renders a responsive line chart in Next.js

## Local setup

### Backend

```bash
cd /Users/adityakumarsingh/Documents/project/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend default URL: `http://127.0.0.1:8000`

### Frontend

```bash
cd /Users/adityakumarsingh/Documents/project/frontend
npm install
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Frontend default URL: `http://127.0.0.1:3000`

## Deployment

### Frontend

- Recommended target: Vercel
- Set `NEXT_PUBLIC_API_BASE_URL` to your deployed backend URL

### Backend

- Recommended target: Render, Railway, or Heroku-style Python hosting
- Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

I could not complete a real Vercel/Heroku deployment from this workspace because deployment credentials are not available here. The codebase is prepared for deployment and verified locally against the live BMRS API.

## Notebooks

- `notebooks/forecast_error_analysis.ipynb`
- `notebooks/reliable_wind_supply.ipynb`

## AI usage

AI tooling was used for implementation assistance. The analytical notebooks are structured to make the reasoning, assumptions, and calculations explicit rather than opaque.
