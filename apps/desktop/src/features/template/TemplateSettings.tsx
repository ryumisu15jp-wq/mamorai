import { useMemo, useState } from 'react'
import {
  applyTemplateConfig,
  resolveForm,
  listSitePresetKinds,
  getSitePreset,
  type ResolvedForm,
  type SectionDef,
  type TemplateConfig,
} from '@mamorai/input-core'
import { demoTemplate } from '../report/demoData.js'

// [REQ-024] テンプレート設定によるセクション ON/OFF。
// セクションの有効化反映（applyTemplateConfig）とフォーム解決（resolveForm）は
// @mamorai/input-core に委譲する（ON/OFF 適用を UI で再実装しない＝層分離厳守）。

const KIND_LABEL: Record<SectionDef['kind'], string> = {
  meta: 'meta',
  table: 'table',
  counter: 'counter',
  check: 'check',
  gate: 'gate',
}

export function TemplateSettings(): JSX.Element {
  const template = useMemo(() => demoTemplate(), [])

  // OFF にしたセクション ID の集合（UI 状態）。判定・適用は input-core。
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set())

  // [S6-い] 現場が設定で追加したセクション（巡回/点検/特記/継続不具合 …）。追加のみ・非破壊。
  const [extra, setExtra] = useState<SectionDef[]>([])
  const presetKinds = useMemo(() => listSitePresetKinds(), [])
  const addedKinds = useMemo(() => new Set(extra.map((s) => s.id)), [extra])

  const addPreset = (kind: string): void => {
    const sec = getSitePreset(kind)
    setExtra((prev) => (prev.some((s) => s.id === sec.id) ? prev : [...prev, sec]))
  }
  const removeExtra = (id: string): void => {
    setExtra((prev) => prev.filter((s) => s.id !== id))
    setDisabled((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const config = useMemo<TemplateConfig>(
    () => ({ siteId: template.siteId, disabledSectionIds: [...disabled], extraSections: extra }),
    [template.siteId, disabled, extra],
  )

  // [input-core] applyTemplateConfig: 非破壊で enabled=false を付与した新テンプレート
  const applied = useMemo(() => applyTemplateConfig(template, config), [template, config])
  // [input-core] resolveForm: enabled!==false のセクションだけの描画用フォーム
  const form: ResolvedForm = useMemo(() => resolveForm(applied), [applied])
  const visibleIds = useMemo(() => new Set(form.sections.map((s) => s.id)), [form])

  const toggle = (id: string): void => {
    setDisabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">テンプレート設定</h1>
        <span className="muted">
          {template.name} / ON/OFF 反映は @mamorai/input-core
        </span>
      </header>

      <p className="tpl-note">
        セクションを OFF にすると日報入力フォームから即時に消えます。
        <strong> 過去の日報データ・集計は変更されません</strong>（非破壊。applyTemplateConfig は元テンプレートを複製します）。
      </p>

      {/* [S6-い] 現場セクションの追加（現場ごとに巡回/点検/特記/継続不具合 等が異なるため設定で追加） */}
      <section className="card" aria-label="現場セクションの追加">
        <div className="card-h">
          <h2>現場セクションの追加</h2>
          <span className="muted">現場ごとに異なる項目を設定で追加（追加のみ・非破壊）</span>
        </div>
        <div className="card-b">
          <div className="tpl-preset-picker">
            {presetKinds.map((kind) => {
              const sec = getSitePreset(kind)
              const added = addedKinds.has(sec.id)
              return (
                <button
                  key={kind}
                  type="button"
                  className={`chip${added ? ' chip-on' : ''}`}
                  aria-pressed={added}
                  disabled={added}
                  onClick={() => addPreset(kind)}
                >
                  ＋ {kind}
                </button>
              )
            })}
          </div>
          {extra.length > 0 && (
            <ul className="tpl-extra-list">
              {extra.map((s) => (
                <li key={s.id} className="tpl-extra-row">
                  <span className={`badge badge-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  <span className="tpl-toggle-label">{s.label}</span>
                  <span className="muted">（{s.fields.length} 項目）</span>
                  <button type="button" className="btn-link danger" onClick={() => removeExtra(s.id)}>
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* セクション ON/OFF トグル（既存＋現場追加セクション） */}
      <section className="card" aria-label="セクション設定">
        <div className="card-h">
          <h2>セクション ON / OFF</h2>
        </div>
        <div className="card-b">
          {applied.sections.map((s) => {
            const on = !disabled.has(s.id)
            const isExtra = addedKinds.has(s.id)
            return (
              <div key={s.id} className="tpl-toggle-row">
                <div className="tpl-toggle-info">
                  <span className={`badge badge-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  <span className="tpl-toggle-label">{s.label}</span>
                  {isExtra && <span className="status st-ok">現場追加</span>}
                  <span className="muted">（{s.fields.length} 項目）</span>
                </div>
                <button
                  type="button"
                  className={`switch${on ? ' switch-on' : ''}`}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${s.label} を${on ? 'OFFにする' : 'ONにする'}`}
                  onClick={() => toggle(s.id)}
                >
                  <span className="switch-knob" />
                  <span className="switch-text">{on ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* 入力フォームプレビュー（OFF セクションが消えることを即時表示） */}
      <section className="card" aria-label="入力フォームプレビュー">
        <div className="card-h">
          <h2>日報入力フォーム プレビュー（resolveForm 結果）</h2>
        </div>
        <div className="card-b">
          {applied.sections.map((s) => {
            const shown = visibleIds.has(s.id)
            return (
              <div key={s.id} className={`tpl-preview-section${shown ? '' : ' tpl-hidden'}`}>
                <div className="tpl-preview-head">
                  <span className={`badge badge-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  <strong>{s.label}</strong>
                  {!shown && <span className="status st-missing">非表示</span>}
                </div>
                {shown && (
                  <ul className="tpl-preview-fields">
                    {s.fields.map((f) => (
                      <li key={f.key}>
                        {f.label}
                        <span className="muted"> ({f.type})</span>
                        {f.required && <span className="req">必須</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <p className="muted">
            表示中セクション: {form.sections.length} / {applied.sections.length}
            {extra.length > 0 && `（うち現場追加 ${extra.length}）`}
          </p>
        </div>
      </section>
    </div>
  )
}
