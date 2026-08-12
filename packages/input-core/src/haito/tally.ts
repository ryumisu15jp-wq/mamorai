// [S6-あ] 対応記録の種別から件数タリーを自動集計（純粋・UI/DB非依存）
export interface TallyRow { type: string; count: number }

/**
 * [S6-あ] 対応記録の incidentType ごとに件数を集計する。
 * 空文字/未設定(undefined)の incidentType は集計対象外。
 * 並びは件数降順、同数なら種別（type）昇順で安定化。空配列は [] を返す。
 */
export function tallyResponsesByType(
  responses: Array<{ incidentType?: string }>,
): TallyRow[] {
  const counts = new Map<string, number>()
  for (const r of responses) {
    const t = r.incidentType
    if (t === undefined || t === '') continue
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (b.count - a.count) || a.type.localeCompare(b.type))
}
