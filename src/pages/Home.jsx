import { useState, useEffect, useRef, useCallback } from 'react';
import { process as buildProxyUrl } from '/src/utils/hooks/loader/utils';

const PROXY_TARGET = 'https://winstonwebsite.vercel.app';

const STEPS = [
  { message: 'Initializing...',                  title: 'Loading...',       emoji: '⏳' },
  { message: 'Registering service workers...',   title: 'Registering...',   emoji: '⚙️' },
  { message: 'Connecting to cluster...',         title: 'Connecting...',    emoji: '📡' },
  { message: 'Establishing secure tunnel...',    title: 'Securing...',      emoji: '🔁' },
  { message: 'Routing connection...',            title: 'Routing...',       emoji: '🛡️' },
  { message: 'Finalizing payload...',            title: 'Finalizing...',    emoji: '⚡' },
  { message: 'Preparing redirect...',            title: 'Preparing...',     emoji: '🔄' },
  { message: 'Launching window...',              title: 'Launching...',     emoji: '🚀' },
];

const DONE_STEP = { message: 'Window opened — you\'re all set!', title: 'Done', emoji: '✅' };
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

  // Wait until a service worker is actively controlling the page (handles proxy routes)
  const waitForSW = useCallback(() => {
    return new Promise((resolve) => {
      if (!('serviceWorker' in navigator)) { resolve(); return; }

      // Already controlled → SW is active and intercepting
      if (navigator.serviceWorker.controller) { resolve(); return; }

      // Use navigator.serviceWorker.ready which resolves when a SW is active
      // PLUS listen for controllerchange (first install needs a page claim)
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      // controllerchange fires when a new SW takes control (e.g., via clients.claim())
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });

      // navigator.serviceWorker.ready resolves when registration has an active worker
      navigator.serviceWorker.ready.then(async (reg) => {
        // The SW is 'active' but may not yet be 'controlling' this page.
        // Give it a moment for clients.claim() to propagate, then resolve.
        if (navigator.serviceWorker.controller) {
          done();
          return;
        }
        // Wait up to 5s for the controller to appear
        let waited = 0;
        const poll = setInterval(() => {
          waited += 150;
          if (navigator.serviceWorker.controller || waited >= 5000) {
            clearInterval(poll);
            done();
          }
        }, 150);
      });

      // Hard timeout: resolve after 12s no matter what
      setTimeout(done, 12000);
    });
  }, []);

  const handleManualOpen = useCallback(() => {
    const proxyUrl = buildProxyUrl(PROXY_TARGET, false, 'auto');
    if (!proxyUrl) return;

    const win = window.open(proxyUrl, '_blank');
    if (win && !win.closed) {
      setDone(true);
      setFavicon(DONE_STEP.emoji);
      document.title = DONE_STEP.title;
      setShowFallback(false);

      setTimeout(() => {
        window.close();
        setTimeout(() => {
          setCloseMsg(CLOSE_MSG);
        }, 400);
      }, 1500);
    }
  }, []);

  const openProxiedTab = useCallback(async () => {
    if (opened.current) return;

    // Wait for the service worker to be ready FIRST, before building the URL
    await waitForSW();

    const proxyUrl = buildProxyUrl(PROXY_TARGET, false, 'auto');
    if (!proxyUrl) {
      setShowFallback(true);
      return;
    }

    const win = window.open(proxyUrl, '_blank');
    
    // Fail-safe: show fallback button after 3 seconds
    const fallbackTid = setTimeout(() => {
      setShowFallback(true);
    }, 3000);

    if (!win || win.closed) {
      setShowFallback(true);
      return;
    }

    opened.current = true;
    clearTimeout(fallbackTid); // It opened successfully, cancel the fallback button
    setShowFallback(false);
    
    setDone(true);
    setFavicon(DONE_STEP.emoji);
    document.title = DONE_STEP.title;

    setTimeout(() => {
      window.close();
      setTimeout(() => {
        setCloseMsg(CLOSE_MSG);
      }, 400);
    }, 1500);
  }, [waitForSW]);

  useEffect(() => {
    setFavicon(STEPS[0].emoji);
    document.title = STEPS[0].title;
    let isCancelled = false;

    const transitionToStep = async (nextStep) => {
      if (isCancelled) return;
      setFadeIn(false);
      await new Promise((r) => setTimeout(r, 300));
      if (isCancelled) return;
      setStep(nextStep);
      setFavicon(STEPS[nextStep].emoji);
      document.title = STEPS[nextStep].title;
      setFadeIn(true);
      await new Promise((r) => setTimeout(r, 650));
    };

    const runSequence = async () => {
      await new Promise((r) => setTimeout(r, 650));
      if (isCancelled) return;

      let swReady = false;
      const swPromise = waitForSW().then(() => { swReady = true; });

      // Run through filler steps (1 through 6)
      // If the SW finishes resolving early, we instantly skip the remaining filler steps!
      for (let i = 1; i <= 6; i++) {
        if (swReady || isCancelled) break;
        await transitionToStep(i);
      }
      
      // Block here until SW is actually ready (in case we zoomed through all 6 and it's still not done)
      await swPromise;
      if (isCancelled) return;
      
      // Jump to the final launch step (index 7)
      await transitionToStep(7);

      if (!isCancelled) {
        openProxiedTab();
      }
    };

    runSequence();

    return () => {
      isCancelled = true;
    };
  }, [waitForSW, openProxiedTab]);

  const currentMsg = done ? DONE_STEP.message : STEPS[step].message;
  const progress = done ? 100 : Math.min(((step + 1) / STEPS.length) * 100, 100);

  return (
    <div style={styles.container}>
      {/* Noise texture overlay */}
      <div style={styles.noiseOverlay} />

      {/* Animated gradient orbs */}
      <div style={styles.orbTopLeft} />
      <div style={styles.orbBottomRight} />

      {/* Main card */}
      <div style={styles.card}>
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
              ...(done ? { background: '#22c55e', animation: 'none' } : {}),
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
                backgroundColor: i <= step || done ? (done ? '#22c55e' : '#a1a1aa') : '#27272a',
                transform: i <= step || done ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Fallback button — shown if popup blocked or taking too long */}
      <div
        style={{
          ...styles.fallbackWrapper,
          opacity: showFallback && !done ? 1 : 0,
          pointerEvents: showFallback && !done ? 'auto' : 'none',
        }}
      >
        <button
          onClick={handleManualOpen}
          style={styles.fallbackButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#18181b';
            e.currentTarget.style.borderColor = '#a1a1aa';
            e.currentTarget.style.boxShadow = '0 0 24px rgba(255, 255, 255, 0.06)';
            e.currentTarget.style.color = '#fafafa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#0a0a0a';
            e.currentTarget.style.borderColor = '#3f3f46';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 255, 255, 0.03)';
            e.currentTarget.style.color = '#a1a1aa';
          }}
        >
          Didn't open? Click here
        </button>
      </div>

      {/* Footer pill */}
      <div style={styles.footerPill}>
        Winston
      </div>

      {/* Keyframes */}
      <style>{keyframes}</style>
    </div>
  );
};

const keyframes = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap');

  @keyframes loaderSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.45; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); }
  }
  @keyframes orbFloat1 {
    0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.18; }
    50% { transform: translate(15px, -20px) scale(1.05); opacity: 0.28; }
  }
  @keyframes orbFloat2 {
    0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.14; }
    50% { transform: translate(-12px, 18px) scale(1.08); opacity: 0.22; }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes borderPulse {
    0%, 100% { border-color: #3f3f46; box-shadow: 0 0 12px rgba(255, 255, 255, 0.03); }
    50% { border-color: #52525b; box-shadow: 0 0 20px rgba(255, 255, 255, 0.06); }
  }
  @keyframes cardFadeIn {
    from { opacity: 0; transform: translateY(24px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
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
    backgroundColor: '#09090b',
    fontFamily:
      "'Inter', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflow: 'hidden',
  },
  noiseOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')",
    opacity: 0.12,
    pointerEvents: 'none',
    mixBlendMode: 'overlay',
  },
  orbTopLeft: {
    position: 'fixed',
    top: '-8%',
    left: '8%',
    width: '440px',
    height: '440px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.04)',
    filter: 'blur(118px)',
    pointerEvents: 'none',
    animation: 'orbFloat1 6s ease-in-out infinite',
  },
  orbBottomRight: {
    position: 'fixed',
    bottom: '-8%',
    right: '8%',
    width: '440px',
    height: '440px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.03)',
    filter: 'blur(118px)',
    pointerEvents: 'none',
    animation: 'orbFloat2 7s ease-in-out infinite',
  },
  card: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderRadius: '16px',
    border: '1px solid #27272a',
    backgroundColor: 'rgba(9, 9, 11, 0.6)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '40px 48px',
    width: '320px',
    minHeight: '220px',
    animation: 'cardFadeIn 0.6s ease-out',
  },
  spinnerWrapper: {
    position: 'relative',
    width: '52px',
    height: '52px',
    marginBottom: '24px',
  },
  spinnerOuter: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    border: '2.5px solid #27272a',
    borderTopColor: '#a1a1aa',
    animation: 'loaderSpin 0.85s linear infinite',
    boxSizing: 'border-box',
  },
  spinnerInner: {
    position: 'absolute',
    top: '7px',
    left: '7px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '2px solid transparent',
    borderBottomColor: '#52525b',
    animation: 'loaderSpin 1.3s linear infinite reverse',
    boxSizing: 'border-box',
  },
  checkmark: {
    fontSize: '44px',
    color: '#22c55e',
    marginBottom: '18px',
    animation: 'fadeInUp 0.4s ease-out',
    fontWeight: '700',
  },
  message: {
    fontSize: '15px',
    fontWeight: 500,
    color: '#a1a1aa',
    letterSpacing: '0.3px',
    marginBottom: '8px',
    transition: 'opacity 0.3s ease, transform 0.3s ease',
    userSelect: 'none',
    textAlign: 'center',
  },
  closeMsg: {
    fontSize: '13px',
    fontWeight: 400,
    color: '#52525b',
    marginBottom: '18px',
    animation: 'fadeInUp 0.4s ease-out',
    userSelect: 'none',
  },
  progressTrack: {
    width: '200px',
    height: '3px',
    backgroundColor: '#18181b',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '14px',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, #3f3f46, #71717a, #3f3f46)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 2s linear infinite',
    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  dotsRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '0',
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    transition: 'all 0.4s ease',
  },
  fallbackWrapper: {
    position: 'absolute',
    bottom: '56px',
    transition: 'opacity 0.6s ease',
    zIndex: 10,
  },
  fallbackButton: {
    display: 'inline-block',
    padding: '12px 28px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#a1a1aa',
    backgroundColor: '#0a0a0a',
    border: '1px solid #3f3f46',
    borderRadius: '9999px',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    letterSpacing: '0.2px',
    fontFamily: 'inherit',
    boxShadow: '0 0 12px rgba(255, 255, 255, 0.03)',
    animation: 'borderPulse 2.5s ease-in-out infinite',
  },
  footerPill: {
    position: 'absolute',
    bottom: '20px',
    fontSize: '11px',
    color: '#3f3f46',
    borderRadius: '9999px',
    padding: '6px 16px',
    border: '1px solid #1c1c1f',
    backgroundColor: 'rgba(9, 9, 11, 0.5)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    fontWeight: 500,
    userSelect: 'none',
    zIndex: 10,
  },
};

Home.displayName = 'Home';
export default Home;
