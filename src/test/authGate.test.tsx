import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockUseAuth = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockPopup = vi.fn();
const mockUserInfo = vi.fn();
const mockReset = vi.fn();
const mockTrack = vi.fn();
// Mutable so a test can simulate missing VITE_FIREBASE_* config (auth === null).
const firebaseState = vi.hoisted(() => ({ auth: {} as object | null }));

vi.mock('../lib/firebase', () => ({
  app: {},
  get auth() {
    return firebaseState.auth;
  },
}));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('../utils/tracking', () => ({
  trackEvent: (...args: unknown[]) => mockTrack(...args),
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  getAdditionalUserInfo: (...args: unknown[]) => mockUserInfo(...args),
  signInWithPopup: (...args: unknown[]) => mockPopup(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockReset(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignIn(...args),
  createUserWithEmailAndPassword: (...args: unknown[]) => mockSignUp(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import AuthGate from '../components/AuthGate';

function renderGate() {
  return render(
    <AuthGate>
      {(account) => (
        <div>
          {account}
          <p>protected app</p>
        </div>
      )}
    </AuthGate>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
  mockSignIn.mockReset();
  mockSignUp.mockReset();
  mockSignOut.mockReset();
  mockPopup.mockReset();
  mockUserInfo.mockReset();
  mockReset.mockReset();
  mockTrack.mockReset();
  firebaseState.auth = {};
});

describe('AuthGate', () => {
  it('hides the app and shows the sign-in form when signed out', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderGate();
    expect(screen.queryByText('protected app')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('hides the app while the session is being restored', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderGate();
    expect(screen.queryByText('protected app')).not.toBeInTheDocument();
    expect(screen.getByText(/checking session/i)).toBeInTheDocument();
  });

  it('renders the app with a sign-out control when signed in', () => {
    mockUseAuth.mockReturnValue({
      user: { email: 'a@b.co' },
      loading: false,
    });
    renderGate();
    expect(screen.getByText('protected app')).toBeInTheDocument();
    expect(screen.getByText('a@b.co')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('signs in with email and password', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockSignIn.mockResolvedValue({});
    renderGate();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.co' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({}, 'a@b.co', 'secret1'),
    );
  });

  it('shows a friendly error when credentials are rejected', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    renderGate();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.co' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong12' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /incorrect email or password/i,
    );
  });

  it('creates an account in sign-up mode', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockSignUp.mockResolvedValue({});
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /need an account/i }));
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@b.co' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({}, 'new@b.co', 'secret1'),
    );
  });

  it('shows a setup message instead of the form when Firebase is not configured', () => {
    firebaseState.auth = null;
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderGate();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /sign-in is not configured/i,
    );
    expect(screen.queryByText('protected app')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /continue with google/i }),
    ).not.toBeInTheDocument();
  });

  it('signs in with Google and records a returning user as sign_in', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockPopup.mockResolvedValue({ user: {} });
    mockUserInfo.mockReturnValue({ isNewUser: false });
    renderGate();
    fireEvent.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    await waitFor(() =>
      expect(mockTrack).toHaveBeenCalledWith('sign_in', { method: 'google' }),
    );
    expect(mockPopup).toHaveBeenCalledTimes(1);
    expect(mockPopup.mock.calls[0][0]).toBe(firebaseState.auth);
  });

  it('records a first-time Google user as sign_up', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockPopup.mockResolvedValue({ user: {} });
    mockUserInfo.mockReturnValue({ isNewUser: true });
    renderGate();
    fireEvent.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    await waitFor(() =>
      expect(mockTrack).toHaveBeenCalledWith('sign_up', { method: 'google' }),
    );
  });

  it('shows no error when the Google popup is closed', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    renderGate();
    const google = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(google);
    await waitFor(() => expect(google).toBeEnabled());
    expect(mockPopup).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('tells the user when the Google popup is blocked', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    renderGate();
    fireEvent.click(
      screen.getByRole('button', { name: /continue with google/i }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/popup blocked/i);
  });

  it('sends a password reset email and confirms it', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockReset.mockResolvedValue(undefined);
    renderGate();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.co' },
    });
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /reset link is on its way/i,
    );
    expect(mockReset).toHaveBeenCalledWith({}, 'a@b.co');
  });

  it('shows an error when a reset is requested without a valid email', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockReset.mockRejectedValue({ code: 'auth/missing-email' });
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /enter a valid email address/i,
    );
  });

  it('does not offer password reset in sign-up mode', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /need an account/i }));
    expect(
      screen.queryByRole('button', { name: /forgot password/i }),
    ).not.toBeInTheDocument();
  });
});
