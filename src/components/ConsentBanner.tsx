import { useEffect, useState } from 'react';
import {
  getConsent,
  setConsent,
  trackVisitOnce,
  type Consent,
} from '../utils/tracking';
import './auth.css';

export default function ConsentBanner() {
  const [consent, setConsentState] = useState<Consent | null>(getConsent);

  useEffect(() => {
    if (consent === 'granted') trackVisitOnce();
  }, [consent]);

  if (consent) return null;

  const choose = (choice: Consent) => {
    setConsent(choice);
    setConsentState(choice);
  };

  return (
    <aside className="consent" role="dialog" aria-label="Cookie consent">
      <p className="consent__text">
        We'd like to set a cookie to count visits and conversions, so we can
        see whether this tool is in demand. Your files never leave your browser.
      </p>
      <div className="consent__actions">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => choose('denied')}
        >
          Decline
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small consent__accept"
          onClick={() => choose('granted')}
        >
          Accept
        </button>
      </div>
    </aside>
  );
}
