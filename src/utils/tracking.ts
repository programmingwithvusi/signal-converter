export type Consent = 'granted' | 'denied'
export type UsageEventType = 'visit' | 'sign_in' | 'sign_up' | 'conversion'

type UsageEventData = {
    method?: 'google' | 'password'
    bitrate?: string
    inputBytes?: number
}

const CONSENT_COOKIE = 'signal_consent'
const VISITOR_COOKIE = 'signal_vid'
const VISIT_SESSION_KEY = 'signal_visit_tracked'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365
const EVENTS_COLLECTION = 'usage_events'

// --- Cookies ---

function readCookie(name: string): string | null {
    const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`
}

// --- Consent ---

export function getConsent(): Consent | null {
    const value = readCookie(CONSENT_COOKIE)
    return value === 'granted' || value === 'denied' ? value : null
}

export function setConsent(consent: Consent): void {
    writeCookie(CONSENT_COOKIE, consent, ONE_YEAR_SECONDS)
    if (consent === 'denied') writeCookie(VISITOR_COOKIE, '', 0)
}

// --- Events ---

function visitorId(): string {
    const existing = readCookie(VISITOR_COOKIE)
    if (existing) return existing
    const id = crypto.randomUUID()
    writeCookie(VISITOR_COOKIE, id, ONE_YEAR_SECONDS)
    return id
}

export async function trackEvent(type: UsageEventType, data: UsageEventData = {}): Promise<void> {
    if (getConsent() !== 'granted') return
    try {
        const { app, auth } = await import('../lib/firebase')
        if (!app) return
        const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore/lite')
        await addDoc(collection(getFirestore(app), EVENTS_COLLECTION), {
            type,
            visitorId: visitorId(),
            uid: auth?.currentUser?.uid ?? null,
            at: serverTimestamp(),
            ...data,
        })
    } catch {
        // Analytics must never break the app (offline, ad blocker, rules rejection).
    }
}

// One "visit" per browser tab session, however many times the page re-renders or reloads.
export function trackVisitOnce(): void {
    try {
        if (sessionStorage.getItem(VISIT_SESSION_KEY)) return
        sessionStorage.setItem(VISIT_SESSION_KEY, '1')
    } catch {
        // Storage disabled — fall through and count the visit anyway.
    }
    void trackEvent('visit')
}
