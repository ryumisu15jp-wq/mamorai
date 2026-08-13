// [運営/TRYANGROW] お知らせ配信。各会社へ「バージョン/セキュリティ/メンテナンス」の情報を共有（デモ:ローカル状態）。
import { useState } from 'react'

type Kind = 'バージョン' | 'セキュリティ' | 'メンテナンス'
interface Notice { id: string; kind: Kind; title: string; body: string; date: string; target: string }

const SEED: Notice[] = [
  { id: 'n1', kind: 'バージョン', title: 'v1.4.0 リリース', body: '労務アラート・会社ルール設定を追加しました。', date: '2026-08-13', target: '全社' },
  { id: 'n2', kind: 'メンテナンス', title: '定期メンテナンス実施', body: '8/18 2:00-3:00 にDBメンテを実施します（影響軽微）。', date: '2026-08-12', target: '全社' },
  { id: 'n3', kind: 'セキュリティ', title: 'パスワードポリシー強化', body: '運営アカウントのMFAを必須化しました。', date: '2026-08-10', target: '全社' },
]
const kindCls = (k: Kind): string => (k === 'セキュリティ' ? 'st-rejected' : k === 'メンテナンス' ? 'st-submitted' : 'st-approved')

export function PlatformNotice(): JSX.Element {
  const [rows, setRows] = useState<Notice[]>(SEED)
  const [kind, setKind] = useState<Kind>('バージョン')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [target, setTarget] = useState('全社')
  const [toast, setToast] = useState<string | null>(null)

  const send = (): void => {
    if (title === '') { setToast('タイトルを入力してください'); return }
    setRows((p) => [{ id: `n-${p.length + 1}`, kind, title, body, date: '2026-08-13', target }, ...p])
    setTitle(''); setBody('')
    setToast(`「${kind}」のお知らせを${target}へ配信しました`)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">お知らせ配信</h1>
        <span className="muted">各会社へ バージョン / セキュリティ / メンテナンス を共有</span>
      </header>

      <section className="card" aria-label="お知らせ作成">
        <div className="card-h"><h2>新規お知らせ</h2></div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">種別
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option>バージョン</option><option>セキュリティ</option><option>メンテナンス</option>
              </select>
            </label>
            <label className="fl">配信先
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option>全社</option><option>三角警備保障</option><option>立飛セキュリティ</option><option>ミライ警備</option>
              </select>
            </label>
            <label className="fl" style={{ flex: 1 }}>タイトル<input className="input" style={{ maxWidth: 'none' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: v1.5.0 リリース" /></label>
          </div>
          <label className="fl">本文<textarea className="input" style={{ maxWidth: 'none', minHeight: 72 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="内容を記載" /></label>
          <div className="row-actions"><button type="button" className="btn btn-primary" onClick={send}>配信する</button></div>
        </div>
      </section>

      <section className="card" aria-label="配信履歴">
        <div className="card-h"><h2>配信履歴</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>日付</th><th>種別</th><th>タイトル</th><th>配信先</th></tr></thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id}>
                  <td>{n.date}</td><td><span className={`status ${kindCls(n.kind)}`}>{n.kind}</span></td>
                  <td>{n.title}<div className="muted">{n.body}</div></td><td>{n.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
