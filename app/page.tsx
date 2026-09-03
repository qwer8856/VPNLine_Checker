"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  Clock3,
  Globe2,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  X,
  Zap,
} from "lucide-react";
import { LINE_DOMAINS } from "./line-config";

const TIMEOUT = 4500;
const CONCURRENCY = 3;
const VISIBLE = 7;

type Target = { name: string; url: string; altUrl: string };
type Result = Target & {
  ok: boolean;
  latencyMs: number | null;
  reason?: string;
};
type Filter = "all" | "online" | "offline";

const targets: Target[] = LINE_DOMAINS.map((name) => ({
  name,
  url: `https://${name}`,
  altUrl: `http://${name}`,
}));

const safeUrl = (raw: string) => {
  try {
    return new URL(raw).toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
};

async function probeUrl(raw: string): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT);

  try {
    await fetch(`${raw.replace(/\/$/, "")}/favicon.ico?t=${Date.now()}`, {
      cache: "no-store",
      mode: "no-cors",
      redirect: "follow",
      signal: controller.signal,
    });
    return {
      ok: true,
      latencyMs: Math.max(0, Math.round(performance.now() - start)),
    };
  } catch {
    return { ok: false, latencyMs: null };
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeTarget(target: Target): Promise<Result> {
  const attempts = [target.url, target.altUrl].map(async (url) => ({
    url,
    ...(await probeUrl(url)),
  }));

  return new Promise((resolve) => {
    let finished = 0;
    let settled = false;

    attempts.forEach((attempt) =>
      attempt.then((result) => {
        if (settled) return;
        finished += 1;
        if (result.ok) {
          settled = true;
          resolve({
            ...target,
            url: result.url,
            ok: true,
            latencyMs: result.latencyMs,
          });
        } else if (finished === attempts.length) {
          resolve({ ...target, ok: false, latencyMs: null, reason: "连接超时" });
        }
      }),
    );
  });
}

const sortResults = (a: Result, b: Result) => {
  if (a.reason === "检测中" && b.reason !== "检测中") return 1;
  if (b.reason === "检测中" && a.reason !== "检测中") return -1;
  if (a.ok !== b.ok) return a.ok ? -1 : 1;
  if (a.ok && b.ok) return (a.latencyMs ?? 0) - (b.latencyMs ?? 0);
  return a.name.localeCompare(b.name);
};

const getLatencyLevel = (latency: number | null) => {
  if (latency === null) return { label: "--", className: "latency-none", strength: 0 };
  if (latency <= 350) return { label: "极快", className: "latency-fast", strength: 4 };
  if (latency <= 900) return { label: "流畅", className: "latency-good", strength: 3 };
  return { label: "较慢", className: "latency-slow", strength: 1 };
};

function LatencySignal({ strength }: { strength: number }) {
  return (
    <span className="latency-signal" aria-hidden="true">
      {[1, 2, 3, 4].map((bar) => (
        <span key={bar} className={bar <= strength ? "active" : ""} />
      ))}
    </span>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [rows, setRows] = useState<Result[]>(
    targets.map((target) => ({
      ...target,
      ok: false,
      latencyMs: null,
      reason: "检测中",
    })),
  );
  const [running, setRunning] = useState(true);
  const [done, setDone] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [lastChecked, setLastChecked] = useState<string>("--:--:--");
  const [privacyMode, setPrivacyMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("vpn_line_theme");
    const requested = new URLSearchParams(window.location.search).get("theme");
    const initial =
      requested === "dark" || requested === "light"
        ? requested
        : saved === "dark" || saved === "light"
        ? saved
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = initial;
    const frame = window.requestAnimationFrame(() => setTheme(initial));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPrivacyMode(new URLSearchParams(window.location.search).get("privacy") === "1");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const runDetection = useCallback(async () => {
    setRunning(true);
    setDone(0);
    setShowAll(false);
    setFilter("all");

    const output: Result[] = targets.map((target) => ({
      ...target,
      ok: false,
      latencyMs: null,
      reason: "检测中",
    }));
    setRows(output);

    let cursor = 0;
    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= targets.length) break;
        output[index] = await probeTarget(targets[index]);
        setDone((value) => value + 1);
        setRows(output.slice().sort(sortResults));
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRows(output.slice().sort(sortResults));
    setLastChecked(
      new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()),
    );
    setRunning(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void runDetection(), 0);
    return () => window.clearTimeout(timer);
  }, [runDetection]);

  const onlineRows = useMemo(() => rows.filter((row) => row.ok), [rows]);
  const offlineRows = useMemo(
    () => rows.filter((row) => !row.ok && row.reason !== "检测中"),
    [rows],
  );
  const best = onlineRows[0] ?? null;
  const averageLatency = onlineRows.length
    ? Math.round(
        onlineRows.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0) /
          onlineRows.length,
      )
    : null;
  const availability = done ? Math.round((onlineRows.length / done) * 100) : 0;
  const progress = Math.round((done / targets.length) * 100);
  const qualityCounts = useMemo(
    () => ({
      fast: onlineRows.filter((row) => (row.latencyMs ?? Infinity) <= 350).length,
      good: onlineRows.filter(
        (row) => (row.latencyMs ?? Infinity) > 350 && (row.latencyMs ?? Infinity) <= 900,
      ).length,
      slow: onlineRows.filter((row) => (row.latencyMs ?? 0) > 900).length,
    }),
    [onlineRows],
  );
  const qualityTotal = Math.max(onlineRows.length, 1);
  const bestLevel = getLatencyLevel(best?.latencyMs ?? null);

  const filteredRows = useMemo(() => {
    if (filter === "online") return onlineRows;
    if (filter === "offline") return offlineRows;
    return rows;
  }, [filter, offlineRows, onlineRows, rows]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, VISIBLE);
  const displayName = (name: string) => {
    if (!privacyMode) return name;
    const index = targets.findIndex((target) => target.name === name);
    return `加速线路 ${String(index + 1).padStart(2, "0")}`;
  };

  const switchTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("vpn_line_theme", next);
  };

  const visit = (raw: string) => {
    const current = new URL(location.href);
    const hash = current.hash.includes("?")
      ? current.hash.split("?")[1]
      : current.hash.slice(1);
    const code = current.searchParams.get("code") || new URLSearchParams(hash).get("code");
    const destination = new URL(safeUrl(raw));
    if (code) destination.searchParams.set("code", code);
    location.href = destination.toString();
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="VPN 线路检测首页">
          <span className="brand-mark">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </span>
          <span>
            <strong>LINK<span>PROBE</span></strong>
            <small>VPN 线路检测</small>
          </span>
        </a>

        <div className="header-actions">
          <div className="system-status" aria-live="polite">
            <span className={running ? "status-pulse is-running" : "status-pulse"} />
            {running ? "正在扫描网络" : "检测服务正常"}
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={switchTheme}
            aria-label={theme === "dark" ? "切换至亮色模式" : "切换至暗色模式"}
            title={theme === "dark" ? "切换至亮色模式" : "切换至暗色模式"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <div className="dashboard" id="top">
        <section className="page-heading">
          <div>
            <span className="eyebrow"><Activity size={14} /> LIVE NETWORK</span>
            <h1>线路状态总览</h1>
            <p>实时检测节点连通性与响应速度，为当前网络选择更稳定的访问线路。</p>
          </div>
          <div className="heading-actions">
            <span className="last-checked"><Clock3 size={15} /> 最近检测 {lastChecked}</span>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void runDetection()}
              disabled={running}
            >
              <RefreshCw size={16} className={running ? "spin" : ""} />
              {running ? "检测中" : "重新检测"}
            </button>
          </div>
        </section>

        <section className="overview-grid" aria-label="线路检测概览">
          <article className={`recommend-card${running ? " is-scanning" : ""}`}>
            <div className="route-visual" aria-hidden="true">
              <span className="route-orbit orbit-one" />
              <span className="route-orbit orbit-two" />
              <span className="route-node node-one" />
              <span className="route-node node-two" />
              <span className="route-node node-three" />
            </div>
            <div className="recommend-copy">
              <span className="recommend-label"><Zap size={14} fill="currentColor" /> 推荐线路</span>
              <h2>
                {running && !best
                  ? "正在寻找最快线路"
                  : best
                    ? displayName(best.name)
                    : "暂无可用线路"}
              </h2>
              <p>
                {best
                  ? "已根据当前网络环境自动选择延迟最低的可用节点。"
                  : running
                    ? `并发测试 ${CONCURRENCY} 条线路，请稍候。`
                    : "当前网络未检测到可用节点，请稍后重试。"}
              </p>
              <div className="recommend-meta">
                <span><ShieldCheck size={13} /> HTTPS</span>
                <span><LatencySignal strength={bestLevel.strength} /> {best ? bestLevel.label : running ? "扫描中" : "未连接"}</span>
              </div>
            </div>
            <div className="recommend-action">
              <div className="best-latency">
                <span>当前延迟</span>
                <strong>{best?.latencyMs ?? "--"}<small>{best ? " ms" : ""}</small></strong>
              </div>
              <button
                className="button button-accent"
                type="button"
                disabled={!best}
                onClick={() => best && visit(best.url)}
              >
                立即访问 <ArrowUpRight size={17} />
              </button>
            </div>
          </article>

          <aside className="metric-panel" aria-label="实时检测指标">
            <div className="metric-row">
              <span className="metric-icon green"><Globe2 size={18} /></span>
              <span className="metric-copy"><strong>可用线路</strong><small>{running ? "持续更新中" : `${availability}% 可用率`}</small></span>
              <span className="metric-value">{onlineRows.length}<small> / {targets.length}</small></span>
            </div>
            <div className="metric-row">
              <span className="metric-icon orange"><CircleGauge size={18} /></span>
              <span className="metric-copy"><strong>平均延迟</strong><small>基于可用线路</small></span>
              <span className="metric-value">{averageLatency ?? "--"}<small>{averageLatency !== null ? " ms" : ""}</small></span>
            </div>
            <div className="metric-row">
              <span className="metric-icon neutral"><Activity size={18} /></span>
              <span className="metric-copy"><strong>检测进度</strong><small>{done} / {targets.length} 已完成</small></span>
              <span className="metric-value">{progress}<small>%</small></span>
            </div>
            <div className="quality-distribution">
              <div className="distribution-heading"><span>线路质量分布</span><strong>{onlineRows.length} 条可用</strong></div>
              <div className="distribution-track" aria-label="线路质量分布">
                <span className="segment-fast" style={{ width: `${(qualityCounts.fast / qualityTotal) * 100}%` }} />
                <span className="segment-good" style={{ width: `${(qualityCounts.good / qualityTotal) * 100}%` }} />
                <span className="segment-slow" style={{ width: `${(qualityCounts.slow / qualityTotal) * 100}%` }} />
              </div>
              <div className="distribution-legend">
                <span><i className="fast" />极快 {qualityCounts.fast}</span>
                <span><i className="good" />流畅 {qualityCounts.good}</span>
                <span><i className="slow" />较慢 {qualityCounts.slow}</span>
              </div>
            </div>
          </aside>
        </section>

        <section className="lines-panel">
          <div className="panel-header">
            <div>
              <h2>全部线路</h2>
              <p>线路会按可用状态和实时延迟自动排序</p>
            </div>
            <div className="filter-tabs" aria-label="线路状态筛选">
              {([
                ["all", "全部", targets.length],
                ["online", "可用", onlineRows.length],
                ["offline", "不可用", offlineRows.length],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? "active" : ""}
                  onClick={() => {
                    setFilter(value);
                    setShowAll(false);
                  }}
                >
                  {label}<span>{count}</span>
                </button>
              ))}
            </div>
          </div>

          {running && (
            <div className="progress-track" aria-label={`检测进度 ${progress}%`}>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="line-table-wrap">
            <table className="line-table">
              <thead>
                <tr>
                  <th>线路地址</th>
                  <th>连接状态</th>
                  <th>响应延迟</th>
                  <th>速度评级</th>
                  <th><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const level = getLatencyLevel(row.latencyMs);
                  const pending = row.reason === "检测中";
                  const isBest = best?.name === row.name && row.ok;
                  return (
                    <tr key={row.name} className={isBest ? "best-row" : ""}>
                      <td data-label="线路地址">
                        <div className="address-cell">
                          <span className="route-index">{String(index + 1).padStart(2, "0")}</span>
                          <span className="address-copy">
                            <strong>{displayName(row.name)}</strong>
                            <small>HTTPS 安全线路</small>
                          </span>
                          {isBest && <span className="best-badge"><Zap size={11} fill="currentColor" /> 最优</span>}
                        </div>
                      </td>
                      <td data-label="连接状态">
                        <span className={`connection-status ${pending ? "pending" : row.ok ? "online" : "offline"}`}>
                          {pending ? <RefreshCw size={13} className="spin" /> : row.ok ? <Check size={13} /> : <X size={13} />}
                          {pending ? "检测中" : row.ok ? "可用" : "不可用"}
                        </span>
                      </td>
                      <td data-label="响应延迟">
                        <span className="latency-value">
                          {row.ok ? <><strong>{row.latencyMs}</strong> ms</> : <strong>--</strong>}
                        </span>
                      </td>
                      <td data-label="速度评级">
                        <span className={`latency-level ${level.className}`}>
                          {!pending && <LatencySignal strength={level.strength} />}
                          {pending ? "检测中" : level.label}
                        </span>
                      </td>
                      <td data-label="操作" className="table-action">
                        <button
                          className="visit-button"
                          type="button"
                          disabled={!row.ok}
                          onClick={() => visit(row.url)}
                          aria-label={`访问 ${displayName(row.name)}`}
                          title={row.ok ? `访问 ${displayName(row.name)}` : "线路当前不可用"}
                        >
                          访问 <ArrowUpRight size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && !running && (
            <div className="empty-state">当前筛选条件下没有线路</div>
          )}

          {filteredRows.length > VISIBLE && (
            <button className="expand-button" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              {showAll ? "收起线路" : `查看其余 ${filteredRows.length - VISIBLE} 条线路`}
            </button>
          )}
        </section>

        <footer className="site-footer">
          <p><ShieldCheck size={15} /> 检测仅用于选择访问入口，不会读取或保存你的网络数据。</p>
          <p>浏览器探测超时 {TIMEOUT / 1000} 秒，结果可能受本地网络与 DNS 状态影响。</p>
        </footer>
      </div>
    </main>
  );
}
