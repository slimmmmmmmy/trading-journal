import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { biasTypes, defaultStrategies, directions, imageRoles, sessions, tradeResults } from "./constants";
import { exportCsv, exportDailyMarkdown, exportJsonBackup, exportTradeMarkdown, parseBackupJson } from "./exporters";
import { compressImage, createId } from "./image";
import { computeStats, formatPercent, formatR, type GroupStat, type JournalStats } from "./stats";
import {
  clearTrades,
  deleteTrade,
  getBackupMeta,
  getTrades,
  importTrades,
  saveBackupMeta,
  saveTrade,
} from "./storage";
import type { BackupMeta, ImageRole, TabKey, Trade } from "./types";

type Filters = {
  symbol: string;
  direction: string;
  session: string;
  inSystem: string;
  result: string;
  emotionMin: string;
  emotionMax: string;
  biasType: string;
  strategy: string;
  dateFrom: string;
  dateTo: string;
  keyword: string;
};

const emptyFilters: Filters = {
  symbol: "",
  direction: "",
  session: "",
  inSystem: "",
  result: "",
  emotionMin: "",
  emotionMax: "",
  biasType: "",
  strategy: "",
  dateFrom: "",
  dateTo: "",
  keyword: "",
};

function toLocalInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function createEmptyTrade(): Trade {
  const now = new Date().toISOString();
  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    date: toLocalInputValue(),
    symbol: "XAUUSD",
    direction: "多",
    session: "21:30",
    strategy: "",
    inSystem: true,
    result: "保本",
    rMultiple: 0,
    emotionScore: 3,
    biasScore: 1,
    executionScore: 3,
    biasType: "无",
    images: [],
  };
}

function parseNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function calculateR(trade: Trade): number | null {
  if (trade.entry === undefined || trade.stop === undefined || trade.exit === undefined) return null;
  const denominator = trade.direction === "多" ? trade.entry - trade.stop : trade.stop - trade.entry;
  if (denominator === 0) return null;
  const numerator = trade.direction === "多" ? trade.exit - trade.entry : trade.entry - trade.exit;
  return Number((numerator / denominator).toFixed(2));
}

function valueTone(value: number): string {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function daysBetween(from?: string): number | null {
  if (!from) return null;
  const diff = Date.now() - new Date(from).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function App() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [backupMeta, setBackupMeta] = useState<BackupMeta>({});
  const [tab, setTab] = useState<TabKey>("stats");
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [viewTrade, setViewTrade] = useState<Trade | null>(null);
  const [toast, setToast] = useState("");
  const stats = useMemo(() => computeStats(trades), [trades]);

  async function reload() {
    const [nextTrades, nextMeta] = await Promise.all([getTrades(), getBackupMeta()]);
    setTrades(nextTrades);
    setBackupMeta(nextMeta);
  }

  useEffect(() => {
    reload().catch(() => setToast("本地数据读取失败，请检查浏览器 IndexedDB 权限。"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function openNewTrade() {
    setEditingTrade(null);
    setEditorKey((key) => key + 1);
    setTab("editor");
  }

  function openEditTrade(trade: Trade) {
    setEditingTrade(trade);
    setEditorKey((key) => key + 1);
    setTab("editor");
  }

  function copyTrade(trade: Trade) {
    const now = new Date().toISOString();
    setEditingTrade({
      ...trade,
      id: createId(),
      createdAt: now,
      updatedAt: now,
      date: toLocalInputValue(),
      images: trade.images.map((image) => ({ ...image, id: createId(), createdAt: now })),
    });
    setEditorKey((key) => key + 1);
    setTab("editor");
  }

  async function handleSave(trade: Trade) {
    await saveTrade({ ...trade, updatedAt: new Date().toISOString() });
    await reload();
    setToast("交易已保存");
    setTab("trades");
  }

  async function handleDelete(trade: Trade) {
    if (!window.confirm(`确认删除 ${trade.date.slice(0, 10)} ${trade.symbol} 这笔交易？`)) return;
    await deleteTrade(trade.id);
    await reload();
    setViewTrade(null);
    setToast("交易已删除");
  }

  async function markBackup() {
    const meta = { lastBackupAt: new Date().toISOString(), tradeCountAtLastBackup: trades.length };
    await saveBackupMeta(meta);
    setBackupMeta(meta);
  }

  async function handleJsonExport(type: "full" | "light") {
    exportJsonBackup(trades, type);
    await markBackup();
    setToast(type === "full" ? "完整 JSON 已导出" : "轻量 JSON 已导出");
  }

  async function handleImport(file: File) {
    try {
      const backup = parseBackupJson(await file.text());
      const confirmed = window.confirm(
        `将导入 ${backup.trades.length} 笔交易。相同 id 会覆盖，新的 id 会新增。确认继续？`,
      );
      if (!confirmed) return;
      const result = await importTrades(backup.trades);
      await reload();
      setToast(`导入完成：新增 ${result.added} 笔，覆盖 ${result.updated} 笔`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "JSON 格式错误，导入失败");
    }
  }

  async function handleClear() {
    if (!window.confirm("确认清空所有本地交易数据？请先导出完整 JSON 备份。")) return;
    await clearTrades();
    await reload();
    setToast("本地交易数据已清空");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local First</p>
          <h1>交易复盘</h1>
        </div>
        <button className="primary-action" type="button" onClick={openNewTrade}>
          + 记录
        </button>
      </header>

      <main>
        {tab === "stats" && <StatsView stats={stats} trades={trades} backupMeta={backupMeta} onNewTrade={openNewTrade} />}
        {tab === "trades" && (
          <TradesView
            trades={trades}
            onView={setViewTrade}
            onEdit={openEditTrade}
            onDelete={handleDelete}
            onCopy={copyTrade}
            onNewTrade={openNewTrade}
          />
        )}
        {tab === "editor" && (
          <TradeEditor key={editorKey} initialTrade={editingTrade} onCancel={() => setTab("trades")} onSave={handleSave} />
        )}
        {tab === "backup" && (
          <BackupView
            trades={trades}
            backupMeta={backupMeta}
            onExportJson={handleJsonExport}
            onImport={handleImport}
            onClear={handleClear}
          />
        )}
      </main>

      <nav className="tabbar" aria-label="主导航">
        <TabButton active={tab === "stats"} label="统计" onClick={() => setTab("stats")} />
        <TabButton active={tab === "trades"} label="订单" onClick={() => setTab("trades")} />
        <TabButton active={tab === "editor"} label="记录" onClick={openNewTrade} />
        <TabButton active={tab === "backup"} label="备份" onClick={() => setTab("backup")} />
      </nav>

      {viewTrade && (
        <TradeDetailModal
          trade={viewTrade}
          onClose={() => setViewTrade(null)}
          onEdit={() => openEditTrade(viewTrade)}
          onDelete={() => handleDelete(viewTrade)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? "tabbar__item is-active" : "tabbar__item"} type="button" onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}

function StatsView({
  stats,
  trades,
  backupMeta,
  onNewTrade,
}: {
  stats: JournalStats;
  trades: Trade[];
  backupMeta: BackupMeta;
  onNewTrade: () => void;
}) {
  const backupDays = daysBetween(backupMeta.lastBackupAt);
  const tradesSinceBackup = trades.length - (backupMeta.tradeCountAtLastBackup ?? 0);
  const needsBackup = backupDays === null || backupDays > 7 || tradesSinceBackup > 20;

  return (
    <div className="screen-stack">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>用 R 和执行质量判断系统是否有效</h2>
          <p>数据只保存在当前浏览器 IndexedDB，不上传到服务器。</p>
        </div>
        <button className="primary-action" type="button" onClick={onNewTrade}>
          新增交易
        </button>
      </section>

      <section className="metric-grid">
        <Metric label="总交易" value={`${stats.totalTrades}`} />
        <Metric label="总 R" value={formatR(stats.totalR)} tone={valueTone(stats.totalR)} />
        <Metric label="胜率" value={formatPercent(stats.winRate)} />
        <Metric label="平均 R" value={formatR(stats.avgR)} tone={valueTone(stats.avgR)} />
        <Metric label="最大单笔亏损" value={formatR(stats.maxLossR)} tone={valueTone(stats.maxLossR)} />
        <Metric label="系统内总 R" value={formatR(stats.inSystemR)} tone={valueTone(stats.inSystemR)} />
        <Metric label="系统外总 R" value={formatR(stats.outSystemR)} tone={valueTone(stats.outSystemR)} />
        <Metric label="情绪 ≥ 4 总 R" value={formatR(stats.highEmotionR)} tone={valueTone(stats.highEmotionR)} />
        <Metric label="今日" value={`${stats.todayTrades} 笔`} />
        <Metric label="本周" value={`${stats.weekTrades} 笔`} />
        <Metric label="本月" value={`${stats.monthTrades} 笔`} />
      </section>

      <section className={needsBackup ? "notice-card is-warning" : "notice-card"}>
        <div>
          <strong>{needsBackup ? "建议导出备份" : "备份状态正常"}</strong>
          <p>
            上次备份：{backupMeta.lastBackupAt ? new Date(backupMeta.lastBackupAt).toLocaleDateString() : "暂无"}；
            {backupDays === null ? "尚未备份" : `已过去 ${backupDays} 天`}；新增 {Math.max(0, tradesSinceBackup)} 笔未备份。
          </p>
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Curve" title="累计 R 曲线" />
        <CumulativeChart points={stats.cumulative} />
      </section>

      <StatsTable title="按系统内/外统计" groups={stats.systemGroups} />
      <StatsTable title="按时段统计" groups={stats.sessionGroups} />
      <StatsTable title="按策略模型统计" groups={stats.strategyGroups} empty="暂无策略数据" />
      <StatsTable title="按偏执/错误类型统计" groups={stats.biasGroups} />
      <StatsTable title="情绪评分与盈亏关系" groups={stats.emotionGroups} />
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function CumulativeChart({ points }: { points: Array<{ date: string; r: number }> }) {
  if (points.length === 0) return <EmptyState text="还没有交易记录" />;

  const width = 560;
  const height = 180;
  const padding = 18;
  const values = points.map((point) => point.r);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((point.r - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const zeroY = height - padding - ((0 - min) / range) * (height - padding * 2);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="累计 R 曲线">
        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} className="chart-zero" />
        <polyline points={path} className="chart-line" />
      </svg>
      <div className="chart-caption">
        <span>最低 {formatR(min)}</span>
        <span>最新 {formatR(points[points.length - 1]?.r ?? 0)}</span>
        <span>最高 {formatR(max)}</span>
      </div>
    </div>
  );
}

function StatsTable({ title, groups, empty = "暂无数据" }: { title: string; groups: GroupStat[]; empty?: string }) {
  return (
    <section className="panel">
      <SectionTitle eyebrow="Table" title={title} />
      {groups.length === 0 ? (
        <EmptyState text={empty} />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>分类</th>
                <th>笔数</th>
                <th>胜率</th>
                <th>平均 R</th>
                <th>总 R</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.key}>
                  <td>{group.key}</td>
                  <td>{group.count}</td>
                  <td>{formatPercent(group.winRate)}</td>
                  <td className={valueTone(group.avgR)}>{formatR(group.avgR)}</td>
                  <td className={valueTone(group.totalR)}>{formatR(group.totalR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TradesView({
  trades,
  onView,
  onEdit,
  onDelete,
  onCopy,
  onNewTrade,
}: {
  trades: Trade[];
  onView: (trade: Trade) => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onCopy: (trade: Trade) => void;
  onNewTrade: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const strategies = useMemo(
    () => [...new Set([...defaultStrategies, ...trades.map((trade) => trade.strategy).filter(Boolean)])],
    [trades],
  );
  const symbols = useMemo(() => [...new Set(trades.map((trade) => trade.symbol).filter(Boolean))], [trades]);
  const filteredTrades = useMemo(() => filterTrades(trades, filters), [trades, filters]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="screen-stack">
      <section className="panel">
        <div className="list-head">
          <SectionTitle eyebrow="Orders" title="交易列表" />
          <button className="primary-action" type="button" onClick={onNewTrade}>
            新增
          </button>
        </div>

        <div className="filter-grid">
          <label>
            关键词
            <input value={filters.keyword} onChange={(event) => setFilter("keyword", event.target.value)} placeholder="搜索复盘、策略、品种" />
          </label>
          <label>
            品种
            <select value={filters.symbol} onChange={(event) => setFilter("symbol", event.target.value)}>
              <option value="">全部</option>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            方向
            <select value={filters.direction} onChange={(event) => setFilter("direction", event.target.value)}>
              <option value="">全部</option>
              {directions.map((direction) => (
                <option key={direction} value={direction}>
                  {direction}
                </option>
              ))}
            </select>
          </label>
          <label>
            时段
            <select value={filters.session} onChange={(event) => setFilter("session", event.target.value)}>
              <option value="">全部</option>
              {sessions.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
            </select>
          </label>
          <label>
            系统
            <select value={filters.inSystem} onChange={(event) => setFilter("inSystem", event.target.value)}>
              <option value="">全部</option>
              <option value="true">系统内</option>
              <option value="false">系统外</option>
            </select>
          </label>
          <label>
            结果
            <select value={filters.result} onChange={(event) => setFilter("result", event.target.value)}>
              <option value="">全部</option>
              {tradeResults.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </label>
          <label>
            策略
            <select value={filters.strategy} onChange={(event) => setFilter("strategy", event.target.value)}>
              <option value="">全部</option>
              {strategies.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
          <label>
            偏执类型
            <select value={filters.biasType} onChange={(event) => setFilter("biasType", event.target.value)}>
              <option value="">全部</option>
              {biasTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            情绪最低
            <select value={filters.emotionMin} onChange={(event) => setFilter("emotionMin", event.target.value)}>
              <option value="">不限</option>
              {[1, 2, 3, 4, 5].map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>
          <label>
            情绪最高
            <select value={filters.emotionMax} onChange={(event) => setFilter("emotionMax", event.target.value)}>
              <option value="">不限</option>
              {[1, 2, 3, 4, 5].map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </label>
          <label>
            开始日期
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} />
          </label>
          <label>
            结束日期
            <input type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} />
          </label>
        </div>

        <div className="filter-actions">
          <span>当前 {filteredTrades.length} / {trades.length} 笔</span>
          <button className="ghost-action" type="button" onClick={() => setFilters(emptyFilters)}>
            清空筛选
          </button>
        </div>
      </section>

      {filteredTrades.length === 0 ? (
        <section className="panel"><EmptyState text="没有符合条件的交易" /></section>
      ) : (
        <div className="trade-list">
          {filteredTrades.map((trade) => (
            <article className="trade-card" key={trade.id}>
              <div className="trade-card__top">
                <div>
                  <strong>{trade.symbol} {trade.direction}</strong>
                  <span>{trade.date.replace("T", " ")} · {trade.session}</span>
                </div>
                <b className={valueTone(trade.rMultiple)}>{formatR(trade.rMultiple)}</b>
              </div>
              <div className="tag-row">
                <span>{trade.strategy || "未填策略"}</span>
                <span>{trade.inSystem ? "系统内" : "系统外"}</span>
                <span>{trade.result}</span>
                <span>情绪 {trade.emotionScore}</span>
                <span>{trade.biasType}</span>
              </div>
              <p>{trade.summary || "暂无一句话复盘"}</p>
              <div className="card-actions">
                <button type="button" onClick={() => onView(trade)}>详情</button>
                <button type="button" onClick={() => onEdit(trade)}>编辑</button>
                <button type="button" onClick={() => onCopy(trade)}>复制</button>
                <button className="danger-link" type="button" onClick={() => onDelete(trade)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function filterTrades(trades: Trade[], filters: Filters): Trade[] {
  const keyword = filters.keyword.trim().toLowerCase();
  return trades.filter((trade) => {
    if (filters.symbol && trade.symbol !== filters.symbol) return false;
    if (filters.direction && trade.direction !== filters.direction) return false;
    if (filters.session && trade.session !== filters.session) return false;
    if (filters.inSystem && String(trade.inSystem) !== filters.inSystem) return false;
    if (filters.result && trade.result !== filters.result) return false;
    if (filters.strategy && trade.strategy !== filters.strategy) return false;
    if (filters.biasType && trade.biasType !== filters.biasType) return false;
    if (filters.emotionMin && trade.emotionScore < Number(filters.emotionMin)) return false;
    if (filters.emotionMax && trade.emotionScore > Number(filters.emotionMax)) return false;
    if (filters.dateFrom && trade.date.slice(0, 10) < filters.dateFrom) return false;
    if (filters.dateTo && trade.date.slice(0, 10) > filters.dateTo) return false;
    if (keyword) {
      const haystack = [
        trade.symbol,
        trade.strategy,
        trade.biasType,
        trade.summary,
        trade.notes,
        trade.entryReason,
        trade.marketContext,
        trade.emotionNote,
        trade.nextRule,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function TradeEditor({
  initialTrade,
  onCancel,
  onSave,
}: {
  initialTrade: Trade | null;
  onCancel: () => void;
  onSave: (trade: Trade) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Trade>(initialTrade ?? createEmptyTrade());
  const [manualR, setManualR] = useState(Boolean(initialTrade));
  const [imageRole, setImageRole] = useState<ImageRole>("进场前");
  const [isSaving, setIsSaving] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const autoR = calculateR(draft);

  useEffect(() => {
    if (manualR || autoR === null || autoR === draft.rMultiple) return;
    setDraft((current) => ({ ...current, rMultiple: autoR }));
  }, [autoR, draft.rMultiple, manualR]);

  function update<K extends keyof Trade>(key: K, value: Trade[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateNumber(key: keyof Trade, value: string) {
    setDraft((current) => ({ ...current, [key]: parseNumber(value) }));
  }

  async function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (files.length === 0) return;
    setIsCompressing(true);
    const images = await Promise.all(files.map((file) => compressImage(file, imageRole)));
    setDraft((current) => ({ ...current, images: [...current.images, ...images] }));
    event.target.value = "";
    setIsCompressing(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    await onSave({ ...draft, rMultiple: Number(draft.rMultiple || 0), updatedAt: new Date().toISOString() });
    setIsSaving(false);
  }

  return (
    <form className="screen-stack editor" onSubmit={submit}>
      <section className="panel">
        <div className="list-head">
          <SectionTitle eyebrow="Record" title={initialTrade ? "编辑交易" : "新增交易"} />
          <button className="ghost-action" type="button" onClick={onCancel}>返回</button>
        </div>

        <div className="form-grid">
          <label>
            交易日期时间
            <input required type="datetime-local" value={draft.date} onChange={(event) => update("date", event.target.value)} />
          </label>
          <label>
            品种
            <input required value={draft.symbol} onChange={(event) => update("symbol", event.target.value.toUpperCase())} />
          </label>
          <label>
            方向
            <select value={draft.direction} onChange={(event) => update("direction", event.target.value as Trade["direction"])}>
              {directions.map((direction) => <option key={direction}>{direction}</option>)}
            </select>
          </label>
          <label>
            时段
            <select value={draft.session} onChange={(event) => update("session", event.target.value as Trade["session"])}>
              {sessions.map((session) => <option key={session}>{session}</option>)}
            </select>
          </label>
          <label>
            策略模型
            <input list="strategy-options" value={draft.strategy} onChange={(event) => update("strategy", event.target.value)} placeholder="例如：突破回踩" />
            <datalist id="strategy-options">
              {defaultStrategies.map((strategy) => <option key={strategy} value={strategy} />)}
            </datalist>
          </label>
          <label>
            是否系统内
            <select value={String(draft.inSystem)} onChange={(event) => update("inSystem", event.target.value === "true")}>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label>
            结果
            <select value={draft.result} onChange={(event) => update("result", event.target.value as Trade["result"])}>
              {tradeResults.map((result) => <option key={result}>{result}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Risk" title="价格与仓位" />
        <div className="form-grid">
          <NumberField label="入场价" value={draft.entry} onChange={(value) => updateNumber("entry", value)} />
          <NumberField label="止损价" value={draft.stop} onChange={(value) => updateNumber("stop", value)} />
          <NumberField label="止盈价" value={draft.target} onChange={(value) => updateNumber("target", value)} />
          <NumberField label="出场价" value={draft.exit} onChange={(value) => updateNumber("exit", value)} />
          <label>
            仓位
            <input value={draft.size ?? ""} onChange={(event) => update("size", event.target.value)} placeholder="例如 0.1 手" />
          </label>
          <NumberField label="实际盈亏金额" value={draft.pnl} onChange={(value) => updateNumber("pnl", value)} />
          <label>
            R 倍数
            <input
              required
              type="number"
              step="0.01"
              value={draft.rMultiple}
              onChange={(event) => {
                setManualR(true);
                update("rMultiple", Number(event.target.value));
              }}
            />
          </label>
          <label className="checkbox-line">
            <input type="checkbox" checked={manualR} onChange={(event) => setManualR(event.target.checked)} />
            手动填写 R
          </label>
        </div>
        <p className="hint">自动 R：{autoR === null ? "填入入场、止损、出场后计算" : formatR(autoR)}</p>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Mind" title="情绪与执行" />
        <div className="form-grid">
          <ScoreField label="情绪评分" value={draft.emotionScore} onChange={(value) => update("emotionScore", value)} />
          <ScoreField label="偏执评分" value={draft.biasScore} onChange={(value) => update("biasScore", value)} />
          <ScoreField label="执行评分" value={draft.executionScore} onChange={(value) => update("executionScore", value)} />
          <label>
            偏执/错误类型
            <select value={draft.biasType} onChange={(event) => update("biasType", event.target.value)}>
              {biasTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Review" title="复盘文字" />
        <div className="form-grid form-grid--single">
          <TextArea label="进场理由" value={draft.entryReason} onChange={(value) => update("entryReason", value)} />
          <TextArea label="当时市场背景" value={draft.marketContext} onChange={(value) => update("marketContext", value)} />
          <TextArea label="当时情绪" value={draft.emotionNote} onChange={(value) => update("emotionNote", value)} />
          <TextArea label="一句话复盘" value={draft.summary} onChange={(value) => update("summary", value)} />
          <TextArea label="详细复盘" value={draft.notes} onChange={(value) => update("notes", value)} rows={5} />
          <TextArea label="下次同类场景处理规则" value={draft.nextRule} onChange={(value) => update("nextRule", value)} />
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Images" title="截图" />
        <div className="upload-row">
          <label>
            截图类型
            <select value={imageRole} onChange={(event) => setImageRole(event.target.value as ImageRole)}>
              {imageRoles.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label className="file-picker">
            <input accept="image/*" multiple type="file" onChange={handleImages} />
            {isCompressing ? "压缩中..." : "上传截图"}
          </label>
        </div>
        <p className="hint">上传前会在前端压缩，最长边 1600px，JPEG 质量约 0.8。</p>
        {draft.images.length > 0 && (
          <div className="image-grid">
            {draft.images.map((image) => (
              <article className="image-card" key={image.id}>
                {image.dataUrl ? <img src={image.dataUrl} alt={image.name} /> : <div className="image-placeholder">无本地图片</div>}
                <div>
                  <strong>{image.name}</strong>
                  <span>{Math.round((image.compressedSize ?? 0) / 1024)} KB</span>
                </div>
                <select
                  value={image.imageRole}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      images: current.images.map((item) =>
                        item.id === image.id ? { ...item, imageRole: event.target.value as ImageRole } : item,
                      ),
                    }))
                  }
                >
                  {imageRoles.map((role) => <option key={role}>{role}</option>)}
                </select>
                <button
                  className="danger-link"
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, images: current.images.filter((item) => item.id !== image.id) }))}
                >
                  删除图片
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="sticky-submit">
        <button className="ghost-action" type="button" onClick={onCancel}>取消</button>
        <button className="primary-action" type="submit" disabled={isSaving}>{isSaving ? "保存中..." : "保存交易"}</button>
      </div>
    </form>
  );
}

function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="number" step="0.01" value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ScoreField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  rows = 3,
  onChange,
}: {
  label: string;
  value?: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <textarea rows={rows} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function BackupView({
  trades,
  backupMeta,
  onExportJson,
  onImport,
  onClear,
}: {
  trades: Trade[];
  backupMeta: BackupMeta;
  onExportJson: (type: "full" | "light") => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [markdownDate, setMarkdownDate] = useState(() => toLocalInputValue().slice(0, 10));
  const backupDays = daysBetween(backupMeta.lastBackupAt);

  return (
    <div className="screen-stack">
      <section className="panel">
        <SectionTitle eyebrow="Backup" title="备份与导出" />
        <div className="backup-status">
          <strong>上次备份：{backupMeta.lastBackupAt ? new Date(backupMeta.lastBackupAt).toLocaleString() : "暂无"}</strong>
          <span>{backupDays === null ? "建议立即导出完整 JSON" : `距离上次备份 ${backupDays} 天`}</span>
        </div>
        <div className="action-grid">
          <button type="button" onClick={() => onExportJson("full")}>导出完整 JSON</button>
          <button type="button" onClick={() => onExportJson("light")}>导出轻量 JSON</button>
          <button type="button" onClick={() => exportCsv(trades)}>导出 CSV</button>
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Markdown" title="每日复盘导出" />
        <div className="upload-row">
          <label>
            选择日期
            <input type="date" value={markdownDate} onChange={(event) => setMarkdownDate(event.target.value)} />
          </label>
          <button type="button" onClick={() => exportDailyMarkdown(trades, markdownDate)}>导出每日 Markdown</button>
        </div>
      </section>

      <section className="panel">
        <SectionTitle eyebrow="Import" title="导入 JSON" />
        <label className="file-picker file-picker--wide">
          <input
            accept="application/json,.json"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.target.value = "";
            }}
          />
          选择 JSON 备份文件
        </label>
        <p className="hint">支持完整 JSON 和轻量 JSON。相同 id 覆盖，不存在则新增。</p>
      </section>

      <section className="panel danger-zone">
        <SectionTitle eyebrow="Danger" title="清空本地数据" />
        <p>仅清空当前浏览器 IndexedDB 中的交易记录，不会影响已经下载的备份文件。</p>
        <button className="danger-button" type="button" onClick={onClear}>清空所有交易</button>
      </section>
    </div>
  );
}

function TradeDetailModal({
  trade,
  onClose,
  onEdit,
  onDelete,
}: {
  trade: Trade;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <article className="modal-card">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Trade Detail</p>
            <h2>{trade.symbol} {trade.direction} · {formatR(trade.rMultiple)}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>×</button>
        </div>

        <div className="detail-grid">
          <Detail label="日期" value={trade.date.replace("T", " ")} />
          <Detail label="时段" value={trade.session} />
          <Detail label="策略" value={trade.strategy || "未填写"} />
          <Detail label="系统" value={trade.inSystem ? "系统内" : "系统外"} />
          <Detail label="结果" value={trade.result} />
          <Detail label="情绪" value={`${trade.emotionScore} / 5`} />
          <Detail label="偏执" value={`${trade.biasScore} / 5 · ${trade.biasType}`} />
          <Detail label="执行" value={`${trade.executionScore} / 5`} />
        </div>

        <div className="note-block"><strong>一句话复盘</strong><p>{trade.summary || "未填写"}</p></div>
        <div className="note-block"><strong>详细复盘</strong><p>{trade.notes || "未填写"}</p></div>
        <div className="note-block"><strong>下次规则</strong><p>{trade.nextRule || "未填写"}</p></div>

        {trade.images.length > 0 && (
          <div className="image-grid image-grid--modal">
            {trade.images.map((image) => (
              <article className="image-card" key={image.id}>
                {image.dataUrl ? <img src={image.dataUrl} alt={image.name} /> : <div className="image-placeholder">轻量备份图片</div>}
                <div><strong>{image.imageRole}</strong><span>{image.name}</span></div>
              </article>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={() => exportTradeMarkdown(trade)}>导出 Markdown</button>
          <button type="button" onClick={onEdit}>编辑</button>
          <button className="danger-link" type="button" onClick={onDelete}>删除</button>
        </div>
      </article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export default App;
