import { useState } from 'react'
import {
  compute,
  Contract,
  deleteContract,
  setContract,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Spacer } from './layout/spacer'
import { ContractProbGraph } from './contract-prob-graph'
import router from 'next/router'
import { useUser } from '../hooks/use-user'
import { Row } from './layout/row'
import dayjs from 'dayjs'
import { Linkify } from './linkify'
import clsx from 'clsx'
import { ContractDetails } from './contract-card'

function ContractDescription(props: {
  contract: Contract
  isCreator: boolean
}) {
  const { contract, isCreator } = props
  const [editing, setEditing] = useState(false)
  const editStatement = () => `${dayjs().format('MMM D, h:mma')}: `
  const [description, setDescription] = useState(editStatement())

  // Append the new description (after a newline)
  async function saveDescription(e: any) {
    e.preventDefault()
    setEditing(false)
    contract.description = `${contract.description}\n${description}`.trim()
    await setContract(contract)
    setDescription(editStatement())
  }

  return (
    <div className="whitespace-pre-line break-words">
      <Linkify text={contract.description} />
      <br />
      {isCreator &&
        !contract.resolution &&
        (editing ? (
          <form className="mt-4">
            <textarea
              className="textarea h-24 textarea-bordered w-full mb-2"
              value={description}
              onChange={(e) => setDescription(e.target.value || '')}
              autoFocus
              onFocus={(e) =>
                // Focus starts at end of description.
                e.target.setSelectionRange(
                  description.length,
                  description.length
                )
              }
            />
            <Row className="gap-4 justify-end">
              <button
                className="btn btn-error btn-outline btn-sm mt-2"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-neutral btn-outline btn-sm mt-2"
                onClick={saveDescription}
              >
                Save
              </button>
            </Row>
          </form>
        ) : (
          <Row className="justify-end">
            <button
              className="btn btn-neutral btn-outline btn-sm mt-4"
              onClick={() => setEditing(true)}
            >
              Add to description
            </button>
          </Row>
        ))}
    </div>
  )
}

function ResolutionOrChance(props: {
  resolution?: 'YES' | 'NO' | 'MKT' | 'CANCEL'
  probPercent: string
  className?: string
}) {
  const { resolution, probPercent, className } = props

  const resolutionColor = {
    YES: 'text-primary',
    NO: 'text-red-400',
    MKT: 'text-blue-400',
    CANCEL: 'text-yellow-400',
    '': '', // Empty if unresolved
  }[resolution || '']

  return (
    <Col className={clsx('text-3xl md:text-4xl', className)}>
      {resolution ? (
        <>
          <div className="text-lg md:text-xl text-gray-500">Resolved</div>
          <div className={resolutionColor}>
            {resolution === 'CANCEL' ? 'N/A' : resolution}
          </div>
        </>
      ) : (
        <>
          <div className="text-primary">{probPercent}</div>
          <div className="text-lg md:text-xl text-primary">chance</div>
        </>
      )}
    </Col>
  )
}

export const ContractOverview = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { resolution, creatorId } = contract
  const { probPercent, truePool } = compute(contract)

  const user = useUser()
  const isCreator = user?.id === creatorId

  return (
    <Col className={clsx('mb-6', className)}>
      <Row className="justify-between gap-4">
        <Col className="gap-4">
          <div className="text-2xl md:text-3xl text-indigo-700">
            <Linkify text={contract.question} />
          </div>

          <ResolutionOrChance
            className="md:hidden"
            resolution={resolution}
            probPercent={probPercent}
          />

          <ContractDetails contract={contract} />
        </Col>

        <ResolutionOrChance
          className="hidden md:flex md:items-end"
          resolution={resolution}
          probPercent={probPercent}
        />
      </Row>

      <Spacer h={4} />

      <ContractProbGraph contract={contract} />

      <Spacer h={12} />

      {((isCreator && !contract.resolution) || contract.description) && (
        <label className="text-gray-500 mb-2 text-sm">Description</label>
      )}
      <ContractDescription contract={contract} isCreator={isCreator} />

      {/* Show a delete button for contracts without any trading */}
      {isCreator && truePool === 0 && (
        <>
          <Spacer h={8} />
          <button
            className="btn btn-xs btn-error btn-outline mt-1 max-w-fit self-end"
            onClick={async (e) => {
              e.preventDefault()
              await deleteContract(contract.id)
              router.push('/markets')
            }}
          >
            Delete
          </button>
        </>
      )}
    </Col>
  )
}
