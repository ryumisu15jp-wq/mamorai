// ★RYUGEN要望の中核: 制約を追加・編集・有効無効化できるエディタ。
// カテゴリ(legal/insurance/company/shift/other＋自由入力)、hard/soft、kind(組込み＋独自)、
// params、weight、source(根拠)、active を編集し、OptimizationContext.constraints として保持する。
// 制約の「評価」自体は input-core(evaluateConstraints) が行う。ここは編集UIのみ（層分離厳守）。
import { useMemo, useState } from 'react'
import { getRegisteredKinds, type ConstraintDef, type ConstraintSeverity } from '@mamorai/input-core'

interface Props {
  constraints: ConstraintDef[]
  onChange: (next: ConstraintDef[]) => void
}

/** 組込みカテゴリ（＋その他は自由入力で独自カテゴリを許容）。 */
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'legal', label: '国/労基 (legal)' },
  { value: 'insurance', label: '保険 (insurance)' },
  { value: 'company', label: '会社 (company)' },
  { value: 'shift', label: '勤務条件 (shift)' },
  { value: 'other', label: 'その他 (other)' },
]

/** 組込み kind の日本語ラベル。custom は独自 kind 文字列。 */
const KIND_LABELS: Record<string, string> = {
  qualification_required: '資格必須',
  min_rest_hours: '勤務間隔',
  max_consecutive_days: '連勤上限',
  max_weekly_hours: '週労働時間',
  required_headcount: '必要人数',
  day_off_request: '希望休',
  insurance_weekly_hours: '社保加入',
  custom_flag: 'カスタム',
}

/** kind → params 入力スキーマ（未定義 kind は JSON テキストで自由入力）。 */
const PARAM_SCHEMA: Record<string, { key: string; label: string; type: 'text' | 'number' }[]> = {
  qualification_required: [
    { key: 'position', label: 'ポジション', type: 'text' },
    { key: 'qualification', label: '必要資格', type: 'text' },
  ],
  min_rest_hours: [{ key: 'hours', label: '間隔(時間)', type: 'number' }],
  max_consecutive_days: [{ key: 'days', label: '連勤上限(日)', type: 'number' }],
  max_weekly_hours: [
    { key: 'hours', label: '週上限(時間)', type: 'number' },
    { key: 'hoursPerShift', label: '1勤務(時間)', type: 'number' },
  ],
  required_headcount: [
    { key: 'position', label: 'ポジション', type: 'text' },
    { key: 'count', label: '必要人数', type: 'number' },
  ],
  day_off_request: [
    { key: 'staffId', label: 'スタッフID', type: 'text' },
    { key: 'date', label: '日付(YYYY-MM-DD)', type: 'text' },
  ],
  insurance_weekly_hours: [
    { key: 'thresholdHours', label: '加入閾値(週時間)', type: 'number' },
    { key: 'hoursPerShift', label: '1勤務(時間)', type: 'number' },
  ],
  custom_flag: [
    { key: 'rule', label: 'ルール名', type: 'text' },
    { key: 'staffId', label: 'スタッフID', type: 'text' },
    { key: 'position', label: 'ポジション', type: 'text' },
  ],
}

interface Draft {
  category: string
  customCategory: string
  severity: ConstraintSeverity
  kind: string
  customKind: string
  params: Record<string, string>
  rawParams: string
  weight: string
  source: string
  label: string
}

const EMPTY_DRAFT: Draft = {
  category: 'legal', customCategory: '', severity: 'hard',
  kind: 'required_headcount', customKind: '', params: {}, rawParams: '{}',
  weight: '1', source: '', label: '',
}

/** Draft.params(文字列) を型付き params へ写像（number スキーマは数値化）。 */
function buildParams(draft: Draft): Record<string, unknown> {
  const schema = PARAM_SCHEMA[draft.kind]
  if (schema === undefined) {
    // 独自 kind: JSON テキストをそのまま採用（不正なら空）。
    try {
      const parsed = JSON.parse(draft.rawParams) as unknown
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  const out: Record<string, unknown> = {}
  for (const f of schema) {
    const v = draft.params[f.key] ?? ''
    if (v === '') continue
    out[f.key] = f.type === 'number' ? Number(v) : v
  }
  return out
}

export function ConstraintEditor({ constraints, onChange }: Props): JSX.Element {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  // getRegisteredKinds(): 評価器が存在する kind の一覧（選択肢補助＝評価可能バッジに使う）。
  const registeredKinds = useMemo(() => new Set(getRegisteredKinds()), [])
  // 選択肢に出す kind（組込み全て＋レジストリ由来の未知 kind）。
  const kindOptions = useMemo(() => {
    const set = new Set<string>([...Object.keys(KIND_LABELS), ...registeredKinds])
    return [...set]
  }, [registeredKinds])

  function toggleActive(id: string): void {
    onChange(constraints.map((c) => (c.id === id ? { ...c, active: c.active === false } : c)))
  }
  function remove(id: string): void {
    onChange(constraints.filter((c) => c.id !== id))
  }
  function updateWeight(id: string, weight: number): void {
    onChange(constraints.map((c) => (c.id === id ? { ...c, weight } : c)))
  }

  function add(): void {
    const category = draft.category === '__custom' ? draft.customCategory.trim() : draft.category
    const kind = draft.kind === '__custom' ? draft.customKind.trim() : draft.kind
    if (category === '' || kind === '') return
    const def: ConstraintDef = {
      id: `c-${Date.now()}`,
      category,
      severity: draft.severity,
      kind,
      params: buildParams(draft),
      label: draft.label.trim() === '' ? `${KIND_LABELS[kind] ?? kind} 制約` : draft.label.trim(),
      active: true,
    }
    if (draft.severity === 'soft') def.weight = Number(draft.weight) || 1
    if (draft.source.trim() !== '') def.source = draft.source.trim()
    onChange([...constraints, def])
    setDraft(EMPTY_DRAFT)
  }

  const schema = PARAM_SCHEMA[draft.kind]

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">制約エディタ</h1>
        <span className="muted">
          国/保険/会社/勤務条件/その他 の制約を自由に追加できます（{constraints.length} 件）
        </span>
      </header>

      {/* 追加フォーム */}
      <section className="card" aria-label="制約を追加">
        <div className="card-h"><h2>制約を追加</h2></div>
        <div className="card-b">
          <div className="ce-form">
            <label className="fl">
              カテゴリ
              <select className="input" aria-label="カテゴリ" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                <option value="__custom">独自カテゴリ…</option>
              </select>
            </label>
            {draft.category === '__custom' && (
              <label className="fl">
                独自カテゴリ名
                <input className="input" aria-label="独自カテゴリ名" value={draft.customCategory} onChange={(e) => setDraft({ ...draft, customCategory: e.target.value })} placeholder="例: 現場ルール" />
              </label>
            )}
            <label className="fl">
              強制度
              <select className="input" aria-label="強制度" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as ConstraintSeverity })}>
                <option value="hard">hard（絶対）</option>
                <option value="soft">soft（なるべく）</option>
              </select>
            </label>
            <label className="fl">
              種別(kind)
              <select className="input" aria-label="種別kind" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {kindOptions.map((k) => (
                  <option key={k} value={k}>
                    {(KIND_LABELS[k] ?? k)}{registeredKinds.has(k) ? '（評価可）' : ''}
                  </option>
                ))}
                <option value="__custom">独自kind…</option>
              </select>
            </label>
            {draft.kind === '__custom' && (
              <label className="fl">
                独自kind文字列
                <input className="input" aria-label="独自kind" value={draft.customKind} onChange={(e) => setDraft({ ...draft, customKind: e.target.value })} placeholder="例: night_pair_rule" />
              </label>
            )}
            {draft.severity === 'soft' && (
              <label className="fl">
                weight（重み）
                <input className="input" type="number" aria-label="weight" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} />
              </label>
            )}
            <label className="fl">
              根拠(source)
              <input className="input" aria-label="根拠source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="例: 労働基準法第32条" />
            </label>
            <label className="fl">
              ラベル
              <input className="input" aria-label="ラベル" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="例: 週労働40時間以内" />
            </label>
          </div>

          {/* params 入力（kind スキーマに応じて動的） */}
          <div className="ce-params">
            <span className="muted">パラメータ（params）</span>
            {schema !== undefined ? (
              <div className="ce-form">
                {schema.map((f) => (
                  <label key={f.key} className="fl">
                    {f.label}
                    <input
                      className="input"
                      type={f.type === 'number' ? 'number' : 'text'}
                      aria-label={f.label}
                      value={draft.params[f.key] ?? ''}
                      onChange={(e) => setDraft({ ...draft, params: { ...draft.params, [f.key]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <label className="fl">
                params(JSON)
                <input className="input" aria-label="paramsJSON" value={draft.rawParams} onChange={(e) => setDraft({ ...draft, rawParams: e.target.value })} placeholder='{"key":"value"}' />
              </label>
            )}
          </div>

          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={add}>制約を追加</button>
          </div>
        </div>
      </section>

      {/* 制約リスト */}
      <section className="card" aria-label="制約リスト">
        <div className="card-h"><h2>登録済みの制約</h2></div>
        <div className="card-b">
          {constraints.length === 0 ? (
            <p className="muted">制約がありません。上のフォームから追加してください。</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>有効</th><th>カテゴリ</th><th>強制</th><th>kind</th><th>ラベル / 根拠</th><th className="num">weight</th><th></th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((c) => {
                  const off = c.active === false
                  return (
                    <tr key={c.id} className={off ? 'row-missing' : undefined}>
                      <td>
                        <button
                          type="button"
                          className={`toggle${off ? '' : ' toggle-on'}`}
                          aria-pressed={!off}
                          aria-label={`${c.label} を${off ? '有効化' : '無効化'}`}
                          onClick={() => toggleActive(c.id)}
                        >
                          {off ? 'OFF' : 'ON'}
                        </button>
                      </td>
                      <td><span className={`ce-cat ce-cat-${c.category}`}>{c.category}</span></td>
                      <td>
                        <span className={`status ${c.severity === 'hard' ? 'st-rejected' : 'st-submitted'}`}>{c.severity}</span>
                      </td>
                      <td>{KIND_LABELS[c.kind] ?? c.kind}</td>
                      <td>
                        <div>{c.label}</div>
                        {c.source !== undefined && <div className="muted">{c.source}</div>}
                      </td>
                      <td className="num">
                        {c.severity === 'soft' ? (
                          <input
                            className="input ce-weight"
                            type="number"
                            aria-label={`${c.label} の weight`}
                            value={c.weight ?? 1}
                            onChange={(e) => updateWeight(c.id, Number(e.target.value) || 1)}
                          />
                        ) : '—'}
                      </td>
                      <td>
                        <button type="button" className="btn-sm btn-reject" onClick={() => remove(c.id)} aria-label={`${c.label} を削除`}>削除</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
