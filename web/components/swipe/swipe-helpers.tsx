export const horizontalSwipeDist = 40
export const verticalSwipeDist = 40

export type SwipeAction = 'left' | 'right' | 'up' | 'down' | 'none'

export function getSwipeAction(
  mx: number,
  my: number,
  xCappedDist: number
): SwipeAction {
  if (xCappedDist >= horizontalSwipeDist) {
    return mx < 0 ? 'left' : 'right'
  }
  if (Math.abs(my) >= verticalSwipeDist) {
    return my < 0 ? 'up' : 'down'
  }
  return 'none'
}

export default function getQuestionSize(question: string) {
  const questionLength = question.length
  if (window.innerHeight <= 700)
    return questionLength >= 120 ? 'text-xl' : 'text-2xl'
  return questionLength >= 120 ? 'text-2xl' : 'text-3xl'

  /* Inga's version.
  const height2width = window.innerHeight / window.innerWidth
  if (height2width < 2.1) {
    if (questionLength >= 160) return 'text-sm'
    if (questionLength >= 100 && questionLength < 160) return 'text-md'
    if (questionLength >= 40 && questionLength < 100) return 'text-lg'
    return 'text-xl'
  } else if (height2width > 2.3) {
    if (questionLength >= 160) return 'text-md'
    if (questionLength >= 100 && questionLength < 160) return 'text-lg'
    if (questionLength >= 40 && questionLength < 100) return 'text-xl'
    return 'text-2xl'
  } else {
    if (questionLength > 230) return 'text-xl'
    if (questionLength < 230 && questionLength >= 160) return 'text-2xl'
    if (questionLength >= 100 && questionLength < 160) return 'text-3xl'
    if (questionLength >= 40 && questionLength < 100) return 'text-4xl'
    return 'text-5xl'
  }
  */
}

export function isStatusAFailure(
  betStatus: 'loading' | 'success' | string | undefined
) {
  return betStatus && betStatus != 'loading' && betStatus != 'success'
}

export const BUFFER_CARD_COLOR = 'bg-gray-700'
export const BUFFER_CARD_OPACITY = 'opacity-70'

export const STARTING_BET_AMOUNT = 10
export const BET_TAP_ADD = 10
