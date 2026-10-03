import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Without config the gate fails closed (AuthGate shows a setup message) rather than crashing at import.
export const app: FirebaseApp | null = config.apiKey && config.projectId ? initializeApp(config) : null
export const auth: Auth | null = app ? getAuth(app) : null
