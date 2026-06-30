import type { BackupFile, Trade } from "./types";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function todayStamp(): string {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function stripImages(trade: Trade): Trade {
  return {
    ...trade,
    images: trade.images.map(({ dataUrl: _dataUrl, ...image }) => ({
      ...image,
      objectKey: image.objectKey,
      url: image.url,
    })),
  };
}

export function createBackup(trades: Trade[], type: "full" | "light"): BackupFile {
  return {
    version: 1,
    type,
    exportedAt: new Date().toISOString(),
    trades: type === "full" ? trades : trades.map(stripImages),
  };
}

export function exportJsonBackup(trades: Trade[], type: "full" | "light"): void {
  const backup = createBackup(trades, type);
  const filename =
    type === "full"
      ? `trading-journal-full-backup-${todayStamp()}.json`
      : `trading-journal-light-backup-${todayStamp()}.json`;
  downloadFile(filename, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function exportCsv(trades: Trade[]): void {
  const fields: Array<keyof Trade> = [
    "date",
    "symbol",
    "direction",
    "session",
    "strategy",
    "inSystem",
    "result",
    "pnl",
    "entry",
    "stop",
    "target",
    "exit",
    "size",
    "rMultiple",
    "emotionScore",
    "biasScore",
    "executionScore",
    "biasType",
    "summary",
    "notes",
  ];

  const rows = [
    fields.join(","),
    ...trades.map((trade) => fields.map((field) => csvCell(trade[field])).join(",")),
  ];

  downloadFile(`trading-journal-${todayStamp()}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
}

export function tradeToMarkdown(trade: Trade): string {
  const titleDate = trade.date ? trade.date.slice(0, 10) : "未填写日期";
  const imageList = trade.images.length
    ? trade.images
        .map((image) => `- ${image.imageRole}：${image.name}${image.url ? ` (${image.url})` : ""}`)
        .join("\n")
    : "- 无";

  return `# ${titleDate} ${trade.symbol} ${trade.direction}单

## 基础信息
- 日期：${trade.date}
- 品种：${trade.symbol}
- 方向：${trade.direction}
- 时段：${trade.session}
- 策略：${trade.strategy || ""}
- 系统内交易：${trade.inSystem ? "是" : "否"}
- 结果：${trade.result}
- R 倍数：${trade.rMultiple}

## 交易理由
${trade.entryReason || ""}

## 情绪与执行
- 情绪评分：${trade.emotionScore}
- 偏执评分：${trade.biasScore}
- 执行评分：${trade.executionScore}
- 偏执类型：${trade.biasType}

## 复盘结论
${trade.summary || ""}

${trade.notes || ""}

## 下次同类场景处理规则
${trade.nextRule || ""}

## 截图
${imageList}
`;
}

export function exportTradeMarkdown(trade: Trade): void {
  const date = trade.date ? trade.date.slice(0, 10) : todayStamp();
  downloadFile(`${date}-${trade.symbol}-${trade.direction}单.md`, tradeToMarkdown(trade), "text/markdown;charset=utf-8");
}

export function exportDailyMarkdown(trades: Trade[], date: string): void {
  const dailyTrades = trades.filter((trade) => trade.date.startsWith(date));
  const body = dailyTrades.length
    ? dailyTrades.map(tradeToMarkdown).join("\n\n---\n\n")
    : `# ${date} 每日复盘\n\n当日没有交易记录。\n`;

  downloadFile(`trading-journal-${date}.md`, body, "text/markdown;charset=utf-8");
}

export function parseBackupJson(text: string): BackupFile {
  const parsed = JSON.parse(text) as BackupFile;
  if (!parsed || !Array.isArray(parsed.trades) || (parsed.type !== "full" && parsed.type !== "light")) {
    throw new Error("不是有效的交易复盘备份文件");
  }
  return parsed;
}
