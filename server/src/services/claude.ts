// [REQ-018][ADR-003][ADR-005] 自然言語→構造化制約の Claude 呼び出し境界。
// 秘匿境界: CLAUDE_API_KEY / CLAUDE_MODEL はこの層にのみ存在し、レスポンス/ログ/フロントへ絶対に出さない。
// 整形は input-core の parseConstraintsFromLLM に委譲（サーバに検証・写像ロジックを再実装しない＝層分離厳守）。
import { parseConstraintsFromLLM, type ConstraintDef } from '@mamorai/input-core'

/**
 * Claude 呼び出しの抽象。自然言語要望を受け取り「LLM構造化出力(生)」を返す。
 * テスト時はモックを注入し、本番は resolveCallClaude() が実/モックを選ぶ（依存注入で分離）。
 */
export type CallClaude = (userText: string) => Promise<unknown>

/**
 * 既定のモック Claude。実キー無し環境ではこれが使われる（OQ相当: 実プロンプト確定まで）。
 * 返却形は Claude の構造化出力を模した unknown（配列 or {constraints:[...]}）。
 * parseConstraintsFromLLM が検証・写像するので、ここでは整形しない。
 */
export function createMockCallClaude(): CallClaude {
  return async (userText: string): Promise<unknown> => {
    // 自然言語に含まれる代表キーワードから、それらしい制約(生)を組み立てるだけの簡易モック。
    const t = userText
    const constraints: Record<string, unknown>[] = []
    if (/資格|有資格|2級|1級|施設警備/.test(t)) {
      constraints.push({
        id: 'nl-qual', category: 'company', severity: 'hard', kind: 'qualification_required',
        params: { position: '責任者', qualification: '施設警備2級' },
        label: '責任者は施設警備2級が必須', source: '自社シフト規程',
      })
    }
    if (/連勤|連続|続けて/.test(t)) {
      constraints.push({
        id: 'nl-consec', category: 'legal', severity: 'hard', kind: 'max_consecutive_days',
        params: { days: 6 }, label: '連勤は6日まで', source: '労働基準法',
      })
    }
    if (/休憩|勤務間隔|インターバル|11時間/.test(t)) {
      constraints.push({
        id: 'nl-rest', category: 'legal', severity: 'hard', kind: 'min_rest_hours',
        params: { hours: 11 }, label: '勤務間隔11時間以上', source: '労働基準法',
      })
    }
    if (/希望休|休み希望/.test(t)) {
      constraints.push({
        id: 'nl-dayoff', category: 'shift', severity: 'soft', kind: 'day_off_request',
        params: { staffId: 'user-2', date: '2026-08-03' }, weight: 5,
        label: '佐藤の希望休(8/3)', source: '本人申請',
      })
    }
    if (/社保|社会保険|保険/.test(t)) {
      constraints.push({
        id: 'nl-ins', category: 'insurance', severity: 'soft', kind: 'insurance_weekly_hours',
        params: { thresholdHours: 20, hoursPerShift: 8 }, weight: 3,
        label: '週20h以上は社保加入対象', source: '社会保険',
      })
    }
    // 何もヒットしなければ最低限の必要人数制約を1件返す（空配列でも parse は通るが体験のため）。
    if (constraints.length === 0) {
      constraints.push({
        id: 'nl-head', category: 'shift', severity: 'hard', kind: 'required_headcount',
        params: { position: '日勤A', count: 1 }, label: '日勤A 1名以上', source: '運用要望',
      })
    }
    return { constraints }
  }
}

/**
 * 実 Claude 呼び出しの解決。CLAUDE_API_KEY があるときのみ実呼び出し分岐。
 * キーは Authorization 相当ヘッダでのみ使用し、返り値・ログには一切載せない。
 * env が無ければモックにフォールバック（既定動作）。
 */
export function resolveCallClaude(): CallClaude {
  const apiKey = process.env.CLAUDE_API_KEY
  const model = process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-latest'
  if (apiKey !== undefined && apiKey !== '') {
    // --- 実呼び出し分岐（実プロンプト確定後に有効化。キーはサーバ内でのみ使用）---
    return async (userText: string): Promise<unknown> => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          // キーはここ（サーバ→Claude）でのみ使用。クライアントには決して渡さない。
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          // system で「ConstraintDef[] のJSONのみを返す」ことを指示する想定（プロンプトは実装時に確定）。
          system: 'シフト制約を ConstraintDef[] のJSON配列として返す。説明文は含めない。',
          messages: [{ role: 'user', content: userText }],
        }),
      })
      if (!res.ok) throw new Error(`claude responded ${res.status}`)
      const data = (await res.json()) as { content?: { text?: string }[] }
      const text = data.content?.[0]?.text ?? '[]'
      return JSON.parse(text) as unknown
    }
  }
  return createMockCallClaude()
}

/**
 * [REQ-018] 自然言語要望 → ConstraintDef[]。
 * callClaude で生出力を得て parseConstraintsFromLLM で検証・写像する。キーは混入しない。
 */
export async function structureConstraints(
  callClaude: CallClaude,
  userText: string,
): Promise<ConstraintDef[]> {
  const raw = await callClaude(userText)
  return parseConstraintsFromLLM(raw)
}
