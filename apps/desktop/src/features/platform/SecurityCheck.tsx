// [運営/TRYANGROW] セキュリティチェック。プラットフォームのセキュリティ状態を点検・可視化（デモ）。
interface Item { name: string; desc: string; status: 'OK' | '注意' | '要対応' }

const ITEMS: Item[] = [
  { name: 'テナント分離（RLS）', desc: '全18テナント表でRLS有効・越境0を検証済み', status: 'OK' },
  { name: '運営MFA', desc: '運営アカウントはMFA必須', status: 'OK' },
  { name: 'サービスロール鍵の秘匿', desc: 'service_role/Claude鍵はサーバ限定・フロント非露出', status: 'OK' },
  { name: '通信の暗号化(HTTPS)', desc: '全ドメインでTLS・cleartext無効', status: 'OK' },
  { name: '依存パッケージ脆弱性', desc: '直近スキャン検出0（週次）', status: 'OK' },
  { name: 'バックアップ', desc: 'DB日次バックアップ・7日保持', status: '注意' },
  { name: 'アクセスログ監査', desc: '管理操作の監査ログ（運営代理ログイン含む）', status: '注意' },
  { name: 'パスワードポリシー', desc: '会社=8文字以上 / 運営=12文字以上', status: 'OK' },
]

const cls = (s: Item['status']): string => (s === 'OK' ? 'st-approved' : s === '注意' ? 'st-submitted' : 'st-rejected')

export function SecurityCheck(): JSX.Element {
  const ok = ITEMS.filter((i) => i.status === 'OK').length
  const warn = ITEMS.filter((i) => i.status === '注意').length
  const bad = ITEMS.filter((i) => i.status === '要対応').length
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">セキュリティチェック</h1>
        <span className="muted">プラットフォームのセキュリティ点検</span>
      </header>
      <div className="la-tiles">
        <div className="la-tile la-ok"><div className="la-n">{ok}</div><div className="la-l">OK</div></div>
        <div className={`la-tile ${warn > 0 ? 'la-warn' : 'la-ok'}`}><div className="la-n">{warn}</div><div className="la-l">注意</div></div>
        <div className={`la-tile ${bad > 0 ? 'la-bad' : 'la-ok'}`}><div className="la-n">{bad}</div><div className="la-l">要対応</div></div>
        <div className="la-tile"><div className="la-n">{Math.round((ok / ITEMS.length) * 100)}%</div><div className="la-l">健全度</div></div>
      </div>
      <section className="card" aria-label="点検項目">
        <div className="card-h"><h2>点検項目</h2><span className="muted">{ITEMS.length} 項目</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>項目</th><th>内容</th><th>状態</th></tr></thead>
            <tbody>
              {ITEMS.map((i) => (
                <tr key={i.name}><td>{i.name}</td><td className="muted">{i.desc}</td><td><span className={`status ${cls(i.status)}`}>{i.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
