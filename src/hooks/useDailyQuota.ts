import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { readQuotaCount, recordConversion } from '../utils/quota'

// Keep in step with the limit in firestore.rules — the rules reject writes above it.
// The emulator suite (npm run test:rules) fails if the two drift apart.
export const DEFAULT_DAILY_LIMIT = 5

function resolveDailyLimit(): number {
    const envLimit = Number(import.meta.env.VITE_DAILY_LIMIT)
    if (!Number.isNaN(envLimit) && envLimit > 0) return envLimit
    return DEFAULT_DAILY_LIMIT
}

export type QuotaStatus = 'loading' | 'ready' | 'error'

// Per-account daily quota, stored in Firestore so it follows the user across browsers.
export function useDailyQuota(limit = resolveDailyLimit()) {
    const { user } = useAuth()
    const uid = user?.uid
    const countRef = useRef(0)
    const [used, setUsed] = useState(0)
    const [loaded, setLoaded] = useState<{ uid: string; ok: boolean } | null>(null)

    useEffect(() => {
        if (!uid) return
        let cancelled = false
        readQuotaCount(uid)
            .then((count) => {
                if (cancelled) return
                countRef.current = count
                setUsed(count)
                setLoaded({ uid, ok: true })
            })
            .catch(() => {
                if (!cancelled) setLoaded({ uid, ok: false })
            })
        return () => {
            cancelled = true
        }
    }, [uid])

    // Without a known count nothing may convert: fail closed while loading, signed out or offline.
    const status: QuotaStatus = !uid ? 'error' : loaded?.uid !== uid ? 'loading' : loaded.ok ? 'ready' : 'error'
    const usedNow = status === 'ready' ? used : 0

    const remainingNow = useCallback(
        () => (status === 'ready' ? Math.max(0, limit - countRef.current) : 0),
        [limit, status]
    )

    const consume = useCallback(() => {
        countRef.current += 1
        setUsed(countRef.current)
        if (!uid) return
        recordConversion(uid)
            .then((serverCount) => {
                // Another tab or browser may have converted meanwhile — the higher count wins.
                if (serverCount > countRef.current) {
                    countRef.current = serverCount
                    setUsed(serverCount)
                }
            })
            .catch(() => {
                // Write refused or offline — the in-memory count still holds for this session.
            })
    }, [uid])

    return {
        limit,
        used: usedNow,
        remaining: status === 'ready' ? Math.max(0, limit - used) : 0,
        remainingNow,
        consume,
        status,
    }
}
