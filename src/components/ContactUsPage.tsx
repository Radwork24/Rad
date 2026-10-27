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
  const [contactInfo, setContactInfo] = useState(currentUser?.username || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getPlaceholder = () => {
    switch (feedbackType) {
      case 'bug':
        return 'Describe the bug you encountered... What were you doing, and what happened unexpectedly?';
      case 'feature':
        return 'What feature or tool would you like to see added to Rad? How would it improve your workflow?';
      case 'general':
        return 'Share your thoughts, suggestions, or any general feedback about Rad...';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setErrorMessage('Please enter your message before submitting.');
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
      // 1. Save to Firestore
      try {
        await addDoc(collection(db, 'feedback'), {
          ...feedbackPayload,
          createdAt: serverTimestamp(),
        });
        console.log('✅ [Rad Feedback] Saved successfully to Firestore');
      } catch (firestoreErr) {
        console.warn('⚠️ [Rad Feedback] Firestore offline or notice, saving locally:', firestoreErr);
      }

      // 2. Cache in localStorage as backup
      try {
        const localKey = 'rad_user_feedback';
        const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
        existing.push(feedbackPayload);
        localStorage.setItem(localKey, JSON.stringify(existing));
      } catch (storageErr) {
        // ignore
      }

      setIsSubmitted(true);
      setMessage('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Something went wrong. Please try again.');
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
    <div style={styles.pageContainer}>
      {/* Background glow effects */}
      <div style={styles.radialGlow} />
      <div style={styles.gridOverlay} />

      {/* Top Navigation */}
      <header style={styles.header}>
        <div style={styles.brand} onClick={onBack} title="Return to Rad">
          <span style={styles.brandText}>Rad</span>
        </div>

        <button onClick={onBack} style={styles.backBtn}>
          <span style={styles.backArrow}>←</span>
          <span>Back</span>
        </button>
      </header>

      {/* Center Content Container */}
      <main style={styles.mainContent}>
        <div style={styles.card}>
          {/* Logo Badge */}
          <div style={styles.heroLogoWrapper}>
            <img src={radLogo} alt="Rad Emblem" style={styles.heroLogo} />
          </div>

          <h1 style={styles.title}>Contact Us</h1>
          <p style={styles.subtitle}>
            Have a bug report or a feature idea for Rad? Let us know directly below.
          </p>

          {isSubmitted ? (
            /* Success confirmation screen */
            <div style={styles.successBox}>
              <div style={styles.successIconWrapper}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={styles.successTitle}>Thank you!</h3>
              <p style={styles.successMessage}>
                Your feedback has been received. Our team reviews every suggestion and bug report to make Rad even better.
              </p>
              <div style={styles.successActions}>
                <button onClick={handleReset} style={styles.secondaryBtn}>
                  Send another note
                </button>
                <button onClick={onBack} style={styles.primaryBtn}>
                  Back to Rad
                </button>
              </div>
            </div>
          ) : (
            /* Feedback Form */
            <form onSubmit={handleSubmit} style={styles.form}>
              {/* Type selector tabs */}
              <div style={styles.typeSelector}>
                <button
                  type="button"
                  onClick={() => setFeedbackType('bug')}
                  style={{
                    ...styles.typeBtn,
                    ...(feedbackType === 'bug' ? styles.typeBtnActive : {}),
                  }}
                >
                  <span>Report a Bug</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeedbackType('feature')}
                  style={{
                    ...styles.typeBtn,
                    ...(feedbackType === 'feature' ? styles.typeBtnActive : {}),
                  }}
                >
                  <span>Suggest a Feature</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFeedbackType('general')}
                  style={{
                    ...styles.typeBtn,
                    ...(feedbackType === 'general' ? styles.typeBtnActive : {}),
                  }}
                >
                  <span>General Feedback</span>
                </button>
              </div>

              {/* Main Center Message Textarea */}
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>
                  {feedbackType === 'bug' && 'Bug Details'}
                  {feedbackType === 'feature' && 'Feature Proposal'}
                  {feedbackType === 'general' && 'Your Message'}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={getPlaceholder()}
                  rows={6}
                  maxLength={2500}
                  style={styles.textarea}
                  required
                />
                <div style={styles.charCounter}>
                  {message.length} / 2500
                </div>
              </div>

              {/* Optional Contact / Username */}
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>
                  Your Name or Email <span style={styles.optionalTag}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="e.g. name@example.com or username"
                  style={styles.textInput}
                />
              </div>

              {errorMessage && (
                <div style={styles.errorMessage}>{errorMessage}</div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                style={{
                  ...styles.submitBtn,
                  opacity: isSubmitting || !message.trim() ? 0.6 : 1,
                  cursor: isSubmitting || !message.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? (
                  <span>Sending feedback...</span>
                ) : (
                  <>
                    <span>Submit Feedback</span>
                    <span style={{ fontSize: '15px' }}>→</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageContainer: {
    minHeight: '100vh',
    width: '100vw',
    backgroundColor: '#000000',
    color: '#ffffff',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'hidden',
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  radialGlow: {
    position: 'absolute',
    top: '-10%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '800px',
    height: '450px',
    background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.05) 45%, transparent 70%)',
    filter: 'blur(40px)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
    backgroundSize: '48px 48px',
    pointerEvents: 'none',
    zIndex: 1,
  },
  header: {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    position: 'relative',
    zIndex: 10,
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  brandLogo: {
    height: '30px',
    width: 'auto',
    objectFit: 'contain',
    filter: 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.5))',
  },
  brandText: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.3px',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '9999px',
    color: '#e2e8f0',
    fontSize: '13.5px',
    fontWeight: 500,
    padding: '7px 18px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    backdropFilter: 'blur(10px)',
  },
  backArrow: {
    fontSize: '15px',
    transition: 'transform 0.15s ease',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px 60px',
    position: 'relative',
    zIndex: 5,
  },
  card: {
    width: '100%',
    maxWidth: '620px',
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    padding: '36px 36px 32px',
    backdropFilter: 'blur(24px)',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04) inset',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  heroLogoWrapper: {
    marginBottom: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLogo: {
    height: '68px',
    width: 'auto',
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 20px rgba(59, 130, 246, 0.5)) drop-shadow(0 0 10px rgba(0, 0, 0, 0.8))',
  },
  title: {
    fontSize: '28px',
    fontWeight: 650,
    color: '#ffffff',
    letterSpacing: '-0.5px',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255, 255, 255, 0.65)',
    margin: '0 0 28px 0',
    maxWidth: '460px',
    lineHeight: 1.5,
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    textAlign: 'left',
  },
  typeSelector: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: '4px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  typeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '9px 8px',
    borderRadius: '9px',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '12.5px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  typeBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    color: '#ffffff',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
  },
  typeEmoji: {
    fontSize: '13px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    position: 'relative',
  },
  inputLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  optionalTag: {
    fontSize: '11.5px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: 400,
  },
  textarea: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '14px',
    padding: '14px 16px',
    color: '#ffffff',
    fontSize: '14px',
    lineHeight: 1.55,
    outline: 'none',
    resize: 'vertical',
    minHeight: '120px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, background-color 0.2s, box-shadow 0.2s',
  },
  charCounter: {
    alignSelf: 'flex-end',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.35)',
    marginTop: '2px',
  },
  textInput: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '12px',
    padding: '11px 14px',
    color: '#ffffff',
    fontSize: '13.5px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, background-color 0.2s',
  },
  errorMessage: {
    fontSize: '12.5px',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: '8px',
    padding: '8px 12px',
    textAlign: 'center',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    backgroundColor: '#ffffff',
    color: '#000000',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 600,
    marginTop: '6px',
    boxShadow: '0 4px 18px rgba(255, 255, 255, 0.12)',
    transition: 'all 0.15s ease',
  },
  successBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '24px 12px',
    gap: '14px',
  },
  successIconWrapper: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    border: '1px solid rgba(59, 130, 246, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '6px',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.25)',
  },
  successTitle: {
    fontSize: '22px',
    fontWeight: 650,
    color: '#ffffff',
    margin: 0,
  },
  successMessage: {
    fontSize: '13.5px',
    color: 'rgba(255, 255, 255, 0.7)',
    maxWidth: '420px',
    lineHeight: 1.5,
    margin: 0,
  },
  successActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
    width: '100%',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: '#ffffff',
    color: '#000000',
    border: 'none',
    borderRadius: '9999px',
    padding: '10px 22px',
    fontSize: '13.5px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '9999px',
    padding: '10px 20px',
    fontSize: '13.5px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
