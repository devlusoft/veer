import { describe, expect, it } from 'vitest'
import { createError, isVeerError, VeerError } from '../../lib/runtime/error'

describe('error helpers', () => {
  it('createError builds a VeerError from payload', () => {
    const err = createError({ statusCode: 404, statusMessage: 'Not Found' })
    expect(err).toBeInstanceOf(VeerError)
    expect(err.statusCode).toBe(404)
    expect(err.statusMessage).toBe('Not Found')
  })

  it('createError wraps a string', () => {
    const err = createError('Something broke')
    expect(err.statusCode).toBe(500)
    expect(err.message).toBe('Something broke')
  })

  it('createError wraps a plain Error', () => {
    const original = new Error('boom')
    const err = createError(original)
    expect(err.statusCode).toBe(500)
    expect(err.message).toBe('boom')
  })

  it('createError returns the same VeerError instance', () => {
    const existing = new VeerError({ statusCode: 403 })
    expect(createError(existing)).toBe(existing)
  })

  it('isVeerError identifies VeerError instances', () => {
    expect(isVeerError(new VeerError())).toBe(true)
    expect(isVeerError(new Error())).toBe(false)
    expect(isVeerError('error')).toBe(false)
  })
})
