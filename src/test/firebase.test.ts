import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockInitializeApp = vi.fn()
const mockGetAuth = vi.fn()

vi.mock('firebase/app', () => ({ initializeApp: (...args: unknown[]) => mockInitializeApp(...args) }))
vi.mock('firebase/auth', () => ({ getAuth: (...args: unknown[]) => mockGetAuth(...args) }))

const CONFIG = {
    VITE_FIREBASE_API_KEY: 'test-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo',
    VITE_FIREBASE_APP_ID: '1:1:web:1',
}

// firebase.ts reads the env once at import, so each test loads a fresh copy.
async function loadWith(env: Record<string, string>) {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    vi.resetModules()
    return import('../lib/firebase')
}

beforeEach(() => {
    mockInitializeApp.mockReset()
    mockInitializeApp.mockReturnValue({ name: 'app' })
    mockGetAuth.mockReset()
    mockGetAuth.mockReturnValue({ name: 'auth' })
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('firebase', () => {
    it('initialises the app and auth from the four VITE_FIREBASE_* values', async () => {
        const { app, auth } = await loadWith(CONFIG)
        expect(mockInitializeApp).toHaveBeenCalledWith({
            apiKey: 'test-api-key',
            authDomain: 'demo.firebaseapp.com',
            projectId: 'demo',
            appId: '1:1:web:1',
        })
        expect(app).toEqual({ name: 'app' })
        expect(mockGetAuth).toHaveBeenCalledWith(app)
        expect(auth).toEqual({ name: 'auth' })
    })

    it('exports null instead of crashing when the API key is missing', async () => {
        const { app, auth } = await loadWith({ ...CONFIG, VITE_FIREBASE_API_KEY: '' })
        expect(app).toBeNull()
        expect(auth).toBeNull()
        expect(mockInitializeApp).not.toHaveBeenCalled()
        expect(mockGetAuth).not.toHaveBeenCalled()
    })

    it('exports null when the project ID is missing', async () => {
        const { app, auth } = await loadWith({ ...CONFIG, VITE_FIREBASE_PROJECT_ID: '' })
        expect(app).toBeNull()
        expect(auth).toBeNull()
        expect(mockInitializeApp).not.toHaveBeenCalled()
    })
})
