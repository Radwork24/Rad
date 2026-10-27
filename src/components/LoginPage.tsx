import React, { useState } from 'react';
import radLoginVideo from '../assets/rad_login.mp4';
import radLogo from '../assets/logo.png';
import {
  EyeIcon,
  EyeOffIcon,
} from './Icons';
import {
  registerUser,
  authenticateUser,
  type UserProfile,
} from '../services/userService';
import { ContactUsPage } from './ContactUsPage';

interface LoginPageProps {
  onLoginSuccess: (userData: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [showContactUs, setShowContactUs] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup form state
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [stream, setStream] = useState('');
  const [branch, setBranch] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (showContactUs) {
    return <ContactUsPage onBack={() => setShowContactUs(false)} />;
  }

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginUsername.trim()) {
      setErrorMsg('Please enter your username');
      return;
    }
    if (!loginPassword.trim()) {
      setErrorMsg('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await authenticateUser(loginUsername, loginPassword);
      onLoginSuccess(profile);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Signup submission
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!signupUsername.trim()) {
      setErrorMsg('Please choose a username');
      return;
    }
    if (!signupPassword.trim()) {
      setErrorMsg('Please enter a password');
      return;
    }
    if (!stream.trim()) {
      setErrorMsg('Please enter your stream (e.g. B.Tech, BCA, B.Sc)');
      return;
    }
    if (!branch.trim()) {
      setErrorMsg('Please enter your branch (e.g. Computer Science, AI, Mechanical)');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await registerUser(signupUsername, signupPassword, stream, branch);
      onLoginSuccess(profile);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'Google' | 'Apple') => {
    setIsLoading(true);
    const demoUser = provider === 'Google' ? 'GoogleUser' : 'AppleUser';
    try {
      const profile = await registerUser(demoUser, 'social_123', 'Engineering', 'Computer Science').catch(() => {
        return authenticateUser(demoUser, 'social_123');
      });
      onLoginSuccess(profile);
    } catch {
      onLoginSuccess({
        username: demoUser,
        stream: 'Engineering',
        branch: 'Computer Science',
        createdAt: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setErrorMsg('');
  };

  return (
    <div style={styles.pageWrapper}>
      {/* Top Navigation Bar */}
      <nav style={styles.navbar}>
        <div style={styles.brandWrapper}>
          <span style={styles.brandTitle}>Rad</span>
        </div>

        <div style={styles.navLinks}>
          <button style={styles.navDropdownBtn}>
            <span>Meet Rad</span>
          </button>
          <button style={styles.navDropdownBtn}>
            <span>Platform</span>
          </button>
          <button style={styles.navDropdownBtn}>
            <span>Solutions</span>
          </button>
          <button style={styles.navDropdownBtn}>
            <span>About</span>
          </button>
          <button
            style={{ ...styles.navDropdownBtn, cursor: 'pointer' }}
            onClick={() => setShowContactUs(true)}
          >
            <span>Contact Us</span>
          </button>
        </div>

        <div style={styles.navRightActions}></div>
      </nav>

      {/* Main Two-Column Split Layout */}
      <main style={styles.mainContainer}>
        {/* Left Column: Headline & Auth Box */}
        <section style={styles.leftColumn}>
          <div style={styles.authContentBox}>
            <div style={styles.authLogoBadge}>
              <img src={radLogo} alt="Rad Emblem" style={styles.heroLogoImg} />
            </div>
            <h1 style={styles.mainHeading}>Question what’s next</h1>
            <p style={styles.subHeading}>Your thinking partner for big ambitions</p>

            {/* Auth Form Card with Transition */}
            <div style={styles.authCard}>
              {/* Segmented Mode Toggle Pill */}
              <div style={styles.tabToggleRow}>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    ...styles.tabBtn,
                    backgroundColor: authMode === 'login' ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: authMode === 'login' ? '#ffffff' : '#8e8e8e',
                    fontWeight: authMode === 'login' ? 550 : 450,
                  }}
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  style={{
                    ...styles.tabBtn,
                    backgroundColor: authMode === 'signup' ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: authMode === 'signup' ? '#ffffff' : '#8e8e8e',
                    fontWeight: authMode === 'signup' ? 550 : 450,
                  }}
                >
                  Sign up
                </button>
              </div>

              {/* Login Form */}
              {authMode === 'login' ? (
                <form onSubmit={handleLoginSubmit} style={styles.formFade}>
                  <div style={styles.inputsWrapper}>
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="Username"
                      style={styles.textInput}
                    />

                    <div style={styles.passwordWrapper}>
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Password"
                        style={styles.textInput}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        style={styles.eyeBtn}
                        title={showLoginPassword ? 'Hide password' : 'Show password'}
                      >
                        {showLoginPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>
                  </div>

                  {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    style={styles.primarySubmitBtn}
                  >
                    {isLoading ? 'Logging in...' : 'Log in'}
                  </button>


                </form>
              ) : (
                /* Signup Form with username, password, stream, branch */
                <form onSubmit={handleSignupSubmit} style={styles.formFade}>
                  <div style={styles.inputsWrapper}>
                    <input
                      type="text"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      placeholder="Username"
                      style={styles.textInput}
                    />

                    <div style={styles.passwordWrapper}>
                      <input
                        type={showSignupPassword ? 'text' : 'password'}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="Password"
                        style={styles.textInput}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword((prev) => !prev)}
                        style={styles.eyeBtn}
                        title={showSignupPassword ? 'Hide password' : 'Show password'}
                      >
                        {showSignupPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                      </button>
                    </div>

                    <input
                      type="text"
                      value={stream}
                      onChange={(e) => setStream(e.target.value)}
                      placeholder="Stream (e.g. B.Tech, BCA, B.Sc)"
                      style={styles.textInput}
                    />

                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="Branch (e.g. Computer Science, AI, Mechanical)"
                      style={styles.textInput}
                    />
                  </div>

                  {errorMsg && <div style={styles.errorText}>{errorMsg}</div>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    style={styles.primarySubmitBtn}
                  >
                    {isLoading ? 'Creating account...' : 'Create account'}
                  </button>


                </form>
              )}

            </div>


          </div>
        </section>

        {/* Right Column: Video Showcase */}
        <section style={styles.rightColumn}>
          <div style={styles.videoCard}>
            <video
              src={radLoginVideo}
              autoPlay
              loop
              muted
              playsInline
              style={styles.videoPlayer}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#000000',
    color: '#ffffff',
    overflow: 'hidden',
  },
  navbar: {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    borderBottom: '1px solid transparent',
    zIndex: 10,
  },
  brandWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  navLogoImg: {
    height: '36px',
    width: 'auto',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 2px 10px rgba(59, 130, 246, 0.4))',
  },
  brandTitle: {
    fontFamily: 'var(--font-sans)',
    fontSize: '22px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.3px',
  },
  authLogoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    marginBottom: '20px',
  },
  heroLogoImg: {
    height: '100px',
    width: 'auto',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 6px 28px rgba(59, 130, 246, 0.45)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.9))',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  navDropdownBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#b4b4b4',
    fontSize: '13.5px',
    fontWeight: 450,
    transition: 'color 0.15s',
  },
  navRightActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  contactSalesBtn: {
    backgroundColor: '#171717',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '13.5px',
    fontWeight: 450,
    padding: '7px 15px',
    borderRadius: '8px',
    transition: 'background-color 0.15s',
  },
  tryBtn: {
    backgroundColor: '#ffffff',
    color: '#000000',
    fontSize: '13.5px',
    fontWeight: 600,
    padding: '7px 16px',
    borderRadius: '9999px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, transform 0.1s',
  },
  mainContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  leftColumn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 40px',
    overflowY: 'auto',
  },
  authContentBox: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '16px 0',
  },
  mainHeading: {
    fontFamily: 'var(--font-sans)',
    fontSize: '44px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-1px',
    lineHeight: 1.15,
    margin: 0,
    textShadow: '0 0 32px rgba(255, 255, 255, 0.28), 0 0 2px rgba(255, 255, 255, 0.7)',
  },
  subHeading: {
    fontFamily: 'var(--font-sans)',
    fontSize: '16px',
    color: '#b4b4b4',
    margin: '8px 0 20px',
    lineHeight: 1.4,
  },
  authCard: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '20px 22px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255,255,255,0.06)',
    transition: 'all 0.25s ease',
  },
  tabToggleRow: {
    display: 'flex',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '9999px',
    padding: '3px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    marginBottom: '4px',
  },
  tabBtn: {
    flex: 1,
    padding: '6px 0',
    borderRadius: '9999px',
    fontSize: '13px',
    transition: 'all 0.18s ease',
  },
  formFade: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  inputsWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  textInput: {
    width: '100%',
    height: '42px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '0 14px',
    color: '#ffffff',
    fontSize: '13.5px',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  eyeBtn: {
    position: 'absolute',
    right: '12px',
    color: '#8e8e8e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '4px',
    transition: 'color 0.15s',
  },
  primarySubmitBtn: {
    width: '100%',
    height: '42px',
    backgroundColor: '#ffffff',
    color: '#000000',
    borderRadius: '12px',
    fontWeight: 600,
    fontSize: '14px',
    border: 'none',
    cursor: 'pointer',
    marginTop: '2px',
    transition: 'background-color 0.15s, opacity 0.15s',
  },
  switchModeRow: {
    fontSize: '12.5px',
    marginTop: '2px',
    color: '#b4b4b4',
  },
  switchLink: {
    color: '#ffffff',
    fontWeight: 600,
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },
  errorText: {
    color: '#f87171',
    fontSize: '12px',
    textAlign: 'left',
    paddingLeft: '2px',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    margin: '4px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    padding: '0 10px',
    color: '#8e8e8e',
    fontSize: '10.5px',
    fontWeight: 500,
    letterSpacing: '0.5px',
  },
  socialButtonsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  socialBtn: {
    width: '100%',
    height: '40px',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 450,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#171717',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '12px',
    padding: '7px 15px',
    color: '#ececec',
    fontSize: '12.5px',
    fontWeight: 450,
    marginTop: '16px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  rightColumn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 36px 24px 16px',
    height: '100%',
  },
  videoCard: {
    width: '100%',
    maxWidth: '680px',
    height: '100%',
    maxHeight: '660px',
    borderRadius: '24px',
    overflow: 'hidden',
    backgroundColor: '#171717',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
};
