// Node/Express シフト最適化ゲートウェイ宛のデータアダプタ。
// AI/秘匿系(Claude)・重い最適化は必ずこのサーバ経由（キーはサーバ側にのみ存在）。
// サーバ未起動時は input-core をブラウザ内で直接呼ぶローカルフォールバックで画面を止めない。
import {
  parseConstraintsFromLLM,
  generateDraft,
  createOptimizationRun,
  confirmOptimizationRun,
  applyConfirmedRun,
  type ConstraintDef,
  type OptimizationContext,
  type OptimizationRun,
  type Actor,
  type ShiftCell,
} from '@mamorai/input-core'
import { SHIFT_API_DEFAULT_BASE } from './demoShift.js'

function readBase(): string {
  const base = import.meta.env.VITE_SHIFT_API_BASE
  return typeof base === 'string' && base !== '' ? base : SHIFT_API_DEFAULT_BASE
}

export interface GatewayResult<T> {
  data: T
  /** サーバ経由か、ローカルフォールバックか。 */
  fromFallback: boolean
  note: string
}

/**
 * POST /api/shift/structure（NL→制約）。
 * サーバ未起動時はブラウザ内モック（キーワード抽出）→ parseConstraintsFromLLM でローカル整形。
 */
export async function structureConstraints(text: string): Promise<GatewayResult<ConstraintDef[]>> {
  try {
    const res = await fetch(`${readBase()}/api/shift/structure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const body = (await res.json()) as { constraints: ConstraintDef[] }
    return { data: body.constraints, fromFallback: false, note: `ゲートウェイ（${readBase()}）で構造化。` }
  } catch {
    // ローカルフォールバック: 整形は必ず parseConstraintsFromLLM（UI で再実装しない）。
    const raw = localMockStructure(text)
    return { data: parseConstraintsFromLLM(raw), fromFallback: true, note: 'サーバ未起動のためローカル構造化(デモ)。' }
  }
}

/**
 * POST /api/shift/optimize（制約→下案）。
 * サーバ未起動時はブラウザ内で generateDraft を直接呼ぶ（本来は重い計算をサーバで実行）。
 */
export async function optimize(
  context: OptimizationContext,
  runId: string,
): Promise<GatewayResult<OptimizationRun>> {
  try {
    const res = await fetch(`${readBase()}/api/shift/optimize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ context, runId }),
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const body = (await res.json()) as { run: OptimizationRun }
    return { data: body.run, fromFallback: false, note: `ゲートウェイで最適化。` }
  } catch {
    const result = generateDraft(context, runId)
    const run = createOptimizationRun(result, context.siteId, context.month)
    return { data: run, fromFallback: true, note: 'サーバ未起動のためローカル最適化(デモ)。' }
  }
}

export interface ConfirmResult {
  run: OptimizationRun
  applied: ShiftCell[]
  /** サーバ確定(第一経路・権威)か、ローカルプレビュー(フォールバック)か。 */
  fromFallback: boolean
  /** true=サーバで実際に確定・反映された（権威）。false=プレビューのみで未確定。 */
  confirmed: boolean
  note: string
}

/**
 * [ADR-008][REQ-020] AIシフトの確定は必ずサーバ `/api/shift/confirm`（reviewed:true 必須・service_role相当）
 * を第一経路とする。サーバ成功時のみ「確定」とみなす。
 * サーバ未起動時は input-core でローカルプレビューを組むが、これは未確定（confirmed=false）。
 * HITL ゲート(confirmOptimizationRun: reviewed!==true を拒否)はどちらの経路でも維持する。
 */
export async function confirmRun(
  run: OptimizationRun,
  actor: Actor,
  reviewed: boolean,
): Promise<ConfirmResult> {
  try {
    const res = await fetch(`${readBase()}/api/shift/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ run, actor, reviewed }),
    })
    if (!res.ok) {
      // 403(reviewed未実施)等はサーバ判断を尊重してエラーにする（クライアント側で確定させない）。
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `status ${res.status}`)
    }
    const body = (await res.json()) as { run: OptimizationRun; applied: ShiftCell[] }
    return {
      run: body.run,
      applied: body.applied,
      fromFallback: false,
      confirmed: true,
      note: 'サーバ(service_role相当)で確定・反映しました。',
    }
  } catch (e) {
    // サーバ未起動: HITL ゲートは維持しつつローカルプレビューを構築（確定ではない）。
    // reviewed!==true の場合は confirmOptimizationRun が throw → 呼出側でエラー表示。
    const isNetwork = e instanceof TypeError
    if (!isNetwork && reviewed) {
      // ネットワーク以外（サーバが 4xx/5xx で拒否）はサーバ判断を優先し再throw。
      throw e
    }
    const localConfirmed = confirmOptimizationRun(run, actor, { reviewed })
    return {
      run: localConfirmed,
      applied: applyConfirmedRun(localConfirmed),
      fromFallback: true,
      confirmed: false,
      note: 'サーバ未接続のためローカルプレビュー(未確定)。確定はサーバ接続時のみ有効です。',
    }
  }
}

/** NL からそれらしい制約(生)を組み立てる簡易ブラウザモック（サーバ claude.ts と同趣旨）。 */
function localMockStructure(text: string): unknown {
  const constraints: Record<string, unknown>[] = []
  if (/資格|有資格|2級|1級|施設警備/.test(text)) {
    constraints.push({ id: 'nl-qual', category: 'company', severity: 'hard', kind: 'qualification_required', params: { position: '夜勤', qualification: '施設警備2級' }, label: '夜勤は施設警備2級が必須', source: '自社シフト規程' })
  }
  if (/連勤|連続|続けて/.test(text)) {
    constraints.push({ id: 'nl-consec', category: 'legal', severity: 'hard', kind: 'max_consecutive_days', params: { days: 6 }, label: '連勤は6日まで', source: '労働基準法' })
  }
  if (/希望休|休み希望/.test(text)) {
    constraints.push({ id: 'nl-dayoff', category: 'shift', severity: 'soft', kind: 'day_off_request', params: { staffId: 'user-3', date: '2026-08-04' }, weight: 5, label: '希望休の尊重', source: '本人申請' })
  }
  if (/社保|社会保険|保険/.test(text)) {
    constraints.push({ id: 'nl-ins', category: 'insurance', severity: 'soft', kind: 'insurance_weekly_hours', params: { thresholdHours: 20, hoursPerShift: 8 }, weight: 3, label: '週20h以上は社保加入対象', source: '社会保険' })
  }
  if (constraints.length === 0) {
    constraints.push({ id: 'nl-head', category: 'shift', severity: 'hard', kind: 'required_headcount', params: { position: '日勤', count: 2 }, label: '日勤は2名以上', source: '運用要望' })
  }
  return { constraints }
}
