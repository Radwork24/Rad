import React, { useState } from 'react';
import radLogo from '../assets/logo.png';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface ContactUsPageProps {
  onBack: () => void;
  currentUser?: { username?: string } | null;
}

type FeedbackType = 'bug' | 'feature' | 'general';

export const ContactUsPage: React.FC<ContactUsPageProps> = ({ onBack, currentUser }) => {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [contactInfo, setContactInfo] = useState(currentUser?.username ? `@${currentUser.username}` : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getPlaceholder = () => {
    switch (feedbackType) {
      case 'bug':
        return 'What happened? Describe the unexpected behavior...';
      case 'feature':
        return 'What tool or enhancement would speed up your workflow?';
      case 'general':
        return 'Thoughts, suggestions, or general feedback on Rad...';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMessage('Please enter your note before sending.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const feedbackPayload = {
      type: feedbackType,
      message: message.trim(),
      contact: contactInfo.trim() || 'Anonymous',
      timestamp: Date.now(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      url: typeof window !== 'undefined' ? window.location.href : '',
    };

    try {
      try {
        await addDoc(collection(db, 'feedback'), {
          ...feedbackPayload,
          createdAt: serverTimestamp(),
        });
      } catch (firestoreErr) {
        console.warn('⚠️ [Rad Feedback] Firestore offline, saving locally:', firestoreErr);
      }

      try {
        const localKey = 'rad_user_feedback';
        const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
        existing.push(feedbackPayload);
        localStorage.setItem(localKey, JSON.stringify(existing));
      } catch {
        // ignore
      }

      setIsSubmitted(true);
      setMessage('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setMessage('');
    setErrorMessage(null);
  };

  return (
    <div style={styles.pageWrapper}>
      {/* Subtle Minimal Back Button in Top-Left */}
      <button onClick={onBack} style={styles.minimalBackBtn} title="Back">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
      </button>

      {/* Main Stage — Strictly in the center of the page */}
      <div style={styles.centerStage}>
        {/* Left Side: Canva Card with Rad Emblem */}
        <div style={styles.canvaCard}>
          <div style={styles.canvaInner}>
            <div style={styles.canvaGlow} />
            <img
              src={radLogo}
              alt="Rad Logo"
              style={styles.canvaLogo}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
            <div style={styles.canvaBadge}>
              <span style={styles.canvaBadgeDot} />
              <span style={styles.canvaBadgeText}>Direct Support</span>
            </div>
            <span style={styles.canvaSubLabel}>Engineered by Mohit & Abhay</span>
          </div>
        </div>

        {/* Right Side: Clean Typography & Minimalist Form */}
        <div style={styles.textSection}>
          <div style={styles.headerRow}>
            <h2 style={styles.title}>Contact & Feedback</h2>
            <span style={styles.subtitle}>Direct channel to Rad creators and systems engineers</span>
          </div>

          <div style={styles.dividerLine} />

          {isSubmitted ? (
            /* Minimalist Success Confirmation */
            <div style={styles.successWrapper}>
              <div style={styles.successIconPill}>✓</div>
              <h3 style={styles.successTitle}>Note Transmitted</h3>
              <p style={styles.successSubtitle}>
                Your message has been delivered directly to the team. We review every note to continuously evolve Rad.
              </p>
              <div style={styles.successActions}>
                <button onClick={handleReset} style={styles.secondaryBtn}>
                  Send Another
                </button>
                <button onClick={onBack} style={styles.primaryBtn}>
                  Back to Rad →
                </button>
              </div>
            </div>
          ) : (
            /* Minimalist Feedback Form */
            <form onSubmit={handleSubmit} style={styles.form}>
              {/* Type selector pills */}
              <div style={styles.typeSelector}>
                <button
                  type="button"
                  onClick={() => setFeedbackType('bug')}
                  style={{
                    ...styles.typeBtn,
                    ...(feedbackType === 'bug' ? styles.typeBtnActive : {}),
                  }}
                >
                  Bug Report
                </button>

                <button
                  type="button"
                  onClick={() => setFeedbackType('feature')}
                  style={{
                    ...styles.typeBtn,
                    ...(feedbackType === 'feature' ? styles.typeBtnActive : {}),
                  }}
                >
                  Feature Idea
                </button>

                <button
                  type="button"
                  onClick={() => setFeedbackType('general')}
                  style={{
                    ...styles.typeBtn,
                    ...(feedbackType === 'general' ? styles.typeBtnActive : {}),
                  }}
                >
                  General
                </button>
              </div>

              {/* Message Input */}
              <div style={styles.fieldGroup}>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={getPlaceholder()}
                  rows={4}
                  maxLength={2000}
                  style={styles.textarea}
                  required
                />
              </div>

              {/* Optional Contact Line */}
              <div style={styles.fieldGroup}>
                <input
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="Your username or email (optional)"
                  style={styles.textInput}
                />
              </div>

              {errorMessage && <span style={styles.errorText}>{errorMessage}</span>}

              {/* Minimal Submit Action */}
              <div style={styles.submitRow}>
                <span style={styles.charHint}>{message.length}/2000</span>
                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  style={{
                    ...styles.submitBtn,
                    opacity: isSubmitting || !message.trim() ? 0.45 : 1,
                    cursor: isSubmitting || !message.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Transmitting...' : 'Send Note →'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000000',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    userSelect: 'none',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  minimalBackBtn: {
    position: 'absolute',
    top: '28px',
    left: '32px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    transition: 'color 0.15s ease',
    zIndex: 10,
  },
  centerStage: {
    display: 'flex',
    alignItems: 'center',
    gap: '48px',
    maxWidth: '720px',
    width: '90%',
    boxSizing: 'border-box',
  },
  canvaCard: {
    width: '230px',
    height: '290px',
    backgroundColor: '#080808',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)',
  },
  canvaInner: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    position: 'relative',
  },
  canvaGlow: {
    position: 'absolute',
    width: '130px',
    height: '130px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    filter: 'blur(36px)',
    pointerEvents: 'none',
  },
  canvaLogo: {
    width: '64px',
    height: '64px',
    objectFit: 'contain',
    borderRadius: '12px',
    zIndex: 1,
    filter: 'drop-shadow(0 0 16px rgba(255, 255, 255, 0.25))',
  },
  canvaBadge: {
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  canvaBadgeDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)',
  },
  canvaBadgeText: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: 500,
    letterSpacing: '0.2px',
  },
  canvaSubLabel: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.35)',
    fontWeight: 500,
    letterSpacing: '0.2px',
    zIndex: 1,
  },
  textSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 650,
    color: '#ffffff',
    letterSpacing: '-0.4px',
    margin: 0,
  },
  subtitle: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: 400,
    letterSpacing: '-0.1px',
  },
  dividerLine: {
    height: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    margin: '18px 0',
    width: '100%',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  typeSelector: {
    display: 'flex',
    gap: '8px',
  },
  typeBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.45)',
    padding: '5px 11px',
    borderRadius: '16px',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  typeBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    color: '#ffffff',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#070707',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '10px 12px',
    color: '#ffffff',
    fontSize: '12.5px',
    lineHeight: 1.5,
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s ease',
  },
  textInput: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#070707',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#ffffff',
    fontSize: '12px',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s ease',
  },
  errorText: {
    fontSize: '11.5px',
    color: '#f87171',
  },
  submitRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '4px',
  },
  charHint: {
    fontSize: '10.5px',
    color: 'rgba(255, 255, 255, 0.25)',
  },
  submitBtn: {
    backgroundColor: '#ffffff',
    color: '#000000',
    border: 'none',
    padding: '7px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  successWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '12px 0',
  },
  successIconPill: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.4)',
    color: '#10b981',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
  },
  successTitle: {
    fontSize: '17px',
    fontWeight: 650,
    color: '#ffffff',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  successSubtitle: {
    fontSize: '12.5px',
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 1.5,
    margin: 0,
  },
  successActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '12px',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    color: 'rgba(255, 255, 255, 0.65)',
    padding: '6px 14px',
    borderRadius: '16px',
    fontSize: '11.5px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  primaryBtn: {
    backgroundColor: '#ffffff',
    border: 'none',
    color: '#000000',
    padding: '6px 16px',
    borderRadius: '16px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
