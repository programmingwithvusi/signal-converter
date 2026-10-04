import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddDoc = vi.fn()

vi.mock('../lib/firebase', () => ({ app: {}, auth: { currentUser: { uid: 'user-1' } } }))
vi.mock('firebase/firestore/lite', () => ({
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn((_db, name: string) => name),
    addDoc: (...args: unknown[]) => mockAddDoc(...args),
    serverTimestamp: vi.fn(() => 'ts'),
}))

import { getConsent, setConsent, trackEvent, trackVisitOnce } from '../utils/tracking'

function clearCookies() {
    document.cookie.split('; ').forEach((c) => {
        const name = c.split('=')[0]
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
    })
}

beforeEach(() => {
    clearCookies()
    sessionStorage.clear()
    mockAddDoc.mockReset()
    mockAddDoc.mockResolvedValue(undefined)
})

describe('tracking', () => {
    it('has no consent until the visitor chooses', () => {
        expect(getConsent()).toBeNull()
    })

    it('sends nothing and sets no visitor cookie without consent', async () => {
        await trackEvent('visit')
        setConsent('denied')
        await trackEvent('visit')
        expect(mockAddDoc).not.toHaveBeenCalled()
        expect(document.cookie).not.toContain('signal_vid')
    })

    it('records events with a stable visitor id once consent is granted', async () => {
        setConsent('granted')
        await trackEvent('conversion', { bitrate: '192k', inputBytes: 1024 })
        await trackEvent('sign_in', { method: 'google' })

        expect(mockAddDoc).toHaveBeenCalledTimes(2)
        const [collectionName, first] = mockAddDoc.mock.calls[0]
        const second = mockAddDoc.mock.calls[1][1]
        expect(collectionName).toBe('usage_events')
        expect(first).toMatchObject({ type: 'conversion', uid: 'user-1', bitrate: '192k', inputBytes: 1024 })
        expect(first.visitorId).toBeTruthy()
        expect(second.visitorId).toBe(first.visitorId)
    })

    it('removes the visitor cookie when consent is withdrawn', async () => {
        setConsent('granted')
        await trackEvent('visit')
        expect(document.cookie).toContain('signal_vid')
        setConsent('denied')
        expect(document.cookie).not.toContain('signal_vid')
    })

    it('counts one visit per session', async () => {
        setConsent('granted')
        trackVisitOnce()
        trackVisitOnce()
        await vi.waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1))
    })

    it('swallows write failures', async () => {
        setConsent('granted')
        mockAddDoc.mockRejectedValue(new Error('offline'))
        await expect(trackEvent('visit')).resolves.toBeUndefined()
    })
})
