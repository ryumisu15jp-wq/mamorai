import { useMemo, useState } from 'react'
import {
  buildMonthlyExportTable,
  buildMonthlyList,
  incidentBreakdown,
  monthlySummary,
  type ExportTable,
  type IncidentBreakdown,
  type MonthlySummary,
  type ReportListRow,
} from '@mamorai/input-core'
import {
  COUNTER_LABEL,
  DEMO_MONTH,
  DEMO_PREV_MONTH,
  demoAggregateConfig,
  demoMonthlyReports,
  demoPrevMonthReports,
} from './demoMonth.js'
import { getDefaultTauriBridge } from '../../lib/tauriBridge.js'

// [REQ-025] 保存/印刷はデスクトップ抽象(TauriBridge)経由。
// 実行時に Tauri があればネイティブ保存/印刷、無ければブラウザ fallback / no-op。
const bridge = getDefaultTauriBridge()

// 月報画面。集計・出力の中間構造はすべて @mamorai/input-core に委譲し、
// ここでは「対象月の選択」と「結果の描画」だけを担う（層分離厳守）。

const MONTH_OPTIONS = [DEMO_MONTH, DEMO_PREV_MONTH]

/** 'YYYY-MM' の前月を返す（月セレクタ用の UI 都合の計算。集計ロジックではない）。 */
function prevMonthOf(month: string): string {
  const parts = month.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** デモの全日報プール（当月＋前月）。実接続時は Supabase 直結の SELECT に置換予定（スタブ）。 */
function allDemoReports() {
  return [...demoMonthlyReports(), ...demoPrevMonthReports()]
}

type ExportKind = 'PDF' | 'Excel' | null

export function MonthlyReport(): JSX.Element {
  const [month, setMonth] = useState<string>(DEMO_MONTH)
  const [exportKind, setExportKind] = useState<ExportKind>(null)
  const [ioNote, setIoNote] = useState<string | null>(null)

  const pool = useMemo(() => allDemoReports(), [])

  // 対象月・前月のレコード抽出（reportDate の前方一致。DB接続時はクエリに置換）。
  const reports = useMemo(() => pool.filter((r) => r.reportDate.startsWith(month)), [pool, month])
  const prevReports = useMemo(() => {
    const pm = prevMonthOf(month)
    return pool.filter((r) => r.reportDate.startsWith(pm))
  }, [pool, month])

  // [input-core] monthlySummary: 4指標（報告日数/対応件数/インシデント/承認率）
  const summary: MonthlySummary = useMemo(
    () => monthlySummary(reports, demoAggregateConfig),
    [reports]
  )
  // [input-core] incidentBreakdown: 種別内訳＋前月比＋日別推移
  const breakdown: IncidentBreakdown = useMemo(
    () => incidentBreakdown(reports, month, demoAggregateConfig, prevReports),
    [reports, month, prevReports]
  )
  // [input-core] buildMonthlyList: 当月全日を1行/日（未作成日を明示）
  const rows: ReportListRow[] = useMemo(() => buildMonthlyList(reports, month), [reports, month])

  // [input-core] buildMonthlyExportTable: PDF/Excel 出力用の中間テーブル（実生成は Tauri 結合時＝スタブ）
  const exportTable: ExportTable | null = useMemo(
    () => (exportKind === null ? null : buildMonthlyExportTable(month, summary, breakdown)),
    [exportKind, month, summary, breakdown]
  )

  const maxTrend = Math.max(1, ...breakdown.dailyTrend.map((d) => d.count))

  // [REQ-025] 出力: 中間テーブルをプレビュー表示しつつ TauriBridge.saveFile を呼ぶ。
  // 実バイナリ(PDF/Excel)生成は Tauri 結合時。ここでは中間構造の JSON を渡す抽象呼び出しまで。
  const handleExport = async (kind: 'PDF' | 'Excel'): Promise<void> => {
    setExportKind(kind)
    const table = buildMonthlyExportTable(month, summary, breakdown)
    const ext = kind === 'PDF' ? 'pdf' : 'xlsx'
    const mime = kind === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const res = await bridge.saveFile({
      fileName: `月報_${month}.${ext}`,
      contents: JSON.stringify(table, null, 2),
      mime,
    })
    setIoNote(
      res.saved
        ? `${kind} を保存しました: ${res.path ?? ''}`
        : `${kind} 保存はプレビューのみ（Tauri未接続 / ブラウザfallback）`,
    )
  }

  // [REQ-025] 印刷: TauriBridge.print()（Tauri なら OS 印刷、無ければ window.print）。
  const handlePrint = async (): Promise<void> => {
    await bridge.print()
    setIoNote('印刷ダイアログを呼び出しました（Tauri未接続時は no-op）')
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">月報</h1>
        <label className="month-picker">
          対象月
          <select
            className="input"
            aria-label="対象月を選択"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value)
              setExportKind(null)
            }}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* 4指標サマリー */}
      <section className="metrics" aria-label="月報サマリー4指標">
        <Metric label="報告日数" value={`${summary.reportDays} 日`} />
        <Metric label="対応件数合計" value={`${summary.totalResponses} 件`} />
        <Metric label="インシデント件数" value={`${summary.incidentCount} 件`} tone="am" />
        <Metric label="承認率" value={`${Math.round(summary.approvalRate * 100)} %`} tone="g" />
      </section>

      {/* インシデント種別内訳（前月比） */}
      <section className="card" aria-label="インシデント種別内訳">
        <div className="card-h">
          <h2>インシデント種別内訳（前月比）</h2>
        </div>
        <div className="card-b">
          {breakdown.byType.length === 0 ? (
            <p className="muted">インシデント種別が未設定です。</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>種別</th>
                  <th className="num">当月</th>
                  <th className="num">前月</th>
                  <th className="num">前月比</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.byType.map((s) => (
                  <tr key={s.type}>
                    <td>{COUNTER_LABEL[s.type] ?? s.type}</td>
                    <td className="num">{s.count}</td>
                    <td className="num">{s.prevCount ?? '—'}</td>
                    <td className="num">
                      <DeltaBadge delta={s.delta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 日別対応件数の簡易バー（CSSのみ） */}
      <section className="card" aria-label="日別対応件数の推移">
        <div className="card-h">
          <h2>日別対応件数 推移</h2>
        </div>
        <div className="card-b">
          <ul className="bars" role="img" aria-label={`${month} の日別対応件数バーチャート`}>
            {breakdown.dailyTrend.map((d) => (
              <li key={d.date} className="bar-row" title={`${d.date}: ${d.count}件`}>
                <span className="bar-label">{d.date.slice(8)}</span>
                <span className="bar-track">
                  <span
                    className={`bar-fill${d.count === 0 ? ' bar-zero' : ''}`}
                    style={{ width: `${(d.count / maxTrend) * 100}%` }}
                  />
                </span>
                <span className="bar-val">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 日報一覧（未作成日を明示） */}
      <section className="card" aria-label="当月日報一覧">
        <div className="card-h">
          <h2>当月 日報一覧</h2>
        </div>
        <div className="card-b">
          <table className="tbl">
            <thead>
              <tr>
                <th>日付</th>
                <th>状態</th>
                <th>報告者</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.reportDate} className={row.status === '未作成' ? 'row-missing' : ''}>
                  <td>{row.reportDate}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    {row.report?.values?.meta?.reporterName != null &&
                    row.report.values.meta.reporterName !== ''
                      ? String(row.report.values.meta.reporterName)
                      : row.reporterId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 出力（中間構造のプレビュー。実ファイル生成は Tauri 結合時＝スタブ） */}
      <section className="card" aria-label="月報出力">
        <div className="card-h">
          <h2>出力（プレビュー / 実ファイル生成は Tauri 結合時スタブ）</h2>
        </div>
        <div className="card-b">
          <div className="qdr-actions">
            <button type="button" className="btn btn-primary" aria-label="PDF保存" onClick={() => void handleExport('PDF')}>
              PDF保存
            </button>
            <button type="button" className="btn btn-secondary" aria-label="Excel保存" onClick={() => void handleExport('Excel')}>
              Excel保存
            </button>
            <button type="button" className="btn btn-secondary" aria-label="印刷" onClick={() => void handlePrint()}>
              印刷
            </button>
            <span className="muted">保存/印刷先: {bridge.isTauri ? 'Tauri (ネイティブ)' : 'ブラウザ / 未接続'}</span>
          </div>
          {ioNote !== null && <p className="muted" role="status">{ioNote}</p>}
          {exportTable !== null && (
            <ExportPreview kind={exportKind} table={exportTable} />
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'g' | 'am' }): JSX.Element {
  return (
    <div className={`metric${tone !== undefined ? ` metric-${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number | null }): JSX.Element {
  if (delta === null) return <span className="muted">—</span>
  if (delta > 0) return <span className="delta delta-up">▲ +{delta}</span>
  if (delta < 0) return <span className="delta delta-down">▼ {delta}</span>
  return <span className="delta delta-flat">±0</span>
}

function StatusBadge({ status }: { status: ReportListRow['status'] }): JSX.Element {
  const cls: Record<ReportListRow['status'], string> = {
    下書き: 'st-draft',
    提出済: 'st-submitted',
    承認済: 'st-approved',
    差し戻し: 'st-rejected',
    未作成: 'st-missing',
  }
  return <span className={`status ${cls[status]}`}>{status}</span>
}

function ExportPreview({ kind, table }: { kind: ExportKind; table: ExportTable }): JSX.Element {
  return (
    <div className="export-preview" aria-label={`${kind ?? ''} 出力プレビュー`}>
      <p className="muted">
        {kind} 出力の中間構造（buildMonthlyExportTable）。実バイナリ生成は Tauri 結合時に実装。
      </p>
      <table className="tbl">
        <thead>
          <tr>
            {table.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={typeof cell === 'number' ? 'num' : ''}>
                  {typeof cell === 'number' && table.headers[1] === '値' && i === 3
                    ? `${Math.round(cell * 100)}%`
                    : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <details className="raw">
        <summary>JSON（中間構造）</summary>
        <pre className="result-json">{JSON.stringify(table, null, 2)}</pre>
      </details>
    </div>
  )
}
