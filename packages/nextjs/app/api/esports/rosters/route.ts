import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import * as mammoth from "mammoth";
import * as cheerio from "cheerio";
import { getLeagueRosters, getLeaguesWithTeams } from "~~/utils/esports";

// GET /api/esports/rosters?league=LCK
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const league = (searchParams.get("league") || "LCK").toUpperCase();
    const docPath = path.join(process.cwd(), "public", "2025年英雄联盟各赛区战队阵容详表.docx");

    let leagueInfo = { key: league, label: league };
    let rostersByTeam: Record<string, { role: "上" | "野" | "中" | "下" | "辅"; player: string }[]> = {};
    let subsByTeam: Record<string, string[]> = {};

    if (fs.existsSync(docPath)) {
      try {
        const { value: html } = await mammoth.convertToHtml({ path: docPath });
        const $ = cheerio.load(html);
        const leagues = await getLeaguesWithTeams([league]);
        const leagueEntry = leagues[0];
        if (leagueEntry) {
          leagueInfo = { key: leagueEntry.key, label: leagueEntry.label };
          const teamsByName = new Map(leagueEntry.teams.map(t => [t.name.toLowerCase(), t]));
          const teamNamesSet = new Set(leagueEntry.teams.map(t => t.name.toLowerCase()));

          $("table").each((_, table) => {
            const headers = $(table)
              .find("tr")
              .first()
              .find("td,th")
              .map((_, cell) => $(cell).text().trim())
              .get();

            const idxTeam = headers.findIndex(h => /队|战队|team/i.test(h));
            const idxTop = headers.findIndex(h => /(上|上单|top)/i.test(h));
            const idxJg = headers.findIndex(h => /(野|打野|jungle)/i.test(h));
            const idxMid = headers.findIndex(h => /(中|中单|mid)/i.test(h));
            const idxBot = headers.findIndex(h => /(下|adc|bottom|bot)/i.test(h));
            const idxSup = headers.findIndex(h => /(辅|辅助|support)/i.test(h));
            const idxSubs = headers.findIndex(h => /(替补|subs|substitutes)/i.test(h));

            const valid = idxTeam >= 0 && idxTop >= 0 && idxJg >= 0 && idxMid >= 0 && idxBot >= 0 && idxSup >= 0;
            if (!valid) return;

            $(table)
              .find("tr")
              .slice(1)
              .each((__, row) => {
                const cells = $(row).find("td,th");
                const teamNameRaw = cells.eq(idxTeam).text().trim();
                const teamName = teamNameRaw.toLowerCase();
                if (!teamName || !teamNamesSet.has(teamName)) return;
                const tInfo = teamsByName.get(teamName);
                const slug = (tInfo?.logoSlug || tInfo?.name) ? (tInfo?.logoSlug || tInfo!.name) : teamName;

                function pick(idx: number) {
                  return idx >= 0 ? cells.eq(idx).text().trim() : "";
                }

                const top = pick(idxTop);
                const jg = pick(idxJg);
                const mid = pick(idxMid);
                const adc = pick(idxBot);
                const sup = pick(idxSup);
                const roster: { role: "上" | "野" | "中" | "下" | "辅"; player: string }[] = [];
                if (top) roster.push({ role: "上", player: top });
                if (jg) roster.push({ role: "野", player: jg });
                if (mid) roster.push({ role: "中", player: mid });
                if (adc) roster.push({ role: "下", player: adc });
                if (sup) roster.push({ role: "辅", player: sup });

                const subsText = idxSubs >= 0 ? cells.eq(idxSubs).text().trim() : "";
                const subs = subsText ? subsText.split(/[、，,]/).map(s => s.trim()).filter(Boolean) : [];

                if (roster.length > 0) rostersByTeam[slug] = roster;
                if (subs.length > 0) subsByTeam[slug] = subs;
              });
          });
        }
      } catch (err) {
        // 如果 Word 解析失败，继续走远端接口回退
        console.warn("parse docx rosters failed", err);
      }
    }

    // 如果没有从 Word 中解析到阵容，使用 LoLEsports 接口回退
    if (Object.keys(rostersByTeam).length === 0) {
      const fallback = await getLeagueRosters(league);
      leagueInfo = fallback.league || leagueInfo;
      rostersByTeam = fallback.rostersByTeam || {};
    }

    return NextResponse.json({ data: { league: leagueInfo, rostersByTeam, subsByTeam } }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 min