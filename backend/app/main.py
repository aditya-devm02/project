from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

UTC = timezone.utc
BMRS_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
JANUARY_START = datetime(2024, 1, 1, 0, 0, tzinfo=UTC)
JANUARY_END = datetime(2024, 2, 1, 0, 0, tzinfo=UTC)
FORECAST_FETCH_START = JANUARY_START - timedelta(hours=48)
ACTUAL_SETTLEMENT_START = "2024-01-01"
ACTUAL_SETTLEMENT_END = "2024-01-31"


def parse_utc_datetime(value: str) -> datetime:
  return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def percentile(sorted_values: list[float], proportion: float) -> float | None:
  if not sorted_values:
    return None

  if len(sorted_values) == 1:
    return sorted_values[0]

  index = proportion * (len(sorted_values) - 1)
  lower = int(index)
  upper = min(lower + 1, len(sorted_values) - 1)
  weight = index - lower
  return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


class WindPoint(BaseModel):
  startTime: datetime
  actualGeneration: float | None
  forecastGeneration: float | None
  forecastPublishTime: datetime | None
  effectiveHorizonHours: float | None
  absoluteError: float | None


class WindSummary(BaseModel):
  pointCount: int
  forecastPointCount: int
  meanAbsoluteError: float | None
  medianAbsoluteError: float | None
  p99AbsoluteError: float | None


class WindMonitoringResponse(BaseModel):
  requestedStartTime: datetime
  requestedEndTime: datetime
  clampedStartTime: datetime
  clampedEndTime: datetime
  horizonHours: int = Field(ge=0, le=48)
  points: list[WindPoint]
  summary: WindSummary


@dataclass(frozen=True)
class ActualRecord:
  start_time: datetime
  generation: float


@dataclass(frozen=True)
class ForecastRecord:
  start_time: datetime
  publish_time: datetime
  generation: float


class JanuaryWindRepository:
  def __init__(self) -> None:
    self._actuals_cache: list[ActualRecord] | None = None
    self._forecasts_cache: list[ForecastRecord] | None = None

  async def actuals(self) -> list[ActualRecord]:
    if self._actuals_cache is None:
      payload = await fetch_json(
        "/datasets/FUELHH/stream",
        {
          "format": "json",
          "settlementDateFrom": ACTUAL_SETTLEMENT_START,
          "settlementDateTo": ACTUAL_SETTLEMENT_END,
          "fuelType": "WIND",
        },
      )
      self._actuals_cache = [
        ActualRecord(
          start_time=parse_utc_datetime(item["startTime"]),
          generation=float(item["generation"]),
        )
        for item in payload
        if item.get("fuelType") == "WIND"
      ]
      self._actuals_cache.sort(key=lambda item: item.start_time)

    return self._actuals_cache

  async def forecasts(self) -> list[ForecastRecord]:
    if self._forecasts_cache is None:
      payload = await fetch_json(
        "/datasets/WINDFOR/stream",
        {
          "format": "json",
          "publishDateTimeFrom": FORECAST_FETCH_START.isoformat().replace("+00:00", "Z"),
          "publishDateTimeTo": (JANUARY_END - timedelta(minutes=1))
          .isoformat()
          .replace("+00:00", "Z"),
        },
      )
      self._forecasts_cache = []
      for item in payload:
        start_time = parse_utc_datetime(item["startTime"])
        publish_time = parse_utc_datetime(item["publishTime"])
        horizon_hours = (start_time - publish_time).total_seconds() / 3600

        if not 0 <= horizon_hours <= 48:
          continue

        self._forecasts_cache.append(
          ForecastRecord(
            start_time=start_time,
            publish_time=publish_time,
            generation=float(item["generation"]),
          )
        )

      self._forecasts_cache.sort(key=lambda item: (item.start_time, item.publish_time))

    return self._forecasts_cache


async def fetch_json(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
  async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
    response = await client.get(f"{BMRS_BASE_URL}{path}", params=params)
    response.raise_for_status()
    payload = response.json()

  if isinstance(payload, dict) and "data" in payload:
    payload = payload["data"]

  if not isinstance(payload, list):
    raise HTTPException(status_code=502, detail="Unexpected BMRS payload shape")

  return payload


repository = JanuaryWindRepository()

app = FastAPI(title="Wind Forecast Monitor API")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
  return {"status": "ok"}


def clamp_range(start_time: datetime, end_time: datetime) -> tuple[datetime, datetime]:
  bounded_start = max(start_time, JANUARY_START)
  bounded_end = min(end_time, JANUARY_END - timedelta(minutes=30))
  if bounded_start > bounded_end:
    raise HTTPException(status_code=400, detail="Selected range does not overlap January 2024.")
  return bounded_start, bounded_end


def index_forecasts(records: Iterable[ForecastRecord]) -> dict[datetime, list[ForecastRecord]]:
  indexed: dict[datetime, list[ForecastRecord]] = {}
  for record in records:
    indexed.setdefault(record.start_time, []).append(record)
  return indexed


@app.get("/api/wind-monitoring", response_model=WindMonitoringResponse)
async def wind_monitoring(
  start_time: datetime = Query(..., alias="start_time"),
  end_time: datetime = Query(..., alias="end_time"),
  horizon_hours: int = Query(4, ge=0, le=48),
) -> WindMonitoringResponse:
  start_time = start_time.astimezone(UTC)
  end_time = end_time.astimezone(UTC)

  if start_time > end_time:
    raise HTTPException(status_code=400, detail="start_time must be before end_time.")

  clamped_start, clamped_end = clamp_range(start_time, end_time)

  actual_records = await repository.actuals()
  forecast_records = await repository.forecasts()
  forecasts_by_target = index_forecasts(forecast_records)

  points: list[WindPoint] = []
  errors: list[float] = []

  for actual in actual_records:
    if not clamped_start <= actual.start_time <= clamped_end:
      continue

    cutoff = actual.start_time - timedelta(hours=horizon_hours)
    eligible_forecasts = [
      forecast
      for forecast in forecasts_by_target.get(actual.start_time, [])
      if forecast.publish_time <= cutoff
    ]
    selected_forecast = eligible_forecasts[-1] if eligible_forecasts else None

    forecast_generation = selected_forecast.generation if selected_forecast else None
    absolute_error = (
      abs(actual.generation - forecast_generation)
      if forecast_generation is not None
      else None
    )

    if absolute_error is not None:
      errors.append(absolute_error)

    points.append(
      WindPoint(
        startTime=actual.start_time,
        actualGeneration=actual.generation,
        forecastGeneration=forecast_generation,
        forecastPublishTime=selected_forecast.publish_time if selected_forecast else None,
        effectiveHorizonHours=(
          (actual.start_time - selected_forecast.publish_time).total_seconds() / 3600
          if selected_forecast
          else None
        ),
        absoluteError=absolute_error,
      )
    )

  sorted_errors = sorted(errors)
  mean_absolute_error = sum(sorted_errors) / len(sorted_errors) if sorted_errors else None

  return WindMonitoringResponse(
    requestedStartTime=start_time,
    requestedEndTime=end_time,
    clampedStartTime=clamped_start,
    clampedEndTime=clamped_end,
    horizonHours=horizon_hours,
    points=points,
    summary=WindSummary(
      pointCount=len(points),
      forecastPointCount=len(sorted_errors),
      meanAbsoluteError=mean_absolute_error,
      medianAbsoluteError=median(sorted_errors) if sorted_errors else None,
      p99AbsoluteError=percentile(sorted_errors, 0.99),
    ),
  )
