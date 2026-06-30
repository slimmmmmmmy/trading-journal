export type Direction = "多" | "空";

export type Session = "9:00" | "13:30" | "21:30" | "亚洲盘" | "欧盘" | "美盘" | "其他";

export type TradeResult = "盈利" | "亏损" | "保本";

export type ImageRole = "进场前" | "持仓中" | "出场后" | "复盘标注图" | "其他";

export type BiasType =
  | "无"
  | "不认错"
  | "扫损后反手"
  | "错过后追单"
  | "盈利回吐不甘心"
  | "强行抓反转"
  | "非要证明方向对"
  | "计划外交易"
  | "报复交易"
  | "移动止损"
  | "提前止盈"
  | "其他";

export interface TradeImage {
  id: string;
  name: string;
  type: string;
  size?: number;
  compressedSize?: number;
  imageRole: ImageRole;
  dataUrl?: string;
  objectKey?: string;
  url?: string;
  createdAt: string;
}

export interface Trade {
  id: string;
  createdAt: string;
  updatedAt: string;
  date: string;
  symbol: string;
  direction: Direction;
  session: Session;
  strategy: string;
  inSystem: boolean;
  result: TradeResult;
  entry?: number;
  stop?: number;
  target?: number;
  exit?: number;
  size?: string;
  pnl?: number;
  rMultiple: number;
  emotionScore: number;
  biasScore: number;
  executionScore: number;
  biasType: BiasType | string;
  entryReason?: string;
  marketContext?: string;
  emotionNote?: string;
  summary?: string;
  notes?: string;
  nextRule?: string;
  images: TradeImage[];
}

export interface BackupFile {
  version: number;
  type: "full" | "light";
  exportedAt: string;
  trades: Trade[];
}

export interface BackupMeta {
  lastBackupAt?: string;
  tradeCountAtLastBackup?: number;
}

export type TabKey = "stats" | "trades" | "editor" | "backup";
