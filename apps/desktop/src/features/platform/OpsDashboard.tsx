// [運営/TRYANGROW] 運営ダッシュボード。会社・契約・システム稼働の俯瞰。※業務指示は持たない（運営は現場業務を持たないため）。
interface Tile { n: string; l: string; cls?: string }

const TILES: Tile[] = [
  { n: '3', l: '契約会社' },
  { n: '37', l: '稼働現場' },
  { n: '451', l: '総利用者' },
  { n: '99.98%', l: '直近30日 稼働率', cls: 'la-ok' },
  { n: '1', l: '未入金', cls: 'la-bad' },
  { n: '0', l: '重大インシデント', cls: 'la-ok' },
]

const ACTIVITY = [
  { t: '2026-08-13 09:12', k: 'デプロイ', m: 'v1.4.0 を全会社へ反映（労務アラート・会社ルール）' },
  { t: '2026-08-12 22:40', k: 'メンテ', m: 'DBメンテナンス完了（影響なし）' },
  { t: '2026-08-12 15:03', k: '契約', m: '立飛セキュリティ 試用開始' },
  { t: '2026-08-11 10:20', k: 'セキュリティ', m: '依存パッケージ脆弱性スキャン: 検出0' },
]

export function OpsDashboard(): JSX.Element {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">運営ダッシュボード</h1>
        <span className="muted">TRYANGROW 運営俯瞰</span>
      </header>
      <div className="la-tiles" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
        {TILES.map((t) => (
          <div key={t.l} className={`la-tile ${t.cls ?? ''}`}>
            <div className="la-n" style={{ fontSize: t.n.length > 4 ? 20 : 30 }}>{t.n}</div>
            <div className="la-l">{t.l}</div>
          </div>
        ))}
      </div>
      <section className="card" aria-label="最近の運営アクティビティ">
        <div className="card-h"><h2>最近のアクティビティ</h2></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>日時</th><th>種別</th><th>内容</th></tr></thead>
            <tbody>
              {ACTIVITY.map((a, i) => (
                <tr key={i}><td>{a.t}</td><td><span className="status st-draft">{a.k}</span></td><td>{a.m}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
