import {describe, expect, it} from 'vitest'
import {endHydration, readHydratedAsyncData, readHydratedKey, setHydratedPayload} from '../../lib/runtime/async-data-payload'

describe('endHydration', () => {
  it('reads keys from the payload while hydrating', () => {
    setHydratedPayload({product: {id: 1}})

    expect(readHydratedAsyncData('product')).toEqual({status: 'success', data: {id: 1}})
  })

  it('stops reading keys that were in the payload once hydration ends', () => {
    setHydratedPayload({product: {id: 1}, 'product::__statusCode': 200})
    endHydration()

    expect(readHydratedAsyncData('product')).toEqual({status: 'missing'})
    expect(readHydratedKey('product::__statusCode')).toBeUndefined()
  })
})
