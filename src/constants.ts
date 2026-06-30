import type { BiasType, Direction, ImageRole, Session, TradeResult } from "./types";

export const sessions: Session[] = ["9:00", "13:30", "21:30", "亚洲盘", "欧盘", "美盘", "其他"];

export const directions: Direction[] = ["多", "空"];

export const tradeResults: TradeResult[] = ["盈利", "亏损", "保本"];

export const imageRoles: ImageRole[] = ["进场前", "持仓中", "出场后", "复盘标注图", "其他"];

export const biasTypes: BiasType[] = [
  "无",
  "不认错",
  "扫损后反手",
  "错过后追单",
  "盈利回吐不甘心",
  "强行抓反转",
  "非要证明方向对",
  "计划外交易",
  "报复交易",
  "移动止损",
  "提前止盈",
  "其他",
];

export const defaultStrategies = ["突破", "回踩", "反转", "区间", "消息面", "其他"];
