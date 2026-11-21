// 下部タブ用の線アイコン（単色・線の太さ統一。色は親の color に従う）
import type { ReactElement } from 'react'

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Svg({ children }: { children: ReactElement | ReactElement[] }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" {...P}>{children}</svg>
}

export type TabIcon = 'jyoban' | 'hope' | 'leave' | 'training' | 'notice'

export function TabIconSvg({ name }: { name: TabIcon }) {
  switch (name) {
    case 'jyoban': // 現場の地点
      return <Svg><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.25" /></Svg>
    case 'hope': // カレンダー
      return <Svg><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>
    case 'leave': // 有給（日付に確認の印）
      return <Svg><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M9 14.5l2 2 4-4.5M8.5 3.5v4M15.5 3.5v4" /></Svg>
    case 'training': // 講習会（書類）
      return <Svg><path d="M7 3.5h7.5L19 8v12.5H7z" /><path d="M14.5 3.5V8H19M9.5 12.5h6M9.5 16h6" /></Svg>
    case 'notice': // お知らせ（ベル）
      return <Svg><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Svg>
  }
}

/** ヘッダー右上の設定（歯車） */
export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" {...P}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20.8a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3.2a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3.2a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1h.1a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  )
}

/** 設定メニューの項目アイコン（線画・単色） */
export type MenuIcon = 'basic' | 'address' | 'contact' | 'career' | 'requests' | 'account'
export function MenuIconSvg({ name }: { name: MenuIcon }) {
  const sv = (c: ReactElement | ReactElement[]) => <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false" {...P}>{c}</svg>
  switch (name) {
    case 'basic': // 身分証
      return sv(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 9.5h4.5M14 12.5h4.5" /></>)
    case 'address': // 家
      return sv(<><path d="M4 11l8-6.5 8 6.5" /><path d="M6 10v9h12v-9M10 19v-5h4v5" /></>)
    case 'contact': // 電話
      return sv(<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 4.7 4.7l1.3-2 4 1.5v3a2 2 0 0 1-2 2A14.5 14.5 0 0 1 4.5 6a2 2 0 0 1 2-2z" />)
    case 'career': // 書類
      return sv(<><path d="M7 3.5h7.5L19 8v12.5H7z" /><path d="M14.5 3.5V8H19M9.5 12.5h6M9.5 16h6" /></>)
    case 'requests': // 確認
      return sv(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.3l2.5 2.5 4.5-5" /></>)
    case 'account': // 鍵
      return sv(<><circle cx="8.5" cy="14.5" r="3.5" /><path d="M11 12l8-8M16 7l2.5 2.5" /></>)
  }
}
