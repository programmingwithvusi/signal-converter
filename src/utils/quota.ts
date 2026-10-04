import type { DocumentData } from 'firebase/firestore/lite'
import { app } from '../lib/firebase'

const QUOTA_COLLECTION = 'quotas'
const DAY_MS = 24 * 60 * 60 * 1000

// Days are UTC: firestore.rules can only compare against server time, so the client must agree with it.
function utcDay(ms: number): number {
    return Math.floor(ms / DAY_MS)
}

function countToday(data: DocumentData | undefined): number {
    const at = data?.at
    if (!at || typeof at.toMillis !== 'function') return 0
    if (utcDay(at.toMillis()) !== utcDay(Date.now())) return 0
    return typeof data.count === 'number' ? data.count : 0
}

async function quotaDoc(uid: string) {
    if (!app) throw new Error('Firebase is not configured.')
    const { getFirestore, doc } = await import('firebase/firestore/lite')
    const db = getFirestore(app)
    return { db, ref: doc(db, QUOTA_COLLECTION, uid) }
}

export async function readQuotaCount(uid: string): Promise<number> {
    const { ref } = await quotaDoc(uid)
    const { getDoc } = await import('firebase/firestore/lite')
    return countToday((await getDoc(ref)).data())
}

// Adds one conversion to today's count and returns the new total.
// Rejects if firestore.rules refuses the write (limit reached, or signed out).
export async function recordConversion(uid: string): Promise<number> {
    const { db, ref } = await quotaDoc(uid)
    const { runTransaction, serverTimestamp } = await import('firebase/firestore/lite')
    return runTransaction(db, async (tx) => {
        const next = countToday((await tx.get(ref)).data()) + 1
        tx.set(ref, { count: next, at: serverTimestamp() })
        return next
    })
}
