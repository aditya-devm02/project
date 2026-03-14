const BMRS_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1";
const JANUARY_START = new Date("2024-01-01T00:00:00Z");
const JANUARY_END = new Date("2024-02-01T00:00:00Z");
const FORECAST_FETCH_START = new Date("2023-12-30T00:00:00Z");

type ActualRecord = {
  startTime: Date;
  generation: number;
};

type ForecastRecord = {
  startTime: Date;
  publishTime: Date;
  generation: number;
};

export type WindMonitoringResponse = {
  requestedStartTime: string;
  requestedEndTime: string;
  clampedStartTime: string;
  clampedEndTime: string;
  horizonHours: number;
  points: Array<{
    startTime: string;
    actualGeneration: number | null;
    forecastGeneration: number | null;
    forecastPublishTime: string | null;
    effectiveHorizonHours: number | null;
    absoluteError: number | null;
  }>;
  summary: {
    pointCount: number;
    forecastPointCount: number;
    meanAbsoluteError: number | null;
    medianAbsoluteError: number | null;
    p99AbsoluteError: number | null;
  };
};

function percentile(sortedValues: number[], proportion: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = proportion * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.min(lower + 1, sortedValues.length - 1);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid];
}

function clampRange(startTime: Date, endTime: Date): [Date, Date] {
  const clampedStart = new Date(
    Math.max(startTime.getTime(), JANUARY_START.getTime())
  );
  const clampedEnd = new Date(
    Math.min(endTime.getTime(), JANUARY_END.getTime() - 30 * 60 * 1000)
  );

  if (clampedStart > clampedEnd) {
    throw new Error("Selected range does not overlap January 2024.");
  }

  return [clampedStart, clampedEnd];
}

async function fetchJson(
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>[]> {
  const search = new URLSearchParams({ format: "json", ...params });
  const response = await fetch(`${BMRS_BASE_URL}${path}?${search.toString()}`, {
    cache: "force-cache"
  });

  if (!response.ok) {
    throw new Error(`BMRS request failed with ${response.status}`);
  }

  const payload = (await response.json()) as
    | Record<string, unknown>[]
    | { data?: Record<string, unknown>[] };

  return Array.isArray(payload) ? payload : payload.data ?? [];
}

async function fetchActuals(): Promise<ActualRecord[]> {
  const payload = await fetchJson("/datasets/FUELHH/stream", {
    settlementDateFrom: "2024-01-01",
    settlementDateTo: "2024-01-31",
    fuelType: "WIND"
  });

  return payload
    .filter((item) => item.fuelType === "WIND")
    .map((item) => ({
      startTime: new Date(String(item.startTime)),
      generation: Number(item.generation)
    }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

async function fetchForecasts(): Promise<ForecastRecord[]> {
  const payload = await fetchJson("/datasets/WINDFOR/stream", {
    publishDateTimeFrom: FORECAST_FETCH_START.toISOString(),
    publishDateTimeTo: new Date(JANUARY_END.getTime() - 60 * 1000).toISOString()
  });

  return payload
    .map((item) => {
      const startTime = new Date(String(item.startTime));
      const publishTime = new Date(String(item.publishTime));
      const horizonHours =
        (startTime.getTime() - publishTime.getTime()) / (1000 * 60 * 60);

      return {
        startTime,
        publishTime,
        generation: Number(item.generation),
        horizonHours
      };
    })
    .filter((item) => item.horizonHours >= 0 && item.horizonHours <= 48)
    .sort(
      (a, b) =>
        a.startTime.getTime() - b.startTime.getTime() ||
        a.publishTime.getTime() - b.publishTime.getTime()
    )
    .map(({ horizonHours: _ignored, ...record }) => record);
}

export async function buildWindMonitoringResponse(params: {
  startTime: string;
  endTime: string;
  horizonHours: number;
}): Promise<WindMonitoringResponse> {
  const requestedStartTime = new Date(params.startTime);
  const requestedEndTime = new Date(params.endTime);

  if (Number.isNaN(requestedStartTime.getTime()) || Number.isNaN(requestedEndTime.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (requestedStartTime > requestedEndTime) {
    throw new Error("start_time must be before end_time.");
  }

  const [clampedStartTime, clampedEndTime] = clampRange(
    requestedStartTime,
    requestedEndTime
  );

  const [actuals, forecasts] = await Promise.all([fetchActuals(), fetchForecasts()]);

  const forecastsByTarget = new Map<number, ForecastRecord[]>();
  for (const forecast of forecasts) {
    const key = forecast.startTime.getTime();
    const existing = forecastsByTarget.get(key);
    if (existing) {
      existing.push(forecast);
    } else {
      forecastsByTarget.set(key, [forecast]);
    }
  }

  const errors: number[] = [];
  const points = actuals
    .filter(
      (actual) =>
        actual.startTime >= clampedStartTime && actual.startTime <= clampedEndTime
    )
    .map((actual) => {
      const cutoff = new Date(
        actual.startTime.getTime() - params.horizonHours * 60 * 60 * 1000
      );
      const eligible =
        forecastsByTarget
          .get(actual.startTime.getTime())
          ?.filter((forecast) => forecast.publishTime <= cutoff) ?? [];
      const selected = eligible.at(-1) ?? null;
      const absoluteError =
        selected === null
          ? null
          : Math.abs(actual.generation - selected.generation);

      if (absoluteError !== null) {
        errors.push(absoluteError);
      }

      return {
        startTime: actual.startTime.toISOString(),
        actualGeneration: actual.generation,
        forecastGeneration: selected?.generation ?? null,
        forecastPublishTime: selected?.publishTime.toISOString() ?? null,
        effectiveHorizonHours:
          selected === null
            ? null
            : (actual.startTime.getTime() - selected.publishTime.getTime()) /
              (1000 * 60 * 60),
        absoluteError
      };
    });

  const sortedErrors = [...errors].sort((a, b) => a - b);
  const meanAbsoluteError =
    sortedErrors.length === 0
      ? null
      : sortedErrors.reduce((sum, value) => sum + value, 0) / sortedErrors.length;

  return {
    requestedStartTime: requestedStartTime.toISOString(),
    requestedEndTime: requestedEndTime.toISOString(),
    clampedStartTime: clampedStartTime.toISOString(),
    clampedEndTime: clampedEndTime.toISOString(),
    horizonHours: params.horizonHours,
    points,
    summary: {
      pointCount: points.length,
      forecastPointCount: sortedErrors.length,
      meanAbsoluteError,
      medianAbsoluteError: median(sortedErrors),
      p99AbsoluteError: percentile(sortedErrors, 0.99)
    }
  };
}
