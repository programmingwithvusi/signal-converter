import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetDoc = vi.fn()
const mockTxGet = vi.fn()
const mockTxSet = vi.fn()

vi.mock('../lib/firebase', () => ({ app: {}, auth: null }))
vi.mock('firebase/firestore/lite', () => ({
    getFirestore: vi.fn(() => 'db'),
    doc: vi.fn((_db, collection: string, id: string) => `${collection}/${id}`),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    serverTimestamp: vi.fn(() => 'server-ts'),
    runTransaction: vi.fn((_db, fn) => fn({ get: mockTxGet, set: mockTxSet })),
}))

import { readQuotaCount, recordConversion } from '../utils/quota'

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0)

function snapshot(data?: { count: unknown; atMs: number }) {
    return { data: () => (data ? { count: data.count, at: { toMillis: () => data.atMs } } : undefined) }
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    mockGetDoc.mockReset()
    mockTxGet.mockReset()
    mockTxSet.mockReset()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('readQuotaCount', () => {
    it("reads the account's own document", async () => {
        mockGetDoc.mockResolvedValue(snapshot())
        await readQuotaCount('user-1')
        expect(mockGetDoc).toHaveBeenCalledWith('quotas/user-1')
    })

    it('is zero when the account has never converted', async () => {
        mockGetDoc.mockResolvedValue(snapshot())
        expect(await readQuotaCount('user-1')).toBe(0)
    })

    it("returns today's count", async () => {
        mockGetDoc.mockResolvedValue(snapshot({ count: 3, atMs: NOW - 60_000 }))
        expect(await readQuotaCount('user-1')).toBe(3)
    })

    it('starts again at zero on a new UTC day', async () => {
        const yesterday = Date.UTC(2026, 9, 3, 23, 59, 59)
        mockGetDoc.mockResolvedValue(snapshot({ count: 5, atMs: yesterday }))
        expect(await readQuotaCount('user-1')).toBe(0)
    })

    it('ignores a malformed count', async () => {
        mockGetDoc.mockResolvedValue(snapshot({ count: 'lots', atMs: NOW }))
        expect(await readQuotaCount('user-1')).toBe(0)
    })
})

describe('recordConversion', () => {
    it('creates the count at one for a first conversion', async () => {
        mockTxGet.mockResolvedValue(snapshot())
        expect(await recordConversion('user-1')).toBe(1)
        expect(mockTxSet).toHaveBeenCalledWith('quotas/user-1', { count: 1, at: 'server-ts' })
    })

    it("adds one to today's count", async () => {
        mockTxGet.mockResolvedValue(snapshot({ count: 2, atMs: NOW - 1000 }))
        expect(await recordConversion('user-1')).toBe(3)
        expect(mockTxSet).toHaveBeenCalledWith('quotas/user-1', { count: 3, at: 'server-ts' })
    })

    it("restarts at one when the stored count is from an earlier day", async () => {
        mockTxGet.mockResolvedValue(snapshot({ count: 5, atMs: NOW - 2 * 24 * 60 * 60 * 1000 }))
        expect(await recordConversion('user-1')).toBe(1)
        expect(mockTxSet).toHaveBeenCalledWith('quotas/user-1', { count: 1, at: 'server-ts' })
    })

    it('rejects when the write is refused', async () => {
        mockTxGet.mockRejectedValue(new Error('permission-denied'))
        await expect(recordConversion('user-1')).rejects.toThrow('permission-denied')
    })
})
