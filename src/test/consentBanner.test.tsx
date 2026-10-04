import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockAddDoc = vi.fn();

vi.mock('../lib/firebase', () => ({ app: {}, auth: { currentUser: null } }));
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn((_db, name: string) => name),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  serverTimestamp: vi.fn(() => 'ts'),
}));

import ConsentBanner from '../components/ConsentBanner';
import { getConsent, setConsent } from '../utils/tracking';

function clearCookies() {
  document.cookie.split('; ').forEach((c) => {
    const name = c.split('=')[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  });
}

beforeEach(() => {
  clearCookies();
  sessionStorage.clear();
  mockAddDoc.mockReset();
  mockAddDoc.mockResolvedValue(undefined);
});

describe('ConsentBanner', () => {
  it('asks for consent on a first visit and tracks nothing yet', () => {
    render(<ConsentBanner />);
    expect(
      screen.getByRole('dialog', { name: /cookie consent/i }),
    ).toBeInTheDocument();
    expect(mockAddDoc).not.toHaveBeenCalled();
  });

  it('stores the choice, hides and records one visit when accepted', async () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getConsent()).toBe('granted');
    await vi.waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1));
    expect(mockAddDoc.mock.calls[0][1]).toMatchObject({ type: 'visit' });
  });

  it('stores the choice, hides and tracks nothing when declined', async () => {
    render(<ConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getConsent()).toBe('denied');
    // Give any stray async tracking call a chance to land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockAddDoc).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('signal_vid');
  });

  it('stays hidden for a returning visitor who already accepted, and counts the visit', async () => {
    setConsent('granted');
    render(<ConsentBanner />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(mockAddDoc).toHaveBeenCalledTimes(1));
  });

  it('stays hidden for a returning visitor who declined', async () => {
    setConsent('denied');
    render(<ConsentBanner />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});
