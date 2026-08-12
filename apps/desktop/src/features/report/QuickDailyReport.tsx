import { useMemo, useState } from 'react'
import {
  buildPrefilledForm,
  createDraft,
  createSubmittedReport,
  estimateTaps,
  SubmitValidationError,
  type DailyReport,
  type FieldDef,
  type FieldValue,
  type ResolvedForm,
  type SectionDef,
  type Violation,
} from '@mamorai/input-core'
import { demoRecentReports, demoTemplate, DEMO_REPORTER_ID } from './demoData.js'

// ── 補助 ───────────────────────────────────────────────
type ValueMap = Record<string, Record<string, FieldValue>>

/** values を破壊しないための浅いクローン（section 単位でコピー）。 */
function cloneValues(src: ValueMap): ValueMap {
  const out: ValueMap = {}
  for (const [sid, fields] of Object.entries(src)) out[sid] = { ...fields }
  return out
}

/**
 * createSubmittedReport が throw する SubmitValidationError（input-core 非公開クラス）から
 * violations を取り出す。クラスは export されていないため name とプロパティで判別する。
 */
function extractViolations(e: unknown): Violation[] | null {
  return e instanceof SubmitValidationError ? e.violations : null
}

const KIND_LABEL: Record<SectionDef['kind'], string> = {
  meta: 'meta',
  table: 'table',
  counter: 'counter',
  check: 'check',
  gate: 'gate',
}

// ── コンポーネント ─────────────────────────────────────
export function QuickDailyReport(): JSX.Element {
  const template = useMemo(() => demoTemplate(), [])
  const recent = useMemo(() => demoRecentReports(), [])
  // [input-core] buildPrefilledForm: 承認済(最優先)→提出済 の直近1件で初期値をプリフィル
  const baseForm: ResolvedForm = useMemo(
    () => buildPrefilledForm(template, recent),
    [template, recent]
  )

  const [values, setValues] = useState<ValueMap>(() => cloneValues(baseForm.values))
  const [violations, setViolations] = useState<Violation[]>([])
  const [submitted, setSubmitted] = useState<DailyReport | null>(null)
  const [draft, setDraft] = useState<DailyReport | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // [input-core] estimateTaps: プリフィル済み初期値(baseForm.values)を基準に、
  // ユーザーが実際に操作したタップ数のみライブ算出（budget=10）。
  const liveForm: ResolvedForm = { ...baseForm, values }
  const tap = estimateTaps(liveForm, template, baseForm.values)

  const setValue = (sectionId: string, key: string, value: FieldValue): void => {
    setValues((prev) => {
      const next = cloneValues(prev)
      const bucket = next[sectionId] ?? {}
      bucket[key] = value
      next[sectionId] = bucket
      return next
    })
  }

  const step = (sectionId: string, field: FieldDef, delta: number): void => {
    const raw = values[sectionId]?.[field.key]
    const base = typeof raw === 'number' ? raw : typeof field.default === 'number' ? field.default : 0
    let next = base + delta
    const min = field.range?.min
    const max = field.range?.max
    if (min !== undefined && next < min) next = min
    if (max !== undefined && next > max) next = max
    setValue(sectionId, field.key, next)
  }

  const violationFor = (sectionId: string, key: string): Violation | undefined =>
    violations.find((v) => v.sectionId === sectionId && v.fieldKey === key)

  const commonArgs = () => ({
    id: `r-${new Date().toISOString().slice(0, 10)}-${Date.now()}`,
    siteId: template.siteId,
    templateId: template.id,
    reporterId: DEMO_REPORTER_ID,
    reportDate: new Date().toISOString().slice(0, 10),
    values,
  })

  const onSubmit = (): void => {
    try {
      // [input-core] createSubmittedReport: 検証通過で status='提出済' レコードを生成、違反時 throw
      const rec = createSubmittedReport({ ...commonArgs(), template })
      setViolations([])
      setSubmitted(rec)
      setDraft(null)
      setToast('提出しました（DB未接続のためスタブ表示）')
    } catch (e) {
      const vs = extractViolations(e)
      if (vs !== null) {
        setViolations(vs)
        setSubmitted(null)
        setToast(`未入力/不備が ${vs.length} 件あります`)
      } else {
        setToast('提出中に想定外のエラーが発生しました')
      }
    }
  }

  const onSaveDraft = (): void => {
    // [input-core] createDraft: 未充足でも status='下書き' で生成（ローカル保持のみ・永続化はスタブ）
    const rec = createDraft(commonArgs())
    setDraft(rec)
    setViolations([])
    setToast('下書きを保存しました（ローカルstateのみ／Supabase未接続）')
  }

  return (
    <div className="qdr">
      <header className="qdr-head">
        <h1 className="qdr-title">日報入力(簡易) — {template.name}</h1>
        <TapMeter tap={tap} />
      </header>

      <div className="qdr-actions" role="group" aria-label="日報操作">
        <button type="button" className="btn btn-secondary" aria-label="下書き保存" onClick={onSaveDraft}>
          下書き保存
        </button>
        <button type="button" className="btn btn-primary" aria-label="日報を提出" onClick={onSubmit}>
          提出
        </button>
      </div>

      {template.sections.map((section) => (
        <section key={section.id} className="card" aria-label={section.label}>
          <div className="card-h">
            <h2>{section.label}</h2>
            <span className={`badge badge-${section.kind}`}>{KIND_LABEL[section.kind]}</span>
          </div>
          <div className="card-b">
            {section.fields.map((field) => (
              <FieldRow
                key={field.key}
                sectionId={section.id}
                field={field}
                value={values[section.id]?.[field.key] ?? null}
                violation={violationFor(section.id, field.key)}
                onChange={(v) => setValue(section.id, field.key, v)}
                onStep={(d) => step(section.id, field, d)}
              />
            ))}
          </div>
        </section>
      ))}

      {toast !== null && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {(submitted !== null || draft !== null) && (
        <ResultPanel submitted={submitted} draft={draft} />
      )}
    </div>
  )
}

// ── タップ計器 ─────────────────────────────────────────
function TapMeter({ tap }: { tap: ReturnType<typeof estimateTaps> }): JSX.Element {
  return (
    <div
      className={`tap-meter${tap.withinBudget ? '' : ' tap-over'}`}
      role="status"
      aria-live="polite"
      aria-label={`現在のタップ数 ${tap.taps}、上限 ${tap.budget}`}
    >
      <span className="tap-num">{tap.taps}</span>
      <span className="tap-sep">/ {tap.budget} tap</span>
      {tap.withinBudget ? null : <span className="tap-warn">超過</span>}
    </div>
  )
}

// ── フィールド行 ───────────────────────────────────────
interface FieldRowProps {
  sectionId: string
  field: FieldDef
  value: FieldValue
  violation: Violation | undefined
  onChange: (v: FieldValue) => void
  onStep: (delta: number) => void
}

function FieldRow({ field, value, violation, onChange, onStep }: FieldRowProps): JSX.Element {
  const optional = field.required !== true
  return (
    <div className={`field${violation !== undefined ? ' field-error' : ''}`}>
      <label className="field-label" htmlFor={`f-${field.key}`}>
        {field.label}
        {optional && field.type === 'text' ? <span className="opt">任意</span> : null}
        {field.required === true ? <span className="req">必須</span> : null}
      </label>
      <div className="field-control">{renderControl(field, value, onChange, onStep)}</div>
      {violation !== undefined ? (
        <p className="field-msg" role="alert">
          {violation.message}
        </p>
      ) : null}
    </div>
  )
}

function renderControl(
  field: FieldDef,
  value: FieldValue,
  onChange: (v: FieldValue) => void,
  onStep: (delta: number) => void
): JSX.Element {
  switch (field.type) {
    case 'number': {
      const num = typeof value === 'number' ? value : 0
      return (
        <div className="counter" role="group" aria-label={`${field.label} カウンター`}>
          <button type="button" className="tap" aria-label={`${field.label}を1減らす`} onClick={() => onStep(-1)}>
            −
          </button>
          <output id={`f-${field.key}`} className="counter-val" aria-label={`${field.label} 現在値`}>
            {num}
          </output>
          <button type="button" className="tap" aria-label={`${field.label}を1増やす`} onClick={() => onStep(1)}>
            ＋
          </button>
        </div>
      )
    }
    case 'check': {
      const on = value === true
      return (
        <button
          type="button"
          id={`f-${field.key}`}
          className={`toggle${on ? ' toggle-on' : ''}`}
          role="switch"
          aria-checked={on}
          aria-label={field.label}
          onClick={() => onChange(!on)}
        >
          {on ? '済' : '未'}
        </button>
      )
    }
    case 'select':
      return (
        <select
          id={`f-${field.key}`}
          className="input"
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            選択してください
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'time':
      return (
        <input
          id={`f-${field.key}`}
          className="input"
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
    case 'text':
      return (
        <input
          id={`f-${field.key}`}
          className="input"
          type="text"
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// ── 生成レコード表示（DB未接続スタブ） ────────────────
function ResultPanel({
  submitted,
  draft,
}: {
  submitted: DailyReport | null
  draft: DailyReport | null
}): JSX.Element {
  const rec = submitted ?? draft
  if (rec === null) return <></>
  return (
    <section className="result" aria-label="生成レコード（スタブ）">
      <div className="card-h">
        <h2>{submitted !== null ? '提出レコード' : '下書きレコード'}（スタブ / DB未接続）</h2>
        <span className={`badge badge-${submitted !== null ? 'counter' : 'meta'}`}>{rec.status}</span>
      </div>
      <pre className="result-json">{JSON.stringify(rec, null, 2)}</pre>
    </section>
  )
}
