// [REQ-022] 通知の対象別配信と未確認集計（純粋・決定論）
import type { Notification, NotifyUser, NotificationDelivery } from '../types.js'

/** [REQ-022] 配信対象条件に一致する利用者のみを入力順で返す（対象外を混ぜない=誤配信防止） */
export function resolveRecipients(notification: Notification, users: NotifyUser[]): NotifyUser[] {
  const { scope, siteId, workType, role } = notification.target
  return users.filter((u) => {
    // scope 一致判定
    let matched: boolean
    switch (scope) {
      case 'all':
        matched = true
        break
      case 'site':
        matched = u.siteId === siteId
        break
      case 'workType':
        matched = u.workType === workType
        break
      case 'role':
        matched = u.role === role
        break
      default:
        matched = false
    }
    // siteId 併記は AND（site scope 以外で siteId 指定があれば追加で絞り込む）
    if (matched && scope !== 'site' && siteId !== undefined) {
      matched = u.siteId === siteId
    }
    return matched
  })
}

/** [REQ-022] recipient / confirmed / unconfirmed を集計（confirmed は recipient 内のみカウント） */
export function buildDelivery(
  notification: Notification,
  users: NotifyUser[],
  confirmedIds: string[] = [],
): NotificationDelivery {
  const recipients = resolveRecipients(notification, users)
  const recipientIds = recipients.map((u) => u.id)
  const recipientSet = new Set(recipientIds)
  // 確認 id は recipient 内のみ有効（対象外の confirmed は無視）
  const confirmed = confirmedIds.filter((id) => recipientSet.has(id))
  const unconfirmed = recipientIds.length - confirmed.length
  return {
    notificationId: notification.id,
    recipientIds,
    confirmedIds: confirmed,
    unconfirmed,
  }
}
