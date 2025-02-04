import React, { useEffect, useRef, useState } from 'react'
import WebView from 'react-native-webview'
import 'expo-dev-client'
import { ENV, EXTERNAL_REDIRECTS } from 'common/envs/constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import {
  Platform,
  BackHandler,
  NativeEventEmitter,
  StyleSheet,
  SafeAreaView,
  StatusBar as RNStatusBar,
  Dimensions,
  View,
} from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
// @ts-ignore
import * as LinkingManager from 'react-native/Libraries/Linking/NativeLinkingManager'
import * as Linking from 'expo-linking'
import { Subscription } from 'expo-modules-core'
import { setFirebaseUserViaJson } from 'common/firebase-auth'
import * as Sentry from 'sentry-expo'
import { StatusBar } from 'expo-status-bar'
import { AuthPage } from 'components/auth-page'
import { IosIapListener } from 'components/ios-iap-listener'
import { withIAPContext } from 'react-native-iap'
import { getSourceUrl, Notification } from 'common/notification'
import { SplashLoading } from 'components/splash-loading'
import {
  nativeToWebMessage,
  nativeToWebMessageType,
  webToNativeMessage,
} from 'common/native-message'
import { useFonts, ReadexPro_400Regular } from '@expo-google-fonts/readex-pro'
import { app, auth, log } from './init'
import {
  handleWebviewCrash,
  ExternalWebView,
  sharedWebViewProps,
  handleWebviewError,
  handleRenderError,
} from 'components/external-web-view'

// no other uri works for API requests due to CORS
// const uri = 'http://localhost:3000/'
const baseUri =
  ENV === 'DEV' ? 'https://dev.manifold.markets/' : 'https://manifold.markets/'
const nativeQuery = `?nativePlatform=${Platform.OS}`
const isIOS = Platform.OS === 'ios'
const App = () => {
  // Init
  const [hasLoadedWebView, setHasLoadedWebView] = useState(false)
  const [hasSetNativeFlag, setHasSetNativeFlag] = useState(false)
  const webview = useRef<WebView>()
  const notificationResponseListener = useRef<Subscription | undefined>()
  useFonts({ ReadexPro_400Regular })

  // Auth
  const [waitingForAuth, setWaitingForAuth] = useState(true)
  const [user, setUser] = useState(auth.currentUser)
  useEffect(() => {
    log(`Webview has loaded ${hasLoadedWebView}. user: ${user?.uid}`)
    // Wait a couple seconds after webview has loaded to see if we get a cached user from the client
    if (hasLoadedWebView && !user) {
      log('Has loaded webview with no user, waiting for auth')
      const timeout = setTimeout(() => {
        log('Still no cached users, redirecting to sign in')
        setWaitingForAuth(false)
      }, 2000)
      return () => {
        log('clearing auth timeout')
        clearTimeout(timeout)
      }
    }
  }, [hasLoadedWebView, user])

  // Auth.currentUser wasn't updating (probably due to our hacky auth solution), so tracking the state manually
  useEffect(() => {
    log('Auth user changed', user?.uid)
    auth.onAuthStateChanged(setUser)
  }, [auth])

  // Url management
  const [urlToLoad, setUrlToLoad] = useState<string>(
    baseUri + '/home' + nativeQuery
  )
  const [externalUrl, setExternalUrl] = useState<string | undefined>(undefined)
  const linkedUrl = Linking.useURL()
  const eventEmitter = new NativeEventEmitter(
    isIOS ? LinkingManager.default : null
  )

  const setUrlWithNativeQuery = (endpoint?: string) => {
    const newUrl = baseUri + (endpoint ?? '/home') + nativeQuery
    log('Setting new url', newUrl)
    // React native doesn't come with Url, so we may want to use a library
    setUrlToLoad(newUrl)
  }

  const [allowSystemBack, setAllowSystemBack] = useState(
    sharedWebViewProps.allowsBackForwardNavigationGestures
  )
  // IAP
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null)

  const handlePushNotification = async (
    response: Notifications.NotificationResponse
  ) => {
    log('Push notification received, has loaded webview:', hasLoadedWebView)
    // Perhaps this isn't current if the webview is killed for memory collection? Not sure
    if (hasLoadedWebView) {
      communicateWithWebview(
        'notification',
        response.notification.request.content.data
      )
    } else {
      const notification = response.notification.request.content
        .data as Notification
      const sourceUrl = getSourceUrl(notification)
      setUrlWithNativeQuery(sourceUrl)
    }
  }

  useEffect(() => {
    log('Setting up notification listener')
    // This listener is fired whenever a user taps on or interacts with a notification (works when app is foregrounded, backgrounded, or killed)
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener(
        handlePushNotification
      )

    return () => {
      notificationResponseListener.current &&
        Notifications.removeNotificationSubscription(
          notificationResponseListener.current
        )
    }
  }, [hasLoadedWebView])

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        setUrlToLoad(url)
      }
    })
    BackHandler.addEventListener('hardwareBackPress', handleBackButtonPress)
    return () =>
      BackHandler.removeEventListener(
        'hardwareBackPress',
        handleBackButtonPress
      )
  }, [])

  // Handle deep links
  useEffect(() => {
    if (!linkedUrl) return

    const { hostname, path, queryParams } = Linking.parse(linkedUrl)
    if (path !== 'blank' && hostname) {
      log(
        `Linked to app with hostname: ${hostname}, path: ${path} and data: ${JSON.stringify(
          queryParams
        )}`
      )
      communicateWithWebview('link', { url: path ? path : '/' })
      // If we don't clear the url, we won't reopen previously opened links
      const clearUrlCacheEvent = {
        hostname: 'manifold.markets',
        url: 'blank',
      }
      eventEmitter.emit('url', clearUrlCacheEvent)
    }
  }, [linkedUrl])

  const handleBackButtonPress = () => {
    try {
      webview.current?.goBack()
      return true
    } catch (err) {
      Sentry.Native.captureException(err, {
        extra: { message: 'back button press' },
      })
      log('[handleBackButtonPress] Error : ', err)
      return false
    }
  }

  const getExistingPushNotificationStatus = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      })
    }

    const { status } = await Notifications.getPermissionsAsync()
    return status
  }

  const getPushToken = async () => {
    const appConfig = require('./app.json')
    const projectId = appConfig.expo.extra.eas.projectId
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data
    log(token)
    return token
  }

  const registerForPushNotificationsAsync = async () => {
    if (!Device.isDevice) return null

    try {
      const existingStatus = await getExistingPushNotificationStatus()
      let finalStatus = existingStatus
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') {
        communicateWithWebview('pushNotificationPermissionStatus', {
          status: finalStatus,
          userId: user?.uid,
        })
        return null
      }
      return await getPushToken()
    } catch (e) {
      Sentry.Native.captureException(e, {
        extra: { message: 'error registering for push notifications' },
      })
      log('Error registering for push notifications', e)
      return null
    }
  }

  const handleMessageFromWebview = ({ nativeEvent }: any) => {
    const { data } = nativeEvent
    const { type, data: payload } = JSON.parse(data) as webToNativeMessage
    log('Received message from webview: ', type)
    setHasSetNativeFlag(true)
    if (type === 'checkout') {
      setCheckoutAmount(payload.amount)
    } else if (type === 'loginClicked') {
      if (user || auth.currentUser) {
        setUser(null)
        try {
          // Let's start from a clean slate if the webview and native auths are out of sync
          auth.signOut()
        } catch (err) {
          log('Error signing out before sign in :', err)
          Sentry.Native.captureException(err, {
            extra: { message: 'sign out before sign in' },
          })
        }
      }
    } else if (type === 'tryToGetPushTokenWithoutPrompt') {
      getExistingPushNotificationStatus().then(async (status) => {
        if (status === 'granted') {
          const token = await getPushToken()
          if (!webview.current) return
          if (token)
            communicateWithWebview('pushToken', {
              token,
              userId: user?.uid,
            })
        } else
          communicateWithWebview('pushNotificationPermissionStatus', {
            status,
            userId: user?.uid,
          })
      })
    } else if (type === 'copyToClipboard') {
      Clipboard.setString(payload)
    }
    // User needs to enable push notifications
    else if (type === 'promptEnablePushNotifications') {
      registerForPushNotificationsAsync().then((token) => {
        if (token)
          communicateWithWebview('pushToken', {
            token,
            userId: user?.uid,
          })
      })
    } else if (type === 'signOut') {
      setUser(null)
      try {
        auth.signOut()
      } catch (err) {
        log('Error on sign out:', err)
        Sentry.Native.captureException(err, {
          extra: { message: 'sign out' },
        })
      }
    }
    // Receiving cached firebase user from webview cache
    else if (type === 'users') {
      try {
        const fbUserAndPrivateUser = JSON.parse(payload)
        // Passing us a signed-in user object
        if (fbUserAndPrivateUser && fbUserAndPrivateUser.fbUser) {
          log('Signing in fb user from webview cache')
          setFirebaseUserViaJson(fbUserAndPrivateUser.fbUser, app)
        }
      } catch (e) {
        Sentry.Native.captureException(e, {
          extra: { message: 'error parsing nativeEvent.data' },
        })
      }
    } else if (type == 'onPageVisit') {
      if (!isIOS) return // Android doesn't use the swipe to go back
      const { page } = payload
      setAllowSystemBack(page !== 'swipe')
    } else {
      log('Unhandled nativeEvent.data: ', data)
    }
  }

  const tellWebviewToSetNativeFlag = () => {
    if (hasSetNativeFlag) return
    communicateWithWebview('setIsNative', { platform: Platform.OS })
  }

  const communicateWithWebview = (
    type: nativeToWebMessageType,
    data: object
  ) => {
    webview.current?.postMessage(
      JSON.stringify({
        type,
        data,
      } as nativeToWebMessage)
    )
  }

  const webViewAndUserLoaded = hasLoadedWebView && user
  const width = Dimensions.get('window').width //full width
  const height = Dimensions.get('window').height //full height
  const styles = StyleSheet.create({
    container: {
      display: webViewAndUserLoaded ? 'flex' : 'none',
      flex: 1,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    webView: {
      display: webViewAndUserLoaded ? 'flex' : 'none',
      overflow: 'hidden',
      marginTop: isIOS ? 0 : RNStatusBar.currentHeight ?? 0,
      marginBottom: !isIOS ? 10 : 0,
    },
  })

  return (
    <>
      {!webViewAndUserLoaded && waitingForAuth ? (
        <SplashLoading
          height={height}
          width={width}
          source={require('./assets/splash.png')}
        />
      ) : (
        hasLoadedWebView &&
        !user &&
        !waitingForAuth && (
          <AuthPage webview={webview} height={height} width={width} />
        )
      )}
      {Platform.OS === 'ios' && Device.isDevice && webViewAndUserLoaded && (
        <IosIapListener
          checkoutAmount={checkoutAmount}
          setCheckoutAmount={setCheckoutAmount}
          communicateWithWebview={communicateWithWebview}
        />
      )}

      <SafeAreaView style={styles.container}>
        <StatusBar animated={true} style={'dark'} hidden={false} />

        <View style={[styles.container, { position: 'relative' }]}>
          <ExternalWebView
            url={externalUrl}
            height={height}
            width={width}
            setUrl={setExternalUrl}
          />
          <WebView
            {...sharedWebViewProps}
            allowsBackForwardNavigationGestures={allowSystemBack}
            style={styles.webView}
            // Load start and end is for whole website loading, not navigations within manifold
            onLoadEnd={() => {
              log('WebView onLoadEnd')
              setHasLoadedWebView(true)
            }}
            source={{ uri: urlToLoad }}
            //@ts-ignore
            ref={webview}
            onError={(e) =>
              handleWebviewError(e, () => setUrlWithNativeQuery())
            }
            renderError={(e) => handleRenderError(e, width, height)}
            onTouchStart={tellWebviewToSetNativeFlag}
            // On navigation state change changes on every url change
            onNavigationStateChange={(navState) => {
              const { url } = navState
              if (
                !url.startsWith(baseUri) ||
                EXTERNAL_REDIRECTS.some((u) => url.endsWith(u))
              ) {
                setExternalUrl(url)
                webview.current?.stopLoading()
              } else {
                setExternalUrl(undefined)
                tellWebviewToSetNativeFlag()
              }
            }}
            onRenderProcessGone={(e) => handleWebviewCrash(webview, e)}
            onContentProcessDidTerminate={(e) => handleWebviewCrash(webview, e)}
            onMessage={handleMessageFromWebview}
          />
        </View>
      </SafeAreaView>
    </>
  )
}
export default withIAPContext(App)
