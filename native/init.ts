import { getApp, getApps, initializeApp } from 'firebase/app'
import { ENV, FIREBASE_CONFIG } from 'common/envs/constants'
import { getAuth } from 'firebase/auth'
import * as Device from 'expo-device'
import * as Sentry from 'sentry-expo'
import * as Notifications from 'expo-notifications'

export const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG)
export const auth = getAuth(app)
export const log = (...args: unknown[]) => {
  console.log(`[Manifold Markets]`, ...args)
}

if (Device.isDevice) {
  Sentry.init({
    dsn: 'https://2353d2023dad4bc192d293c8ce13b9a1@o4504040581496832.ingest.sentry.io/4504040585494528',
    enableInExpoDevelopment: true,
    debug: true, // If `true`, Sentry will try to print out useful debugging information if something goes wrong with sending the event. Set it to `false` in production
  })
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
}

log('using', ENV, 'env')
log('env not switching? run `npx expo start --clear` and then try again')
