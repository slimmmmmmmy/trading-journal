import { biasTypes, sessions } from "./constants";
import type { Trade } from "./types";

export interface GroupStat {
  key: string;
  count: number;
  winRate: number;
  avgR: number;
  totalR: number;
}

export interface JournalStats {
  totalTrades: number;
  totalR: number;
  winRate: number;
  avgR: number;
  maxLossR: number;
  inSystemR: number;
  outSystemR: number;
  highEmotionR: number;
  todayTrades: number;
  weekTrades: number;
  monthTrades: number;
  systemGroups: GroupStat[];
  sessionGroups: GroupStat[];
  strategyGroups: GroupStat[];
  biasGroups: GroupStat[];
  emotionGroups: GroupStat[];
  cumulative: Array<{ date: string; r: number }>;
}

function round(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function groupTrades(trades: Trade[], keys: string[], getKey: (trade: Trade) => string): GroupStat[] {
  const map = new Map<string, Trade[]>();
  for (const key of keys) map.set(key, []);

  for (const trade of trades) {
    const key = getKey(trade) || "未填写";
    const list = map.get(key) ?? [];
    list.push(trade);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, rows]) => {
      const totalR = rows.reduce((sum, trade) => sum + trade.rMultiple, 0);
      return {
        key,
        count: rows.length,
        winRate: rows.length ? rows.filter((trade) => trade.rMultiple > 0).length / rows.length : 0,
        avgR: rows.length ? round(totalR / rows.length) : 0,
        totalR: round(totalR),
      };
    })
    .filter((group) => group.count > 0 || keys.includes(group.key))
    .sort((a, b) => {
      if (keys.includes(a.key) && keys.includes(b.key)) return keys.indexOf(a.key) - keys.indexOf(b.key);
      return b.totalR - a.totalR;
    });
}

export function computeStats(trades: Trade[]): JournalStats {
  const now = new Date();
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const month = startOfMonth(now);
  const totalR = trades.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const totalTrades = trades.length;
  const sortedAsc = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  let runningR = 0;
  const cumulative = sortedAsc.map((trade) => {
    runningR += trade.rMultiple;
    return { date: trade.date, r: round(runningR) };
  });

  return {
    totalTrades,
    totalR: round(totalR),
    winRate: totalTrades ? trades.filter((trade) => trade.rMultiple > 0).length / totalTrades : 0,
    avgR: totalTrades ? round(totalR / totalTrades) : 0,
    maxLossR: totalTrades ? round(Math.min(...trades.map((trade) => trade.rMultiple))) : 0,
    inSystemR: round(trades.filter((trade) => trade.inSystem).reduce((sum, trade) => sum + trade.rMultiple, 0)),
    outSystemR: round(trades.filter((trade) => !trade.inSystem).reduce((sum, trade) => sum + trade.rMultiple, 0)),
    highEmotionR: round(
      trades.filter((trade) => trade.emotionScore >= 4).reduce((sum, trade) => sum + trade.rMultiple, 0),
    ),
    todayTrades: trades.filter((trade) => new Date(trade.date) >= today).length,
    weekTrades: trades.filter((trade) => new Date(trade.date) >= week).length,
    monthTrades: trades.filter((trade) => new Date(trade.date) >= month).length,
    systemGroups: groupTrades(trades, ["系统内", "系统外"], (trade) => (trade.inSystem ? "系统内" : "系统外")),
    sessionGroups: groupTrades(trades, sessions, (trade) => trade.session),
    strategyGroups: groupTrades(trades, [], (trade) => trade.strategy || "未填写"),
    biasGroups: groupTrades(trades, biasTypes, (trade) => trade.biasType || "无").sort(
      (a, b) => a.totalR - b.totalR,
    ),
    emotionGroups: groupTrades(trades, ["1", "2", "3", "4", "5"], (trade) => String(trade.emotionScore)),
    cumulative,
  };
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatR(value: number): string {
  const fixed = round(value).toFixed(2);
  return `${value > 0 ? "+" : ""}${fixed}R`;
}
