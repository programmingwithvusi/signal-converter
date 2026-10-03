import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'

export function useAuth() {
    const [user, setUser] = useState<User | null>(auth?.currentUser ?? null)
    // Firebase restores a persisted session asynchronously — stay "loading" until the first callback.
    const [loading, setLoading] = useState(Boolean(auth))

    useEffect(() => {
        if (!auth) return
        return onAuthStateChanged(auth, (next) => {
            setUser(next)
            setLoading(false)
        })
    }, [])

    return { user, loading }
}
