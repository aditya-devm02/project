"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { fetchWindMonitoring, type WindMonitoringResponse } from "../lib/api";

const JANUARY_MIN = "2024-01-01T00:00";
const JANUARY_MAX = "2024-01-31T23:30";

const defaultStartTime = "2024-01-10T00:00";
const defaultEndTime = "2024-01-14T23:30";

function toUtcIso(localValue: string): string {
  return `${localValue}:00Z`;
}

function formatUtcLabel(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value).toLocaleString()} MW`;
}

export function MonitoringDashboard() {
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [horizonHours, setHorizonHours] = useState(4);
  const [data, setData] = useState<WindMonitoringResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchWindMonitoring({
          startTime: toUtcIso(startTime),
          endTime: toUtcIso(endTime),
          horizonHours
        });

        if (active) {
          setData(response);
        }
      } catch (requestError) {
        if (active) {
          const message =
            requestError instanceof Error
              ? requestError.message
              : "Unexpected frontend error";
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [endTime, horizonHours, startTime]);

  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((point) => ({
        timeLabel: formatUtcLabel(point.startTime),
        actualGeneration: point.actualGeneration,
        forecastGeneration: point.forecastGeneration,
        forecastPublishTime: point.forecastPublishTime
          ? formatUtcLabel(point.forecastPublishTime)
          : "missing"
      })),
    [data]
  );

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <h1>UK Wind Forecast Monitor</h1>
          <p className="hero-text">
            Actual wind generation from <code>FUELHH</code> is aligned against
            the latest eligible <code>WINDFOR</code> forecast where{" "}
            <code>publishTime &lt;= targetTime - horizon</code>.
          </p>
        </div>
        <div className="hero-card">
          <span>Dataset window</span>
          <strong>January 2024 only</strong>
          <small>Half-hour actuals, hourly forecast targets, horizon 0-48h</small>
        </div>
      </section>

      <section className="controls-card">
        <div className="controls-grid">
          <label className="field">
            <span>Start time</span>
            <input
              type="datetime-local"
              min={JANUARY_MIN}
              max={JANUARY_MAX}
              step={1800}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>

          <label className="field">
            <span>End time</span>
            <input
              type="datetime-local"
              min={JANUARY_MIN}
              max={JANUARY_MAX}
              step={1800}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>

          <label className="field slider-field">
            <span>Forecast horizon: {horizonHours}h</span>
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={horizonHours}
              onChange={(event) => setHorizonHours(Number(event.target.value))}
            />
          </label>
        </div>
        <p className="controls-note">
          Inputs are interpreted as UTC to match BMRS timestamps and the
          challenge examples.
        </p>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Displayed points</span>
          <strong>{data?.summary.pointCount ?? "..."}</strong>
        </article>
        <article className="metric-card">
          <span>Forecast matches</span>
          <strong>{data?.summary.forecastPointCount ?? "..."}</strong>
        </article>
        <article className="metric-card">
          <span>Mean absolute error</span>
          <strong>{formatMetric(data?.summary.meanAbsoluteError ?? null)}</strong>
        </article>
        <article className="metric-card">
          <span>Median absolute error</span>
          <strong>{formatMetric(data?.summary.medianAbsoluteError ?? null)}</strong>
        </article>
      </section>

      <section className="chart-card">
        <div className="section-header">
          <div>
            <h2>Actual vs forecast generation</h2>
            <p>
              Forecast values are omitted when no eligible publish exists for the
              selected horizon.
            </p>
          </div>
          <div className="status-chip">
            {loading ? "Loading live BMRS data" : "Live BMRS"}
          </div>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
        {!error && data?.summary.forecastPointCount === 0 ? (
          <p className="warning-banner">
            No eligible forecast points were found for this time range and
            horizon. At large horizons such as 48h, BMRS may not have a publish
            early enough to satisfy <code>publishTime &lt;= targetTime -
            horizon</code>.
          </p>
        ) : null}

        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6deeb" />
              <XAxis
                dataKey="timeLabel"
                minTickGap={28}
                tick={{ fill: "#3c4b61", fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: "#3c4b61", fontSize: 12 }}
                width={72}
                tickFormatter={(value) => `${Math.round(value / 1000)}k`}
              />
              <Tooltip
                formatter={(value) =>
                  typeof value === "number"
                    ? `${Math.round(value).toLocaleString()} MW`
                    : "missing"
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="actualGeneration"
                name="Actual generation"
                stroke="#1e63ff"
                strokeWidth={3}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="forecastGeneration"
                name="Forecast generation"
                stroke="#1d9d74"
                strokeWidth={3}
                dot={{ r: 2, strokeWidth: 0, fill: "#1d9d74" }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
