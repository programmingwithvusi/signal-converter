import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockUseAuth = vi.fn();
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../lib/firebase', () => ({ app: {}, auth: {} }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  getAdditionalUserInfo: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
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
});
