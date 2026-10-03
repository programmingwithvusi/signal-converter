import { useState, type FormEvent, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { trackEvent } from '../utils/tracking';
import '../App.css';
import './auth.css';

type Mode = 'signin' | 'signup';

function messageFor(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists — sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts — try again in a few minutes.';
    case 'auth/popup-blocked':
      return 'Popup blocked — allow popups for this site and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="rack">
      <div className="grain" aria-hidden="true" />
      <header className="brand">
        <div className="brand__mark">
          <span className="dial" />
          <span className="dial" />
        </div>
        <div className="brand__text">
          <h1>SIGNAL</h1>
          <p>
            MP4 <span className="arrow">&#8594;</span> MP3 CONVERTER &mdash;
            RUNS LOCALLY IN YOUR BROWSER
          </p>
        </div>
      </header>
      <main className="panel">{children}</main>
    </div>
  );
}

function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = () =>
    run(async () => {
      const cred = await signInWithPopup(auth!, new GoogleAuthProvider());
      const isNew = getAdditionalUserInfo(cred)?.isNewUser;
      void trackEvent(isNew ? 'sign_up' : 'sign_in', { method: 'google' });
    });

  const withPassword = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth!, email, password);
        void trackEvent('sign_up', { method: 'password' });
      } else {
        await signInWithEmailAndPassword(auth!, email, password);
        void trackEvent('sign_in', { method: 'password' });
      }
    });
  };

  const resetPassword = () =>
    run(async () => {
      await sendPasswordResetEmail(auth!, email);
      setNotice('If that email has an account, a reset link is on its way.');
    });

  return (
    <section className="auth">
      <h2 className="auth__title">
        {mode === 'signin' ? 'Sign in to continue' : 'Create an account'}
      </h2>

      <button
        type="button"
        className="btn btn--ghost auth__wide"
        onClick={withGoogle}
        disabled={busy}
      >
        Continue with Google
      </button>

      <div className="auth__divider">or</div>

      <form className="auth__form" onSubmit={withPassword}>
        <label className="control-label" htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          className="auth__input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="control-label" htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          className="auth__input"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn--convert auth__wide"
          disabled={busy}
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      {error && (
        <p className="auth__message auth__message--error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="auth__message" role="status">
          {notice}
        </p>
      )}

      <div className="auth__links">
        <button
          type="button"
          className="auth__link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError('');
            setNotice('');
          }}
        >
          {mode === 'signin'
            ? 'Need an account? Sign up'
            : 'Have an account? Sign in'}
        </button>
        {mode === 'signin' && (
          <button
            type="button"
            className="auth__link"
            onClick={resetPassword}
            disabled={busy}
          >
            Forgot password?
          </button>
        )}
      </div>
    </section>
  );
}

export default function AuthGate({
  children,
}: {
  children: (account: ReactNode) => ReactNode;
}) {
  const { user, loading } = useAuth();

  if (!auth) {
    return (
      <Shell>
        <p className="auth__message auth__message--error" role="alert">
          Sign-in is not configured. Set the VITE_FIREBASE_* environment
          variables and rebuild.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <p className="auth__message" role="status">
          Checking session…
        </p>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <SignIn />
      </Shell>
    );
  }

  return children(
    <div className="account">
      <span className="account__email">{user.email}</span>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => signOut(auth!)}
      >
        Sign out
      </button>
    </div>,
  );
}
