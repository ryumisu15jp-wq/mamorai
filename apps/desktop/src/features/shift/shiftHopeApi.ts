// [シフト希望] データ層。Supabase構成時は現場/勤務員RPC(0405)、未構成時は shiftHopeStore(localStorage)。
// 勤務員PWA(/app)が submitHope で提出→現場(/s)が hopesForMonth で参照しシフトへ反映。
import { getSupabase, isSupabaseConfigured } from '../../lib/supabaseClient.js'
import { siteCodes } from '../../shared/runtimeCtx.js'
import { SITE } from '../../pilot/bulgari.js'
import {
  submitHope as localSubmit, hopesForMonth as localHopesForMonth,
  subscribe as localSubscribe, type ShiftHope, type HopeCode,
} from '../../shared/shiftHopeStore.js'

export type { ShiftHope, HopeCode }
const DB = (): boolean => isSupabaseConfigured()

interface Row { staff_no: string; staff_name: string | null; ym: string; hopes: Record<string, HopeCode> | null; note: string | null; submitted_at: string | null }
function fromRow(r: Row): ShiftHope {
  return {
    staffNo: r.staff_no, name: r.staff_name ?? '', site: SITE.name, ym: r.ym,
    days: (r.hopes ?? {}) as Record<number, HopeCode>, note: r.note ?? '', submittedAt: r.submitted_at ?? r.ym,
  }
}

/** 勤務員(/app): シフト希望を提出（同一スタッフ・同一月は上書き）。 */
export async function submitHope(h: ShiftHope): Promise<void> {
  if (DB()) {
    const { companyCode, siteCode } = siteCodes()
    await getSupabase()!.rpc('submit_hope', {
      p_company_code: companyCode, p_site_code: siteCode, p_staff_no: h.staffNo, p_staff_name: h.name,
      p_ym: h.ym, p_hopes: h.days, p_note: h.note,
    })
    return
  }
  localSubmit(h)
}

/** 現場(/s): 対象月のシフト希望一覧。 */
export async function hopesForMonth(ym: string): Promise<ShiftHope[]> {
  if (DB()) {
    const { companyCode, siteCode } = siteCodes()
    const { data } = await getSupabase()!.rpc('site_list_hopes', { p_company_code: companyCode, p_site_code: siteCode, p_ym: ym })
    return ((data as Row[]) ?? []).map(fromRow)
  }
  return localHopesForMonth(ym)
}

export function subscribe(cb: () => void): () => void {
  if (DB()) {
    const ch = getSupabase()!.channel('shift_hopes_rt').on('postgres_changes', { event: '*', schema: 'public', table: 'shift_hopes' }, () => cb()).subscribe()
    return () => { try { getSupabase()!.removeChannel(ch) } catch { /* ignore */ } }
  }
  return localSubscribe(cb)
}
