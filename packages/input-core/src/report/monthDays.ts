// [REQ-009][REQ-012] 月の日数算出・当月各日の 'YYYY-MM-DD' 生成（純粋・ロケール非依存）
// UTC 固定で現在時刻に依存しない。内部ヘルパ（公開APIではない）。

/** [REQ-009] 'YYYY-MM' から当月の日数を返す（28/29/30/31、うるう年対応） */
export function daysInMonth(month: string): number {
  const parts = month.split('-')
  const year = Number(parts[0])
  const mon = Number(parts[1])
  return new Date(Date.UTC(year, mon, 0)).getUTCDate()
}

/** [REQ-009] 'YYYY-MM' から当月各日の 'YYYY-MM-DD' 昇順配列を返す */
export function monthDates(month: string): string[] {
  const days = daysInMonth(month)
  const dates: string[] = []
  for (let d = 1; d <= days; d++) {
    dates.push(`${month}-${String(d).padStart(2, '0')}`)
  }
  return dates
}
