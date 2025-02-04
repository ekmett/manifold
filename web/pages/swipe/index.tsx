import { useEffect, useMemo } from 'react'

import clsx from 'clsx'
import type { BinaryContract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { postMessageToNative } from 'web/components/native-message-listener'
import { BOTTOM_NAV_BAR_HEIGHT } from 'web/components/nav/bottom-nav-bar'
import { SwipeBetPanel } from 'web/components/swipe/swipe-bet-panel'
import { CurrentSwipeCards, SwipeCard } from 'web/components/swipe/swipe-card'
import { STARTING_BET_AMOUNT } from 'web/components/swipe/swipe-helpers'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { SiteLink } from 'web/components/widgets/site-link'
import { useFeed } from 'web/hooks/use-feed'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { useWindowSize } from 'web/hooks/use-window-size'
import { firebaseLogin } from 'web/lib/firebase/users'
import { logView } from 'web/lib/firebase/views'

export default function Swipe() {
  useTracking('view swipe page')

  const user = useUser()
  const { contracts, loadMore } = useFeed(user, 'swipe')
  const feed = contracts?.filter((c) => c.outcomeType === 'BINARY') as
    | BinaryContract[]
    | undefined

  const [index, setIndex] = usePersistentState(0, {
    key: 'swipe-index',
    store: inMemoryStore(),
  })

  useEffect(() => {
    if (feed && index + 2 >= feed.length) {
      loadMore()
    }
  }, [feed, index, loadMore])

  const contract = feed ? feed[index] : undefined

  const cards = useMemo(() => {
    if (!feed) return []
    return feed.slice(index, index + 2)
  }, [feed, index])

  // Measure height manually to accommodate mobile web.
  const { height: computedHeight } = useWindowSize()
  const [height, setHeight] = usePersistentState(computedHeight ?? 800, {
    key: 'screen-height',
    store: inMemoryStore(),
  })
  useEffect(() => {
    if (computedHeight !== undefined) {
      setHeight(computedHeight)
    }
  }, [computedHeight, setHeight])

  const cardHeight = height - BOTTOM_NAV_BAR_HEIGHT

  useEffect(() => {
    if (user && contract) {
      logView({ contractId: contract.id, userId: user.id })
    }
  }, [user, contract])

  useEffect(() => {
    postMessageToNative('onPageVisit', { page: 'swipe' })
    return () => {
      postMessageToNative('onPageVisit', { page: undefined })
    }
  }, [])
  if (user === undefined || feed === undefined) {
    return (
      <Page>
        <LoadingIndicator className="mt-6" />
      </Page>
    )
  }
  // Show log in prompt if user not logged in.
  if (user === null) {
    return (
      <Page>
        <div className="flex h-screen w-screen items-center justify-center">
          <Button onClick={firebaseLogin} color="gradient" size="2xl">
            Log in to use Manifold Swipe
          </Button>
        </div>
      </Page>
    )
  }
  return (
    <Page>
      <Row
        className={clsx('relative w-full max-w-lg select-none overflow-hidden')}
        style={{ height: cardHeight }}
      >
        {cards.length > 0 && (
          <CurrentSwipeCards
            className="z-20"
            key={cards[0].id}
            contract={cards[0]}
            previousContract={index > 0 ? feed[index - 1] : undefined}
            nextContract={feed[index + 1]}
            index={index}
            setIndex={setIndex}
            user={user}
            cardHeight={cardHeight}
          />
        )}
        {cards.length > 1 && (
          <SwipeCard
            amount={STARTING_BET_AMOUNT}
            contract={cards[1]}
            key={cards[1].id}
            swipeBetPanel={
              <SwipeBetPanel amount={STARTING_BET_AMOUNT} disabled={true} />
            }
          />
        )}
        {!cards.length && (
          <div className="flex h-full w-full flex-col items-center justify-center">
            No more cards!
            <SiteLink href="/home" className="text-indigo-700">
              Return home
            </SiteLink>
          </div>
        )}
      </Row>
    </Page>
  )
}
