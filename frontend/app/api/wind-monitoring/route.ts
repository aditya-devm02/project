import { NextRequest, NextResponse } from "next/server";

import { buildWindMonitoringResponse } from "../../../lib/wind-monitoring";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startTime = searchParams.get("start_time");
  const endTime = searchParams.get("end_time");
  const horizonParam = searchParams.get("horizon_hours") ?? "4";
  const horizonHours = Number(horizonParam);

  if (!startTime || !endTime || Number.isNaN(horizonHours)) {
    return NextResponse.json(
      { detail: "Missing or invalid query parameters." },
      { status: 400 }
    );
  }

  try {
    const payload = await buildWindMonitoringResponse({
      startTime,
      endTime,
      horizonHours
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ detail: message }, { status: 400 });
  }
}
