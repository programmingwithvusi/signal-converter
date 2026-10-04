// Runs against the Firestore emulator: npm run test:rules
import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest'
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { DEFAULT_DAILY_LIMIT } from '../../hooks/useDailyQuota'

let env: RulesTestEnvironment

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anonymous = () => env.unauthenticatedContext().firestore()

// Writes a document with rules switched off, to set up state the rules would refuse.
async function seed(path: string, data: Record<string, unknown>) {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
}

beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-signal-converter', firestore: { rules } })
})

beforeEach(async () => {
    await env.clearFirestore()
})

afterAll(async () => {
    await env.cleanup()
})

describe('quotas', () => {
    const count = (n: number) => ({ count: n, at: serverTimestamp() })

    it('lets an account read only its own count', async () => {
        await seed('quotas/alice', { count: 2, at: Timestamp.now() })
        await assertSucceeds(getDoc(doc(as('alice'), 'quotas/alice')))
        await assertFails(getDoc(doc(as('bob'), 'quotas/alice')))
        await assertFails(getDoc(doc(anonymous(), 'quotas/alice')))
    })

    it('lets an account start its own count at one, and nothing else', async () => {
        await assertFails(setDoc(doc(as('alice'), 'quotas/alice'), count(2)))
        await assertFails(setDoc(doc(as('alice'), 'quotas/alice'), count(0)))
        await assertFails(setDoc(doc(as('bob'), 'quotas/alice'), count(1)))
        await assertFails(setDoc(doc(anonymous(), 'quotas/alice'), count(1)))
        await assertSucceeds(setDoc(doc(as('alice'), 'quotas/alice'), count(1)))
    })

    it('refuses a malformed document', async () => {
        const ref = doc(as('alice'), 'quotas/alice')
        await assertFails(setDoc(ref, { count: 1 }))
        await assertFails(setDoc(ref, { count: 1, at: Timestamp.fromMillis(0) }))
        await assertFails(setDoc(ref, { count: '1', at: serverTimestamp() }))
        await assertFails(setDoc(ref, { ...count(1), extra: true }))
    })

    it(`allows exactly ${DEFAULT_DAILY_LIMIT} conversions in a day, one at a time`, async () => {
        const ref = doc(as('alice'), 'quotas/alice')
        for (let n = 1; n <= DEFAULT_DAILY_LIMIT; n++) {
            await assertSucceeds(setDoc(ref, count(n)))
        }
        await assertFails(setDoc(ref, count(DEFAULT_DAILY_LIMIT + 1)))
    })

    it('refuses skipping ahead, repeating, lowering or resetting the count', async () => {
        await seed('quotas/alice', { count: 2, at: Timestamp.now() })
        const ref = doc(as('alice'), 'quotas/alice')
        await assertFails(setDoc(ref, count(4)))
        await assertFails(setDoc(ref, count(2)))
        await assertFails(setDoc(ref, count(1)))
        await assertFails(setDoc(ref, count(0)))
        await assertSucceeds(setDoc(ref, count(3)))
    })

    it('starts again at one on a new day, and only at one', async () => {
        const twoDaysAgo = Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000)
        await seed('quotas/alice', { count: DEFAULT_DAILY_LIMIT, at: twoDaysAgo })
        const ref = doc(as('alice'), 'quotas/alice')
        await assertFails(setDoc(ref, count(DEFAULT_DAILY_LIMIT + 1)))
        await assertFails(setDoc(ref, count(2)))
        await assertSucceeds(setDoc(ref, count(1)))
    })

    it('never allows a delete', async () => {
        await seed('quotas/alice', { count: 5, at: Timestamp.now() })
        await assertFails(deleteDoc(doc(as('alice'), 'quotas/alice')))
    })
})

describe('usage_events', () => {
    const event = (extra: Record<string, unknown> = {}) => ({
        type: 'visit',
        visitorId: 'visitor-1',
        uid: null,
        at: serverTimestamp(),
        ...extra,
    })

    it('accepts a well-formed event from a signed-out visitor', async () => {
        await assertSucceeds(addDoc(collection(anonymous(), 'usage_events'), event()))
    })

    it('accepts an event carrying the signed-in user\'s own id, and no one else\'s', async () => {
        const events = collection(as('alice'), 'usage_events')
        await assertSucceeds(addDoc(events, event({ type: 'conversion', uid: 'alice', bitrate: '192k', inputBytes: 10 })))
        await assertFails(addDoc(events, event({ uid: 'bob' })))
        await assertFails(addDoc(collection(anonymous(), 'usage_events'), event({ uid: 'alice' })))
    })

    it('refuses unknown event types, unknown fields and a client-chosen time', async () => {
        const events = collection(anonymous(), 'usage_events')
        await assertFails(addDoc(events, event({ type: 'purchase' })))
        await assertFails(addDoc(events, event({ fileName: 'holiday.mp4' })))
        await assertFails(addDoc(events, event({ at: Timestamp.fromMillis(0) })))
        await assertFails(addDoc(events, event({ visitorId: 'x'.repeat(65) })))
    })

    it('is write-only: nobody can read, change or delete an event', async () => {
        await seed('usage_events/e1', { type: 'visit', visitorId: 'visitor-1', uid: null, at: Timestamp.now() })
        const ref = doc(as('alice'), 'usage_events/e1')
        await assertFails(getDoc(ref))
        await assertFails(setDoc(ref, event()))
        await assertFails(deleteDoc(ref))
    })
})
