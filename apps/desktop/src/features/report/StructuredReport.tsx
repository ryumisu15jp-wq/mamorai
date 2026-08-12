// [S5-5] 業態別 構造化日報入力。対応記録は 対応時間・対応者・対応内容・事案内容 を必須項目とする。
// テンプレ生成・検証・マスタ取得は @mamorai/input-core に委譲（層分離厳守・再発明しない）:
//   - listBusinessTypes(): 業態セレクタの選択肢
//   - buildBusinessReportTemplate(bt, siteId): 基本情報＋物件特性/共通条件/特殊条件 のテンプレ
//   - resolveForm(template): 描画用フォーム初期値
//   - listIncidents(bt) / listPositions(bt): インシデント×ポジション記録の選択肢
//   - createSubmittedReport / SubmitValidationError: 条件・基本情報を検証して構造化レコード生成
import { useMemo, useState } from 'react'
import {
  buildBusinessReportTemplate,
  createSubmittedReport,
  listBusinessTypes,
  listIncidents,
  listPositions,
  resolveForm,
  tallyResponsesByType,
  SubmitValidationError,
  type DailyReport,
  type FieldDef,
  type FieldValue,
  type ReportTemplate,
  type Violation,
} from '@mamorai/input-core'

const SITE_ID = 'siteA'
const DEFAULT_BT = '商業施設' // デモ用の初期業態

type ValueMap = Record<string, Record<string, FieldValue>>

/** 対応記録の1行。必須＝対応時間・対応者・対応内容・事案内容。種別/ポジションは任意の構造化タグ（マスタ由来）。 */
interface IncidentRow {
  id: string
  time: string          // 対応時間
  responder: string     // 対応者
  content: string       // 対応内容
  caseDetail: string    // 事案内容
  incidentType: string  // インシデント種別（任意, 業態マスタ）
  position: string      // ポジション（任意, 業態マスタ）
}

/** values を破壊しないための浅いクローン（section 単位でコピー）。 */
function cloneValues(src: ValueMap): ValueMap {
  const out: ValueMap = {}
  for (const [sid, fields] of Object.entries(src)) out[sid] = { ...fields }
  return out
}

/** テンプレを resolveForm で初期化し、基本情報の日付を当日でプリフィルする。 */
function initValues(template: ReportTemplate): ValueMap {
  const values = cloneValues(resolveForm(template).values)
  const meta = values['meta']
  if (meta !== undefined) meta['reportDate'] = new Date().toISOString().slice(0, 10)
  return values
}

/** SubmitValidationError から violations を取り出す（他エラーは null）。 */
function extractViolations(e: unknown): Violation[] | null {
  return e instanceof SubmitValidationError ? e.violations : null
}

function newIncidentRow(): IncidentRow {
  return { id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: '', responder: '', content: '', caseDetail: '', incidentType: '', position: '' }
}

/** 対応記録の必須（対応時間・対応者・対応内容・事案内容）が入っているか。任意タグのみの行は未入力扱い。 */
function responseFilled(r: IncidentRow): boolean {
  return r.time !== '' || r.responder !== '' || r.content !== '' || r.caseDetail !== ''
}
/** 未入力の必須項目名を返す（1つでも埋まっている行が対象）。 */
function responseMissing(r: IncidentRow): string[] {
  const miss: string[] = []
  if (r.time === '') miss.push('対応時間')
  if (r.responder === '') miss.push('対応者')
  if (r.content === '') miss.push('対応内容')
  if (r.caseDetail === '') miss.push('事案内容')
  return miss
}

export function StructuredReport(): JSX.Element {
  const businessTypes = useMemo(() => listBusinessTypes(), [])
  const [bt, setBt] = useState<string>(DEFAULT_BT)

  // [input-core] 業態→テンプレ／インシデント／ポジションは全て input-core が算出する。
  const template = useMemo(() => buildBusinessReportTemplate(bt, SITE_ID), [bt])
  const incidentOptions = useMemo(() => listIncidents(bt), [bt])
  const positionOptions = useMemo(() => listPositions(bt), [bt])

  const [values, setValues] = useState<ValueMap>(() => initValues(buildBusinessReportTemplate(DEFAULT_BT, SITE_ID)))
  const [incidents, setIncidents] = useState<IncidentRow[]>([newIncidentRow()])
  const [violations, setViolations] = useState<Violation[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // 業態切替: テンプレ／条件／インシデント・ポジション選択肢が丸ごと切り替わる。
  const changeBusinessType = (next: string): void => {
    setBt(next)
    setValues(initValues(buildBusinessReportTemplate(next, SITE_ID)))
    setIncidents([newIncidentRow()])
    setViolations([])
    setPreview(null)
    setToast(null)
  }

  const setValue = (sectionId: string, key: string, value: FieldValue): void => {
    setValues((prev) => {
      const next = cloneValues(prev)
      const bucket = next[sectionId] ?? {}
      bucket[key] = value
      next[sectionId] = bucket
      return next
    })
  }

  const violationFor = (sectionId: string, key: string): Violation | undefined =>
    violations.find((v) => v.sectionId === sectionId && v.fieldKey === key)

  // [S6-あ] 対応記録の「種別」から データ項目×件数 を自動集計（月次のデータ項目×件数の元）。
  // 集計ロジックは input-core.tallyResponsesByType に委譲（UIで再実装しない）。
  const tally = useMemo(() => tallyResponsesByType(incidents), [incidents])
  const tallyTotal = useMemo(() => tally.reduce((s, r) => s + r.count, 0), [tally])

  // ── インシデント記録の行操作 ──
  const addIncident = (): void => setIncidents((prev) => [...prev, newIncidentRow()])
  const removeIncident = (id: string): void => setIncidents((prev) => prev.filter((r) => r.id !== id))
  const updateIncident = (id: string, patch: Partial<IncidentRow>): void =>
    setIncidents((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const onSubmit = (): void => {
    try {
      // 対応記録の必須(対応時間・対応者・対応内容・事案内容)チェック（部分入力行のみ対象）。
      const filled = incidents.filter(responseFilled)
      const badRows = filled
        .map((r, i) => ({ i: i + 1, miss: responseMissing(r) }))
        .filter((x) => x.miss.length > 0)
      if (badRows.length > 0) {
        setPreview(null)
        setToast(`対応記録の未入力: ${badRows.map((b) => `${b.i}行目(${b.miss.join('・')})`).join(' / ')}`)
        return
      }
      // [input-core] createSubmittedReport: テンプレ(条件・基本情報)を検証し status='提出済' を生成。違反時 throw。
      const rec: DailyReport = createSubmittedReport({
        id: `sr-${new Date().toISOString().slice(0, 10)}-${Date.now()}`,
        siteId: template.siteId,
        templateId: template.id,
        reporterId: 'user-1',
        reportDate: typeof values['meta']?.['reportDate'] === 'string' && values['meta']['reportDate'] !== ''
          ? (values['meta']['reportDate'] as string)
          : new Date().toISOString().slice(0, 10),
        values,
        template,
      })
      setViolations([])
      // 対応記録は values['responses'] に格納して構造化レコードを構成（DB未接続スタブ）。
      const record = {
        ...rec,
        businessType: bt,
        values: { ...rec.values, responses: filled },
      }
      setPreview(JSON.stringify(record, null, 2))
      setToast('提出しました（DB未接続のためスタブ表示）')
    } catch (e) {
      const vs = extractViolations(e)
      if (vs !== null) {
        setViolations(vs)
        setPreview(null)
        setToast(`未入力/不備が ${vs.length} 件あります`)
      } else {
        setToast('提出中に想定外のエラーが発生しました')
      }
    }
  }

  // 出力導線（スタブ）: 実生成はサーバ/バックエンド結線時。
  const onExport = (kind: string): void => setToast(`${kind}: 出力定義に基づき生成（本結線時）`)

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">日報入力 — {template.name}</h1>
        <label className="fl">
          業態
          <select
            className="input"
            aria-label="業態を選択"
            value={bt}
            onChange={(e) => changeBusinessType(e.target.value)}
          >
            {businessTypes.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="row-actions" role="group" aria-label="日報操作">
        <button type="button" className="btn btn-primary" aria-label="日報を提出" onClick={onSubmit}>提出</button>
        <button type="button" className="btn btn-secondary" aria-label="PDFで出力（現場フォーマット）" onClick={() => onExport('PDFで出力（現場フォーマット）')}>PDFで出力（現場フォーマット）</button>
        <button type="button" className="btn btn-secondary" aria-label="既存Excelへ書き戻し" onClick={() => onExport('既存Excelへ書き戻し')}>既存Excelへ書き戻し</button>
      </div>

      {/* 基本情報＋条件（buildBusinessReportTemplate→resolveForm を型に応じて描画） */}
      {template.sections.map((section) => (
        <section key={section.id} className="card" aria-label={section.label}>
          <div className="card-h"><h2>{section.label}</h2></div>
          <div className="card-b">
            {section.fields.length === 0 ? (
              <p className="muted">この業態にこのグループの条件はありません。</p>
            ) : (
              section.fields.map((field) => (
                <FieldRow
                  key={field.key}
                  sectionId={section.id}
                  field={field}
                  value={values[section.id]?.[field.key] ?? null}
                  violation={violationFor(section.id, field.key)}
                  onChange={(v) => setValue(section.id, field.key, v)}
                />
              ))
            )}
          </div>
        </section>
      ))}

      {/* 対応記録＝ 対応時間・対応者・対応内容・事案内容（必須）＋ 種別/ポジション（任意タグ） */}
      <section className="card" aria-label="対応記録">
        <div className="card-h">
          <h2>対応記録（対応時間・対応者・対応内容・事案内容）</h2>
          <span className="muted">{incidents.length} 行</span>
        </div>
        <div className="card-b">
          <table className="tbl">
            <thead>
              <tr>
                <th>対応時間<span className="req">必須</span></th>
                <th>対応者<span className="req">必須</span></th>
                <th>対応内容<span className="req">必須</span></th>
                <th>事案内容<span className="req">必須</span></th>
                <th>種別(任意)</th>
                <th>ポジション(任意)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input className="input" type="time" aria-label="対応時間" value={row.time} onChange={(e) => updateIncident(row.id, { time: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" type="text" aria-label="対応者" placeholder="例: LP三角" value={row.responder} onChange={(e) => updateIncident(row.id, { responder: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" type="text" aria-label="対応内容" placeholder="例: MIRAへインシデントレポート入力・提出" value={row.content} onChange={(e) => updateIncident(row.id, { content: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" type="text" aria-label="事案内容" placeholder="例: BAR泥酔・BAR汚損 2件" value={row.caseDetail} onChange={(e) => updateIncident(row.id, { caseDetail: e.target.value })} />
                  </td>
                  <td>
                    <select className="input" aria-label="インシデント種別" value={row.incidentType} onChange={(e) => updateIncident(row.id, { incidentType: e.target.value })}>
                      <option value="">—</option>
                      {incidentOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
                    </select>
                  </td>
                  <td>
                    <select className="input" aria-label="ポジション" value={row.position} onChange={(e) => updateIncident(row.id, { position: e.target.value })}>
                      <option value="">—</option>
                      {positionOptions.map((o) => (<option key={o} value={o}>{o}</option>))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="btn-sm btn-reject" aria-label="この対応記録を削除" onClick={() => removeIncident(row.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" aria-label="対応記録を追加" onClick={addIncident}>行を追加</button>
          </div>
        </div>
      </section>

      {/* [S6-あ] データ項目×件数（対応記録の種別から自動集計・リアルタイム） */}
      <section className="card" aria-label="データ項目×件数">
        <div className="card-h">
          <h2>データ項目 × 件数（自動集計）</h2>
          <span className="muted">合計 {tallyTotal} 件</span>
        </div>
        <div className="card-b">
          {tally.length === 0 ? (
            <p className="muted">対応記録の「種別」を選択すると、ここに件数が自動集計されます。</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>データ項目（種別）</th><th>件数</th></tr></thead>
              <tbody>
                {tally.map((r) => (
                  <tr key={r.type}><td>{r.type}</td><td>{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {toast !== null && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}

      {preview !== null && (
        <section className="result" aria-label="生成レコード（スタブ）">
          <div className="card-h"><h2>提出レコード（スタブ / DB未接続）</h2></div>
          <pre className="result-json">{preview}</pre>
        </section>
      )}
    </div>
  )
}

// ── フィールド行（text/number/select/check を型に応じて描画） ──
interface FieldRowProps {
  sectionId: string
  field: FieldDef
  value: FieldValue
  violation: Violation | undefined
  onChange: (v: FieldValue) => void
}

function FieldRow({ field, value, violation, onChange }: FieldRowProps): JSX.Element {
  return (
    <div className={`field${violation !== undefined ? ' field-error' : ''}`}>
      <label className="field-label" htmlFor={`sf-${field.key}`}>
        {field.label}
        {field.required === true ? <span className="req">必須</span> : null}
      </label>
      <div className="field-control">{renderControl(field, value, onChange)}</div>
      {violation !== undefined ? (
        <p className="field-msg" role="alert">{violation.message}</p>
      ) : null}
    </div>
  )
}

function renderControl(field: FieldDef, value: FieldValue, onChange: (v: FieldValue) => void): JSX.Element {
  switch (field.type) {
    case 'number':
      return (
        <input
          id={`sf-${field.key}`}
          className="input"
          type="number"
          aria-label={field.label}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'check': {
      const on = value === true
      return (
        <button
          type="button"
          id={`sf-${field.key}`}
          className={`toggle${on ? ' toggle-on' : ''}`}
          role="switch"
          aria-checked={on}
          aria-label={field.label}
          onClick={() => onChange(!on)}
        >
          {on ? '有' : '無'}
        </button>
      )
    }
    case 'select':
      return (
        <select
          id={`sf-${field.key}`}
          className="input"
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">選択してください</option>
          {(field.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
      )
    case 'time':
      return (
        <input
          id={`sf-${field.key}`}
          className="input"
          type="time"
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
    case 'text':
      return (
        <input
          id={`sf-${field.key}`}
          className="input"
          type="text"
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
