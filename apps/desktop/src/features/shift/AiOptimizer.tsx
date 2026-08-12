// [REQ-018/019/020/021] AIシフト最適化（LLM構造化→数理最適化→HITL）。
// 自然言語→(サーバB経由)構造化制約→制約エディタへ反映、「下案生成」で最適化、
// 下案(割付＋説明)と制約評価(ハード=赤/ソフト=注意)を表示。
// HITL: 「確認して確定」を入れないと確定できない（confirmOptimizationRun に reviewed:true が必要）。
// 確定/反映(applyConfirmedRun=ai_apply)は input-core の関数のみが担う。自動確定は絶対に行わない（層分離厳守）。
import { useMemo, useState } from 'react'
import {
  type ConstraintDef,
  type OptimizationContext,
  type OptimizationRun,
  type ShiftCell,
} from '@mamorai/input-core'
import { ConstraintEditor } from './ConstraintEditor.js'
import { structureConstraints, optimize, confirmRun } from './shiftClient.js'
import {
  DEMO_SITE_ID,
  DEMO_MONTH,
  DEMO_WORK_DATES,
  demoStaff,
  demoPositions,
} from './demoShift.js'

interface Props {
  constraints: ConstraintDef[]
  onChange: (next: ConstraintDef[]) => void
}

function nameOf(staffId: string | null): string {
  if (staffId === null) return '—'
  return demoStaff.find((s) => s.id === staffId)?.name ?? staffId
}

/** 制約を id で重複排除しながら追記（NL反映で既存を壊さない）。 */
function mergeConstraints(base: ConstraintDef[], add: ConstraintDef[]): ConstraintDef[] {
  const byId = new Map(base.map((c) => [c.id, c]))
  for (const c of add) byId.set(c.id, c)
  return [...byId.values()]
}

export function AiOptimizer({ constraints, onChange }: Props): JSX.Element {
  const [nlText, setNlText] = useState<string>('連勤は6日までにして、夜勤は有資格者だけ。社保の対象も見たい。')
  const [note, setNote] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [run, setRun] = useState<OptimizationRun | null>(null)
  // HITL: 管制員レビュー済みフラグ（未チェックでは確定不可）。
  const [reviewed, setReviewed] = useState<boolean>(false)
  const [applied, setApplied] = useState<ShiftCell[] | null>(null)
  const [confirmError, setConfirmError] = useState<string>('')
  // サーバで権威的に確定できたか（false=ローカルプレビュー止まり）。
  const [serverConfirmed, setServerConfirmed] = useState<boolean>(false)
  const [applyNote, setApplyNote] = useState<string>('')

  const context: OptimizationContext = useMemo(
    () => ({
      siteId: DEMO_SITE_ID,
      month: DEMO_MONTH,
      workDates: DEMO_WORK_DATES,
      staff: demoStaff,
      positions: demoPositions,
      constraints,
    }),
    [constraints],
  )

  async function handleStructure(): Promise<void> {
    setBusy(true)
    try {
      const r = await structureConstraints(nlText)
      // 構造化された制約を制約エディタへ反映（ユーザーが確認・編集できる）。
      onChange(mergeConstraints(constraints, r.data))
      setNote(`${r.fromFallback ? 'デモ' : 'LIVE'}: ${r.note} ${r.data.length}件を制約エディタへ反映。`)
    } finally {
      setBusy(false)
    }
  }

  async function handleOptimize(): Promise<void> {
    setBusy(true)
    setApplied(null)
    setReviewed(false)
    setServerConfirmed(false)
    setApplyNote('')
    setConfirmError('')
    try {
      const r = await optimize(context, `run-${Date.now()}`)
      setRun(r.data)
      setNote(`${r.fromFallback ? 'デモ' : 'LIVE'}: ${r.note}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirm(): Promise<void> {
    if (run === null) return
    setConfirmError('')
    setBusy(true)
    try {
      // [ADR-008] 確定は必ずサーバ /api/shift/confirm 経由（第一経路・権威）。
      // HITL ゲート(reviewed=true 必須)はサーバ・フォールバック双方で維持。
      const r = await confirmRun(run, { id: 'mgr-1', at: new Date().toISOString() }, reviewed)
      setRun(r.run)
      setApplied(r.applied)
      setServerConfirmed(r.confirmed)
      setApplyNote(`${r.confirmed ? 'LIVE' : 'プレビュー'}: ${r.note}`)
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : '確定に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const evalResult = run?.result.evaluation
  // サーバ確定できた場合のみ「確定済み」。ローカルプレビューは未確定として扱う。
  const confirmed = serverConfirmed && run?.status === '確定'

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">AIシフト最適化</h1>
        <span className="muted">LLM構造化 → 数理最適化 → 管制員確認(HITL)</span>
      </header>

      <section className="card ai-warn" aria-label="HITL方針">
        <div className="card-b">
          <strong>自動確定は行いません。</strong> AIは「下案」を提示するだけです。管制員が内容を確認し
          「確認して確定」にチェックした場合にのみ確定・実運用へ反映されます。
        </div>
      </section>

      {/* 1. 自然言語 → 構造化制約 */}
      <section className="card" aria-label="自然言語で要望">
        <div className="card-h"><h2>1. 要望を自然言語で入力（サーバ経由でClaude構造化）</h2></div>
        <div className="card-b">
          <textarea
            className="input ai-textarea"
            aria-label="自然言語の要望"
            rows={3}
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
          />
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={handleStructure} disabled={busy || nlText.trim() === ''}>
              構造化して制約へ反映
            </button>
          </div>
          {note !== '' && <p className="muted" role="status">{note}</p>}
        </div>
      </section>

      {/* 2. 制約エディタ（NL反映先。ユーザーが確認・編集できる） */}
      <ConstraintEditor constraints={constraints} onChange={onChange} />

      {/* 3. 下案生成 */}
      <section className="card" aria-label="下案生成">
        <div className="card-h"><h2>3. 下案を生成（重い最適化はサーバ側）</h2></div>
        <div className="card-b">
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={handleOptimize} disabled={busy}>
              下案生成
            </button>
            {run !== null && <span className="status st-submitted">status: {run.status}</span>}
          </div>
        </div>
      </section>

      {/* 4. 下案＋制約評価 */}
      {run !== null && (
        <>
          <section className="card" aria-label="制約評価">
            <div className="card-h"><h2>制約評価</h2></div>
            <div className="card-b">
              {evalResult !== undefined && (
                <>
                  <p>
                    <span className={`lv ${evalResult.feasible ? 'lv-low' : 'lv-high'}`}>
                      {evalResult.feasible ? '実行可能' : 'ハード違反あり'}
                    </span>{' '}
                    <span className="muted">ソフト違反ペナルティ合計: {evalResult.totalPenalty}</span>
                  </p>
                  {evalResult.hardViolations.length > 0 && (
                    <ul className="viol-list">
                      {evalResult.hardViolations.map((v, i) => (
                        <li key={i} className="viol-hard">【ハード】{v.message}</li>
                      ))}
                    </ul>
                  )}
                  {evalResult.softViolations.length > 0 && (
                    <ul className="viol-list">
                      {evalResult.softViolations.map((v, i) => (
                        <li key={i} className="viol-soft">【注意】{v.message}（penalty {v.penalty ?? 1}）</li>
                      ))}
                    </ul>
                  )}
                  {evalResult.hardViolations.length === 0 && evalResult.softViolations.length === 0 && (
                    <p className="muted">制約違反はありません。</p>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="card" aria-label="下案">
            <div className="card-h"><h2>下案（割付＋説明）</h2></div>
            <div className="card-b">
              <table className="tbl">
                <thead>
                  <tr><th>日付</th><th>ポジション</th><th>担当</th><th>説明</th></tr>
                </thead>
                <tbody>
                  {run.result.draft.map((d, i) => (
                    <tr key={i} className={d.staffId === null ? 'row-vacant' : undefined}>
                      <td>{d.date}</td>
                      <td>{d.position}</td>
                      <td>{d.staffId === null ? <span className="status st-rejected">充足不能</span> : nameOf(d.staffId)}</td>
                      <td className="muted">{d.explanation.reasons.join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. HITL 確定 */}
          <section className="card" aria-label="確定(HITL)">
            <div className="card-h"><h2>5. 管制員確認して確定（HITL）</h2></div>
            <div className="card-b">
              <label className="ai-review">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={confirmed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                内容を確認しました（reviewed）
              </label>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={!reviewed || confirmed || busy}
                >
                  確認して確定
                </button>
                {confirmed && <span className="status st-approved">確定済み（{run.confirmedBy}）</span>}
              </div>
              {confirmError !== '' && <p className="field-msg">{confirmError}</p>}
              {applyNote !== '' && <p className="muted" role="status">{applyNote}</p>}
              <p className="muted">
                チェックを入れないと確定ボタンは押せません（自動確定禁止）。確定はサーバ側
                (service_role相当の /api/shift/confirm)でのみ実行され、クライアントからの直書きは行いません。
                サーバ未接続時は「未確定のプレビュー」までで、確定はサーバ接続時のみ有効です。
              </p>
            </div>
          </section>

          {/* 6. 反映結果（確定時のみ） */}
          {applied !== null && (
            <section className="card" aria-label="反映結果">
              <div className="card-h">
                <h2>{serverConfirmed ? '実運用へ反映（source=ai_apply）' : 'プレビュー（未確定・未反映）'}</h2>
              </div>
              <div className="card-b">
                <p className="muted">
                  {serverConfirmed
                    ? `${applied.length} セルを勤務表へ反映しました。`
                    : `${applied.length} セルのプレビュー（サーバ確定前のため未反映）。`}
                </p>
                <table className="tbl">
                  <thead><tr><th>日付</th><th>スタッフ</th><th>勤務区分</th><th>source</th></tr></thead>
                  <tbody>
                    {applied.map((c, i) => (
                      <tr key={i}>
                        <td>{c.date}</td>
                        <td>{nameOf(c.staffId)}</td>
                        <td>{c.workType}</td>
                        <td><span className="status st-approved">{c.source}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
