import { useMemo, useState } from 'react'
import {
  buildDelivery,
  resolveRecipients,
  type AudienceFilter,
  type Notification,
  type NotificationKind,
  type NotifyUser,
} from '@mamorai/input-core'
import {
  demoConfirmedIds,
  demoNotifications,
  demoUsers,
  ROLE_OPTIONS,
  SITE_OPTIONS,
  WORKTYPE_OPTIONS,
} from './demoNotify.js'

// [REQ-022] 通知・業務指示の作成と対象別配信。
// 対象の絞り込み（resolveRecipients）と未確認件数（buildDelivery）は
// すべて @mamorai/input-core に委譲する（配信解決を UI で再実装しない＝層分離厳守）。

const KIND_OPTIONS: NotificationKind[] = ['重要事項', '業務指示', '本部通知']
type Scope = AudienceFilter['scope']
const SCOPE_LABEL: Record<Scope, string> = {
  all: '全員',
  site: '現場',
  workType: '勤務種別',
  role: '役割',
}
const KIND_CLASS: Record<NotificationKind, string> = {
  重要事項: 'nk-imp',
  業務指示: 'nk-ops',
  本部通知: 'nk-hq',
}

export function Notifications(): JSX.Element {
  const users = useMemo<NotifyUser[]>(() => demoUsers(), [])
  const confirmed = useMemo(() => demoConfirmedIds(), [])
  const sent = useMemo(() => demoNotifications(), [])

  const [kind, setKind] = useState<NotificationKind>('業務指示')
  const [title, setTitle] = useState<string>('')
  const [body, setBody] = useState<string>('')
  const [scope, setScope] = useState<Scope>('all')
  const [siteId, setSiteId] = useState<string>(SITE_OPTIONS[0]?.id ?? 'site-bht')
  const [role, setRole] = useState<string>(ROLE_OPTIONS[0] ?? '警備員')
  const [workType, setWorkType] = useState<string>(WORKTYPE_OPTIONS[0] ?? '日勤')

  // 入力から AudienceFilter を組み立てる（UI 都合の組立のみ。判定は input-core）。
  const target = useMemo<AudienceFilter>(() => {
    switch (scope) {
      case 'site':
        return { scope, siteId }
      case 'role':
        return { scope, role }
      case 'workType':
        return { scope, workType }
      default:
        return { scope: 'all' }
    }
  }, [scope, siteId, role, workType])

  // プレビュー対象の通知（作成中フォームの内容）。
  const previewNotification = useMemo<Notification>(
    () => ({ id: 'preview', kind, title: title || '(件名未入力)', body, target }),
    [kind, title, body, target],
  )

  // [input-core] resolveRecipients: 対象に一致する利用者のみ（誤配信防止）
  const recipients = useMemo(
    () => resolveRecipients(previewNotification, users),
    [previewNotification, users],
  )
  // [input-core] buildDelivery: 対象数・確認済・未確認件数の集計
  const delivery = useMemo(
    () => buildDelivery(previewNotification, users, confirmed),
    [previewNotification, users, confirmed],
  )

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">お知らせ・業務指示</h1>
        <span className="muted">対象別配信 / 未確認集計は @mamorai/input-core</span>
      </header>

      {/* 通知作成フォーム */}
      <section className="card" aria-label="通知作成">
        <div className="card-h">
          <h2>新規作成</h2>
        </div>
        <div className="card-b">
          <label className="fl">
            種別
            <select className="input" aria-label="通知種別" value={kind} onChange={(e) => setKind(e.target.value as NotificationKind)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="fl">
            件名
            <input className="input" aria-label="件名" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 事前精算機の釣銭確認" />
          </label>
          <label className="fl">
            本文
            <input className="input" aria-label="本文" value={body} onChange={(e) => setBody(e.target.value)} placeholder="指示内容" />
          </label>
          <label className="fl">
            配信対象
            <select className="input" aria-label="配信対象スコープ" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          {scope === 'site' && (
            <label className="fl">
              現場
              <select className="input" aria-label="対象現場" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {SITE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scope === 'role' && (
            <label className="fl">
              役割
              <select className="input" aria-label="対象役割" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scope === 'workType' && (
            <label className="fl">
              勤務種別
              <select className="input" aria-label="対象勤務種別" value={workType} onChange={(e) => setWorkType(e.target.value)}>
                {WORKTYPE_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {/* 配信プレビュー（対象・未確認） */}
      <section className="metrics" aria-label="配信サマリー">
        <div className="metric">
          <span className="metric-label">配信対象</span>
          <span className="metric-value">{delivery.recipientIds.length} 名</span>
        </div>
        <div className="metric metric-g">
          <span className="metric-label">確認済</span>
          <span className="metric-value">{delivery.confirmedIds.length} 名</span>
        </div>
        <div className="metric metric-am">
          <span className="metric-label">未確認</span>
          <span className="metric-value">{delivery.unconfirmed} 名</span>
        </div>
      </section>

      <section className="card" aria-label="対象プレビュー">
        <div className="card-h">
          <h2>対象プレビュー（{SCOPE_LABEL[scope]}）</h2>
        </div>
        <div className="card-b">
          {recipients.length === 0 ? (
            <p className="muted">対象に一致する利用者がいません（条件を見直してください）。</p>
          ) : (
            <ul className="recipient-list">
              {recipients.map((u) => (
                <li key={u.id} className="recipient">
                  <span className="recipient-id">{u.id}</span>
                  <span className="muted">
                    {u.siteId} / {u.role} / {u.workType}
                  </span>
                  {delivery.confirmedIds.includes(u.id) ? (
                    <span className="status st-approved">確認済</span>
                  ) : (
                    <span className="status st-submitted">未確認</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 発信済み一覧 */}
      <section className="card" aria-label="発信済み通知">
        <div className="card-h">
          <h2>重要事項・業務指示</h2>
        </div>
        <div className="card-b">
          {sent.map((n) => (
            <SentRow key={n.id} notification={n} users={users} />
          ))}
        </div>
      </section>
    </div>
  )
}

function SentRow({ notification, users }: { notification: Notification; users: NotifyUser[] }): JSX.Element {
  // 発信済み各件も input-core で対象数を再計算（一貫性の担保）。
  const count = resolveRecipients(notification, users).length
  const scopeText =
    notification.target.scope === 'all'
      ? '全員'
      : notification.target.scope === 'site'
        ? `現場 ${notification.target.siteId ?? ''}`
        : notification.target.scope === 'workType'
          ? `勤務 ${notification.target.workType ?? ''}`
          : `役割 ${notification.target.role ?? ''}`
  return (
    <div className="notif-item">
      <span className={`notif-kind ${KIND_CLASS[notification.kind]}`}>{notification.kind}</span>
      <div className="notif-info">
        <div className="notif-title">{notification.title}</div>
        <div className="notif-meta">
          {notification.createdBy ?? '—'} — 対象: {scopeText}（{count}名）
        </div>
        {notification.body != null && notification.body !== '' && (
          <div className="notif-body">{notification.body}</div>
        )}
      </div>
    </div>
  )
}
