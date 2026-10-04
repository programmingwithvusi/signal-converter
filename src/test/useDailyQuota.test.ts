import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockUseAuth = vi.fn()
const mockRead = vi.fn()
const mockRecord = vi.fn()

vi.mock('../hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('../utils/quota', () => ({
    readQuotaCount: (...args: unknown[]) => mockRead(...args),
    recordConversion: (...args: unknown[]) => mockRecord(...args),
}))

import { useDailyQuota } from '../hooks/useDailyQuota'

beforeEach(() => {
    mockUseAuth.mockReset()
    mockRead.mockReset()
    mockRecord.mockReset()
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' }, loading: false })
    mockRead.mockResolvedValue(0)
    mockRecord.mockImplementation(async () => 1)
})

async function renderReady(limit = 5) {
    const view = renderHook(() => useDailyQuota(limit))
    await waitFor(() => expect(view.result.current.status).toBe('ready'))
    return view
}

describe('useDailyQuota', () => {
    it('allows nothing while the count is still loading', () => {
        mockRead.mockReturnValue(new Promise(() => {}))
        const { result } = renderHook(() => useDailyQuota(5))
        expect(result.current.status).toBe('loading')
        expect(result.current.remaining).toBe(0)
        expect(result.current.remainingNow()).toBe(0)
    })

    it("loads the signed-in account's count", async () => {
        mockRead.mockResolvedValue(3)
        const { result } = await renderReady()
        expect(mockRead).toHaveBeenCalledWith('user-1')
        expect(result.current.used).toBe(3)
        expect(result.current.remaining).toBe(2)
        expect(result.current.remainingNow()).toBe(2)
    })

    it('fails closed when the count cannot be read', async () => {
        mockRead.mockRejectedValue(new Error('offline'))
        const { result } = renderHook(() => useDailyQuota(5))
        await waitFor(() => expect(result.current.status).toBe('error'))
        expect(result.current.remaining).toBe(0)
        expect(result.current.remainingNow()).toBe(0)
    })

    it('fails closed when nobody is signed in', () => {
        mockUseAuth.mockReturnValue({ user: null, loading: false })
        const { result } = renderHook(() => useDailyQuota(5))
        expect(result.current.status).toBe('error')
        expect(result.current.remaining).toBe(0)
        expect(mockRead).not.toHaveBeenCalled()
    })

    it('counts a conversion immediately and records it against the account', async () => {
        const { result } = await renderReady()
        act(() => result.current.consume())
        expect(result.current.used).toBe(1)
        expect(result.current.remaining).toBe(4)
        expect(mockRecord).toHaveBeenCalledWith('user-1')
    })

    it('never goes below zero remaining once exhausted', async () => {
        const { result } = await renderReady(1)
        act(() => result.current.consume())
        act(() => result.current.consume())
        expect(result.current.remaining).toBe(0)
        expect(result.current.remainingNow()).toBe(0)
    })

    it('adopts a higher server count from another tab or browser', async () => {
        mockRecord.mockResolvedValue(4)
        const { result } = await renderReady()
        act(() => result.current.consume())
        await waitFor(() => expect(result.current.used).toBe(4))
        expect(result.current.remainingNow()).toBe(1)
    })

    it('keeps the in-session count when the write is refused', async () => {
        mockRecord.mockRejectedValue(new Error('permission-denied'))
        const { result } = await renderReady()
        await act(async () => result.current.consume())
        expect(result.current.used).toBe(1)
        expect(result.current.status).toBe('ready')
    })

    it('reloads the count when a different account signs in', async () => {
        mockRead.mockImplementation(async (uid: string) => (uid === 'user-1' ? 5 : 1))
        const { result, rerender } = await renderReady()
        expect(result.current.remaining).toBe(0)

        mockUseAuth.mockReturnValue({ user: { uid: 'user-2' }, loading: false })
        rerender()
        await waitFor(() => expect(result.current.used).toBe(1))
        expect(result.current.remaining).toBe(4)
    })
})
