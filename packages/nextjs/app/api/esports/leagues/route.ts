import { NextResponse } from "next/server";
import { getLeaguesWithTeams } from "~~/utils/esports";

// GET /api/esports/leagues
export async function GET() {
  try {
    // Focus on major leagues; can expand via query later
    const target = ["LCK", "LPL", "LEC", "LCS", "PCS", "VCS", "LJL", "CBLOL", "LLA"];
    const data = await getLeaguesWithTeams(target);
    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic"; // avoid static
export const revalidate = 3600; // 1 hour cache