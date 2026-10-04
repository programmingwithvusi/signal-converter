import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

type Listener = (user: { uid: string } | null) => void

const mockUnsubscribe = vi.fn()
const mockOnAuthStateChanged = vi.fn()
// Mutable so a test can simulate missing Firebase config (auth === null) or a restored session.
const firebaseState = vi.hoisted(() => ({ auth: { currentUser: null } as { currentUser: unknown } | null }))

vi.mock('../lib/firebase', () => ({
    get auth() {
        return firebaseState.auth
    },
}))
vi.mock('firebase/auth', () => ({
    onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}))

import { useAuth } from '../hooks/useAuth'

function listener(): Listener {
    return mockOnAuthStateChanged.mock.calls[0][1]
}

beforeEach(() => {
    firebaseState.auth = { currentUser: null }
    mockUnsubscribe.mockReset()
    mockOnAuthStateChanged.mockReset()
    mockOnAuthStateChanged.mockReturnValue(mockUnsubscribe)
})

describe('useAuth', () => {
    it('stays loading until Firebase reports the session', () => {
        const { result } = renderHook(() => useAuth())
        expect(result.current).toEqual({ user: null, loading: true })
        expect(mockOnAuthStateChanged).toHaveBeenCalledWith(firebaseState.auth, expect.any(Function))
    })

    it('exposes the user once Firebase reports one', () => {
        const { result } = renderHook(() => useAuth())
        act(() => listener()({ uid: 'user-1' }))
        expect(result.current).toEqual({ user: { uid: 'user-1' }, loading: false })
    })

    it('stops loading with no user when nobody is signed in', () => {
        const { result } = renderHook(() => useAuth())
        act(() => listener()(null))
        expect(result.current).toEqual({ user: null, loading: false })
    })

    it('follows a later sign-out', () => {
        const { result } = renderHook(() => useAuth())
        act(() => listener()({ uid: 'user-1' }))
        act(() => listener()(null))
        expect(result.current.user).toBeNull()
    })

    it('starts from a session Firebase already holds', () => {
        firebaseState.auth = { currentUser: { uid: 'user-1' } }
        const { result } = renderHook(() => useAuth())
        expect(result.current.user).toEqual({ uid: 'user-1' })
    })

    it('unsubscribes when the component unmounts', () => {
        const { unmount } = renderHook(() => useAuth())
        expect(mockUnsubscribe).not.toHaveBeenCalled()
        unmount()
        expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
    })

    it('is signed out and not loading when Firebase is not configured', () => {
        firebaseState.auth = null
        const { result } = renderHook(() => useAuth())
        expect(result.current).toEqual({ user: null, loading: false })
        expect(mockOnAuthStateChanged).not.toHaveBeenCalled()
    })
})
