import { useState, useEffect, useRef, useCallback } from 'react';
import { process as buildProxyUrl } from '/src/utils/hooks/loader/utils';

const PROXY_TARGET = 'https://winstonwebsite.vercel.app';

const STEPS = [
  { message: 'Loading...',                    title: 'Loading...',      emoji: '⏳' },
  { message: 'Opening window, please wait...', title: 'Please wait...',  emoji: '🔄' },
  { message: 'Almost there...',               title: 'Almost there...',  emoji: '⚡' },
  { message: 'Redirecting now...',            title: 'Redirecting...',   emoji: '🚀' },
];

const DONE_STEP = { message: 'Window opened! ✓', title: 'Done', emoji: '✅' };
const CLOSE_MSG = 'You can close this tab now.';

function setFavicon(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">${emoji}</text></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

const Home = () => {
  const [step, setStep] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [showFallback, setShowFallback] = useState(false);
  const [done, setDone] = useState(false);
  const [closeMsg, setCloseMsg] = useState('');
  const opened = useRef(false);

  // Build the proxy URL and open it in a hidden-URL-bar new tab (about:blank + iframe)
  const openProxiedTab = useCallback(() => {
    if (opened.current) return;

    // Build the encoded proxy URL using the site's built-in proxy system
    const proxyUrl = buildProxyUrl(PROXY_TARGET, false, 'auto');
    if (!proxyUrl) {
      setShowFallback(true);
      return;
    }

    // Open a new about:blank tab with an iframe — hides the URL bar
    const win = window.open('', '_blank');
    if (!win || win.closed) {
      // Popup was blocked
      setShowFallback(true);
      return;
    }

    opened.current = true;

    // Write the iframe into the new tab
    win.document.documentElement.style.height = '100%';
    win.document.body.style.margin = '0';
    win.document.body.style.height = '100%';
    win.document.body.style.overflow = 'hidden';
    const iframe = win.document.createElement('iframe');
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.margin = '0';
    iframe.style.display = 'block';
    iframe.src = proxyUrl;
    win.document.body.appendChild(iframe);

    // Update loading screen to show success
    setDone(true);
    setFavicon(DONE_STEP.emoji);
    document.title = DONE_STEP.title;

    // Try to auto-close this tab after a brief moment
    setTimeout(() => {
      window.close();
      // If window.close() didn't work (browser restriction),
      // show a message telling the user they can close the tab
      setTimeout(() => {
        setCloseMsg(CLOSE_MSG);
      }, 300);
    }, 600);
  }, []);

  useEffect(() => {
    // Set initial favicon and title
    setFavicon(STEPS[0].emoji);
    document.title = STEPS[0].title;

    // Cycle through loading messages
    const stepInterval = setInterval(() => {
      if (opened.current) return;
      setFadeIn(false);
      setTimeout(() => {
        setStep((prev) => {
          const next = Math.min(prev + 1, STEPS.length - 1);
          if (!opened.current) {
            setFavicon(STEPS[next].emoji);
            document.title = STEPS[next].title;
          }
          return next;
        });
        setFadeIn(true);
      }, 300);
    }, 650);

    // Open the proxied tab after ~2.6s
    const openTimer = setTimeout(() => {
      openProxiedTab();
    }, 2600);

    // Show fallback button 2s after "Redirecting now..." appears (~4.6s total)
    const fallbackTimer = setTimeout(() => {
      if (!opened.current) {
        setShowFallback(true);
      }
    }, 4600);

    return () => {
      clearInterval(stepInterval);
      clearTimeout(openTimer);
      clearTimeout(fallbackTimer);
    };
  }, [openProxiedTab]);

  const currentMsg = done ? DONE_STEP.message : STEPS[step].message;
  const progress = done ? 100 : Math.min(((step + 1) / STEPS.length) * 100, 100);

  return (
    <div style={styles.container}>
      {/* Subtle radial glow */}
      <div style={styles.glowOrb} />

      {/* Spinner — hide when done */}
      {!done && (
        <div style={styles.spinnerWrapper}>
          <div style={styles.spinnerOuter}>
            <div style={styles.spinnerInner} />
          </div>
        </div>
      )}

      {/* Checkmark when done */}
      {done && <div style={styles.checkmark}>✓</div>}

      {/* Message */}
      <p
        style={{
          ...styles.message,
          opacity: fadeIn || done ? 1 : 0,
          transform: fadeIn || done ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        {currentMsg}
      </p>

      {/* "You can close this tab" message */}
      {closeMsg && (
        <p style={styles.closeMsg}>{closeMsg}</p>
      )}

      {/* Progress bar */}
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${progress}%`,
            ...(done ? { background: '#4a9a6a', animation: 'none' } : {}),
          }}
        />
      </div>

      {/* Step dots */}
      <div style={styles.dotsRow}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.dot,
              backgroundColor: i <= step || done ? (done ? '#4a9a6a' : '#6c8ebf') : '#1f324e',
              transform: i <= step || done ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {/* Fallback button — shown if popup blocked or proxy failed */}
      <div
        style={{
          ...styles.fallbackWrapper,
          opacity: showFallback && !done ? 1 : 0,
          pointerEvents: showFallback && !done ? 'auto' : 'none',
        }}
      >
        <button
          onClick={openProxiedTab}
          style={styles.fallbackButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1a2d45';
            e.currentTarget.style.borderColor = '#6c8ebf';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(108, 142, 191, 0.3)';
            e.currentTarget.style.color = '#ecf6ff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#141d2b';
            e.currentTarget.style.borderColor = '#4a6a94';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(108, 142, 191, 0.15)';
            e.currentTarget.style.color = '#c1d4f1';
          }}
        >
          Didn't open? Click here
        </button>
      </div>

      {/* Keyframes */}
      <style>{keyframes}</style>
    </div>
  );
};

const keyframes = `
  @keyframes loaderSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.55; transform: translate(-50%, -50%) scale(1.08); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes borderPulse {
    0%, 100% { border-color: #4a6a94; box-shadow: 0 0 12px rgba(108, 142, 191, 0.15); }
    50% { border-color: #6c8ebf; box-shadow: 0 0 18px rgba(108, 142, 191, 0.25); }
  }
`;

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    fontFamily:
      "'Geist', 'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    width: '420px',
    height: '420px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(108, 142, 191, 0.12) 0%, transparent 70%)',
    animation: 'pulseGlow 4s ease-in-out infinite',
    pointerEvents: 'none',
  },
  spinnerWrapper: {
    position: 'relative',
    width: '56px',
    height: '56px',
    marginBottom: '28px',
  },
  spinnerOuter: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '3px solid #1f324e',
    borderTopColor: '#6c8ebf',
    animation: 'loaderSpin 0.9s linear infinite',
    boxSizing: 'border-box',
  },
  spinnerInner: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid transparent',
    borderBottomColor: '#4a6a94',
    animation: 'loaderSpin 1.4s linear infinite reverse',
    boxSizing: 'border-box',
  },
  checkmark: {
    fontSize: '48px',
    color: '#4a9a6a',
    marginBottom: '20px',
    animation: 'fadeInUp 0.4s ease-out',
  },
  message: {
    fontSize: '15px',
    fontWeight: 500,
    color: '#a0b0c8',
    letterSpacing: '0.3px',
    marginBottom: '10px',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    userSelect: 'none',
  },
  closeMsg: {
    fontSize: '13px',
    fontWeight: 400,
    color: '#6b7a8f',
    marginBottom: '20px',
    animation: 'fadeInUp 0.4s ease-out',
    userSelect: 'none',
  },
  progressTrack: {
    width: '220px',
    height: '4px',
    backgroundColor: '#1a2235',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '16px',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, #4a6a94, #6c8ebf, #4a6a94)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 2s linear infinite',
    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  dotsRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '32px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    transition: 'all 0.4s ease',
  },
  fallbackWrapper: {
    position: 'absolute',
    bottom: '48px',
    transition: 'opacity 0.6s ease',
  },
  fallbackButton: {
    display: 'inline-block',
    padding: '12px 28px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#c1d4f1',
    backgroundColor: '#141d2b',
    border: '1px solid #4a6a94',
    borderRadius: '12px',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    letterSpacing: '0.3px',
    fontFamily: 'inherit',
    boxShadow: '0 0 12px rgba(108, 142, 191, 0.15)',
    animation: 'borderPulse 2.5s ease-in-out infinite',
  },
};

Home.displayName = 'Home';
export default Home;
