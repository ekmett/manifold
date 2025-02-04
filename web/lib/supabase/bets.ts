import { db } from './db'
import { run, selectJson } from 'common/supabase/utils'
import { BetFilter } from 'web/lib/firebase/bets'
import { Contract } from 'common/contract'
import { Dictionary, flatMap } from 'lodash'
import { LimitBet } from 'common/bet'

export async function getOlderBets(
  contractId: string,
  beforeTime: number,
  limit: number
) {
  const query = selectJson(db, 'contract_bets')
    .eq('contract_id', contractId)
    .lt('data->>createdTime', beforeTime)
    .order('data->>createdTime', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(query)

  return data.map((r) => r.data)
}

export const getBets = async (options?: BetFilter) => {
  const query = getBetsQuery(options)
  const { data } = await run(query)
  return data.map((r) => r.data)
}

export const getBetsQuery = (options?: BetFilter) => {
  let q = selectJson(db, 'contract_bets').order('data->>createdTime', {
    ascending: options?.order === 'asc',
  } as any)

  if (options?.contractId) {
    q = q.eq('contract_id', options.contractId)
  }
  if (options?.userId) {
    q = q.eq('data->>userId', options.userId)
  }
  if (options?.afterTime) {
    q = q.gt('data->>createdTime', options.afterTime)
  }
  if (options?.filterChallenges) {
    q = q.contains('data', { isChallenge: false })
  }
  if (options?.filterAntes) {
    q = q.contains('data', { isAnte: false })
  }
  if (options?.filterRedemptions) {
    q = q.contains('data', { isRedemption: false })
  }
  if (options?.isOpenLimitOrder) {
    q = q.contains('data', { isFilled: false, isCancelled: false })
  }
  if (options?.limit) {
    q = q.limit(options.limit)
  }
  return q
}

export const getOpenLimitOrdersWithContracts = async (
  userId: string,
  count = 1000
) => {
  const { data } = await db.rpc('get_open_limit_bets_with_contracts', {
    count,
    uid: userId,
  })
  const betsByContract = {} as Dictionary<LimitBet[]>

  const contracts = [] as Contract[]
  flatMap(data).forEach((d) => {
    betsByContract[d.contract_id] = d.bets as LimitBet[]
    contracts.push(d.contract as Contract)
  })
  return { betsByContract, contracts }
}
