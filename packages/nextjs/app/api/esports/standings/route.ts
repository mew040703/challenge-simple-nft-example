import { NextResponse } from "next/server";
import { getLeagueLatestStandings } from "~~/utils/esports";

// GET /api/esports/standings?league=LCK
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const league = (searchParams.get("league") || "LCK").toUpperCase();
    const data = await getLeagueLatestStandings(league);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 min