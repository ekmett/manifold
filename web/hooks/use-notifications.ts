import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { groupBy, map } from 'lodash'
import { useMemo } from 'react'
import { listenForNotifications } from 'web/lib/firebase/notifications'
import { useStore } from './use-store'

export type NotificationGroup = {
  notifications: Notification[]
  groupedById: string
  isSeen: boolean
  timePeriod: string
}

function useNotifications(privateUser: PrivateUser) {
  return useStore(privateUser.id, listenForNotifications, {
    prefix: 'notifications',
  })
}

export function useGroupedNotifications(privateUser: PrivateUser) {
  const notifications = useNotifications(privateUser)
  return useMemo(() => {
    return notifications ? groupNotifications(notifications) : undefined
  }, [notifications])
}

export function useUnseenNotificationCount(privateUser: PrivateUser) {
  const notifications = useNotifications(privateUser)
  return useMemo(() => {
    if (!notifications) return undefined
    const unseen = notifications.filter((n) => !n.isSeen)
    return groupNotifications(unseen).length
  }, [notifications])
}

function groupNotifications(notifications: Notification[]) {
  let notificationGroups: NotificationGroup[] = []
  const notificationGroupsByDay = groupBy(notifications, (notification) =>
    new Date(notification.createdTime).toDateString()
  )

  Object.keys(notificationGroupsByDay).forEach((day) => {
    const notificationsGroupedByDay = notificationGroupsByDay[day]
    // Group notifications by contract
    const groupedNotificationsByContractId = groupBy(
      notificationsGroupedByDay,
      (notification) => {
        return notification.sourceContractId
      }
    )
    notificationGroups = notificationGroups.concat(
      map(groupedNotificationsByContractId, (notifications, contractId) => {
        const notificationsForContractId = groupedNotificationsByContractId[
          contractId
        ].sort((a, b) => {
          return b.createdTime - a.createdTime
        })
        // Create a notification group for each contract within each day
        const notificationGroup: NotificationGroup = {
          notifications: notificationsForContractId,
          groupedById: contractId,
          isSeen: notificationsForContractId.some((n) => !n.isSeen),
          timePeriod: day,
        }
        return notificationGroup
      })
    )
  })
  return notificationGroups
}
