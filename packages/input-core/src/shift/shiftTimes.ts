// [REQ-018/019] 勤務区分→勤務時刻の既定マップと勤務間隔(労基インターバル)算出（純粋・決定論）
// 日付は 'YYYY-MM-DD'、時刻は 'HH:MM' 文字列で扱う。非決定API(現在時刻・乱数)は使わない。
import type { WorkType, ShiftTime } from '../types.js'
import { toEpochDay } from './constraints.js'

/**
 * [REQ-018/019] WorkType→勤務時刻の既定マップ。
 * 勤務のない区分（公休/明休/有給/欠勤）は未登録（=勤務なし）。
 */
export const DEFAULT_SHIFT_TIMES: Record<string, ShiftTime> = {
  日勤: { start: '09:00', end: '18:00' },
  夜勤: { start: '21:00', end: '09:00', crossesMidnight: true },
  当務: { start: '08:00', end: '09:00', crossesMidnight: true }, // 25h勤務(いわゆる当務)
  研修: { start: '09:00', end: '17:00' },
}

/** [REQ-018/019] WorkType の勤務時刻を引く（上書き→既定の順）。勤務なしは undefined。 */
export function getShiftTime(
  workType: WorkType,
  overrides?: Record<WorkType, ShiftTime>,
): ShiftTime | undefined {
  if (overrides !== undefined) {
    const o = overrides[workType]
    if (o !== undefined) return o
  }
  return DEFAULT_SHIFT_TIMES[workType]
}

/** [労務] WorkType の勤務時間(h)。勤務なし区分は0。crossesMidnight は +24h。 */
export function shiftDurationHours(wt: WorkType, overrides?: Record<WorkType, ShiftTime>): number {
  const st = getShiftTime(wt, overrides)
  if (st === undefined) return 0
  const d = parseHm(st.end) + (st.crossesMidnight === true ? 24 : 0) - parseHm(st.start)
  return Number.isFinite(d) && d > 0 ? d : 0
}

/** 'HH:MM' → 時（小数）。'21:30'→21.5。不正値は NaN。 */
export function parseHm(hm: string): number {
  const h = Number(hm.slice(0, 2))
  const m = Number(hm.slice(3, 5))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.NaN
  return h + m / 60
}

/**
 * [REQ-018/019] 連続する2つの勤務(aDate,aType)→(bDate,bType) 間のインターバル時間(h)を返す。
 * - 日付が隣接（|epoch差|===1）でなければ undefined（連続割当日のみ判定対象）。
 * - どちらかが勤務なし（時刻未定義）なら undefined。
 * - 早い日の勤務終了 → 遅い日の勤務開始 の実時間差を算出する（crossesMidnight を考慮）。
 */
export function restIntervalHours(
  aDate: string,
  aType: WorkType,
  bDate: string,
  bType: WorkType,
  overrides?: Record<WorkType, ShiftTime>,
): number | undefined {
  const ea = toEpochDay(aDate)
  const eb = toEpochDay(bDate)
  if (Math.abs(ea - eb) !== 1) return undefined
  // 早い日=prev / 遅い日=next に正規化。
  const prevIsA = ea < eb
  const prevType = prevIsA ? aType : bType
  const nextType = prevIsA ? bType : aType
  const prev = getShiftTime(prevType, overrides)
  const next = getShiftTime(nextType, overrides)
  if (prev === undefined || next === undefined) return undefined
  // prev の勤務終了を「prev日0時」からの経過時間で表す。crossesMidnight は +24h。
  const prevEnd = parseHm(prev.end) + (prev.crossesMidnight === true ? 24 : 0)
  // next の勤務開始は「prev日0時」から見て +24h した位置。
  const nextStart = 24 + parseHm(next.start)
  if (!Number.isFinite(prevEnd) || !Number.isFinite(nextStart)) return undefined
  return nextStart - prevEnd
}
