export type WindPoint = {
  startTime: string;
  actualGeneration: number | null;
  forecastGeneration: number | null;
  forecastPublishTime: string | null;
  effectiveHorizonHours: number | null;
  absoluteError: number | null;
};

export type WindMonitoringResponse = {
  requestedStartTime: string;
  requestedEndTime: string;
  clampedStartTime: string;
  clampedEndTime: string;
  horizonHours: number;
  points: WindPoint[];
  summary: {
    pointCount: number;
    forecastPointCount: number;
    meanAbsoluteError: number | null;
    medianAbsoluteError: number | null;
    p99AbsoluteError: number | null;
  };
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function fetchWindMonitoring(params: {
  startTime: string;
  endTime: string;
  horizonHours: number;
}): Promise<WindMonitoringResponse> {
  const search = new URLSearchParams({
    start_time: params.startTime,
    end_time: params.endTime,
    horizon_hours: String(params.horizonHours)
  });

  const response = await fetch(
    `${apiBaseUrl}/api/wind-monitoring?${search.toString()}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Backend request failed with ${response.status}`);
  }

  return (await response.json()) as WindMonitoringResponse;
}

