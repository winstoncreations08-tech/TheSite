import clsx from 'clsx';
import loaderStore from '/src/utils/hooks/loader/useLoaderStore';
import StaticError from './viewer/StaticError';
import { useOptions } from '/src/utils/optionsContext';
import { useRef, useEffect, useMemo, useState } from 'react';
import { Loader } from 'lucide-react';

import NewTab from './NewTab';
import { process as decodeMaybe } from '/src/utils/hooks/loader/utils';

const Viewer = ({ conf = {} }) => {
  const tabs = loaderStore((state) => state.tabs);
  const updateUrl = loaderStore((state) => state.updateUrl);
  const updateTitle = loaderStore((state) => state.updateTitle);
  const setLoading = loaderStore((state) => state.setLoading);
  const setFrameRefs = loaderStore((state) => state.setFrameRefs);
  // wispStatus: reps. if working Wisp server is found
  // (only when isStaticBuild == true)
  const wispStatus = loaderStore((state) => state.wispStatus);
  const { iframeUrls, setIframeUrl, showMenu, toggleMenu } = loaderStore();
  const frameRefs = useRef({});
  const prevURL = useRef({});
  const prevTitle = useRef({});
  const { options } = useOptions();
  const updateActiveFrameRef = loaderStore((state) => state.updateActiveFrameRef);
  const activeFrameRef = loaderStore((state) => state.activeFrameRef);
  const enableAlerts = conf.alerts ?? true;

  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);
  const searchLockRef = useRef({});

  const engineHost = useMemo(() => {
    try {
      return options?.engine ? new URL(options.engine).hostname.replace(/^www\./, '') : null;
    } catch {
      return null;
    }
  }, [options?.engine]);

  const isSearchResultsUrl = (decodedUrl) => {
    if (!decodedUrl) return false;
    try {
      const u = new URL(decodedUrl);
      const host = u.hostname.replace(/^www\./, '');
      if (!engineHost) return false;
      if (host !== engineHost) return false;

      // Common search engine result paths
      if (host.includes('google.') && u.pathname === '/search') return true;
      if (host.includes('bing.') && u.pathname === '/search') return true;
      if (host.includes('duckduckgo.') && u.pathname === '/') return u.searchParams.has('q');
      if (host.includes('search.yahoo.') && u.pathname === '/search') return true;
      if (host.includes('startpage.') && u.pathname.includes('/sp/search')) return true;

      // Fallback: any page with a q= param on the engine host is treated as "search"
      return u.searchParams.has('q');
    } catch {
      return false;
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 4500);
  };

  useEffect(() => {
    setFrameRefs(frameRefs);
    const tabIds = new Set(tabs.map((t) => t.id));
    Object.keys(frameRefs.current).forEach((id) => {
      if (!tabIds.has(id)) delete frameRefs.current[id];
    });
  }, [setFrameRefs, tabs]);

  useEffect(() => {
    const listeners = [];
    tabs.forEach((tab) => {
      if (tab.url === 'tabs://new') return;
      const iframe = frameRefs.current[tab.id];
      if (!iframe) return;

      // Determine if this tab is a "search results" tab that should not navigate inside the frame.
      try {
        const decoded = decodeMaybe(tab.url, true, options.prType || 'auto', options.engine || undefined);
        if (decoded && isSearchResultsUrl(decoded)) {
          searchLockRef.current[tab.id] = true;
        } else if (decoded && !isSearchResultsUrl(decoded)) {
          searchLockRef.current[tab.id] = false;
        }
      } catch {}

      const handleLoad = () => {
        setLoading(tab.id, false);
        try {
          const d = iframe.contentWindow?.document;
          if (d?.getElementById('errorTrace-wrapper') || d?.getElementById('uvHostname')) {
            iframe.contentWindow.location.replace(tab.url);
          }
          if (!enableAlerts && iframe.contentWindow) {
            iframe.contentWindow.alert = () => {};
          }
        } catch {}
      };
      const checkState = () => {
        try {
          const curURL = iframe.contentWindow.location.href;
          const curTTL = iframe.contentWindow.document.title;
          if (curURL === 'about:blank') return;

          // If this tab started as a search results page, block in-frame navigation.
          // Instead, instruct the user to open links in a new tab/browser.
          const isLocked = !!searchLockRef.current[tab.id];
          if (isLocked && curURL !== tab.url) {
            let decodedCur = '';
            let decodedTab = '';
            try {
              decodedCur = decodeMaybe(curURL, true, options.prType || 'auto', options.engine || undefined);
              decodedTab = decodeMaybe(tab.url, true, options.prType || 'auto', options.engine || undefined);
            } catch {}

            // If the iframe navigated away from the search results page, snap back.
            if (decodedCur && decodedTab && !isSearchResultsUrl(decodedCur) && isSearchResultsUrl(decodedTab)) {
              try {
                iframe.contentWindow.location.replace(tab.url);
              } catch {}

              // Keep the tab URL unchanged, and show instructions.
              showToast('Please right-click results and open in a new tab/browser to work.');
              return;
            }
          }

          // url shouldnt be updating if tab is still loading...will cause race condition
          if (!tab.isLoading && curURL !== prevURL.current[tab.id] && curURL !== tab.url) {
            prevURL.current[tab.id] = curURL;
            updateUrl(tab.id, curURL);
          }
          if (curTTL && curTTL !== prevTitle.current[tab.id] && curTTL !== tab.title) {
            prevTitle.current[tab.id] = curTTL;
            updateTitle(tab.id, curTTL);
          }
        } catch (e) {}
      };
      iframe.addEventListener('load', handleLoad);
      iframe.addEventListener('load', checkState);
      listeners.push({ iframe, handleLoad, checkState, tabId: tab.id });
      
      //try to remove it again
      if (!enableAlerts) {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.alert = () => {};
          }
        } catch {}
      }
    });
    const interval = setInterval(() => {
      tabs.forEach((tab) => {
        if (tab.url === 'tabs://new') return;
        const iframe = frameRefs.current[tab.id];
        if (!iframe) return;
        try {
          const curURL = iframe.contentWindow.location.href;
          const curTTL = iframe.contentWindow.document.title;
          if (curURL === 'about:blank') return;
          const d = iframe.contentWindow?.document;
          if (d?.getElementById('errorTrace-wrapper') || d?.getElementById('uvHostname')) {
            iframe.contentWindow.location.replace(tab.url);
            return;
          }
          if (!enableAlerts && iframe.contentWindow) {
            iframe.contentWindow.alert = () => {};
          }
          // tab cant be loading while URL is being updated
          if (!tab.isLoading && curURL !== prevURL.current[tab.id] && curURL !== tab.url) {
            prevURL.current[tab.id] = curURL;
            setIframeUrl(tab.id, curURL);
          }
          if (curTTL && curTTL !== prevTitle.current[tab.id] && curTTL !== tab.title) {
            prevTitle.current[tab.id] = curTTL;
            updateTitle(tab.id, curTTL);
          }
        } catch (e) {}
      });
    }, 50);
    return () => {
      listeners.forEach(({ iframe, handleLoad, checkState }) => {
        iframe.removeEventListener('load', handleLoad);
        iframe.removeEventListener('load', checkState);
      });
      clearInterval(interval);
    };
  }, [tabs, setLoading, updateTitle, setIframeUrl, enableAlerts, options.prType, options.engine, engineHost]);

  useEffect(() => {
    const interval = setInterval(() => {
      tabs.forEach((tab) => {
        if (tab.url === 'tabs://new') return;
        const iframe = frameRefs.current[tab.id];
        if (!iframe) return;
        try {
          const currentUrl = iframe.contentWindow.location.href;
          if (currentUrl !== iframeUrls[tab.id]) {
            setIframeUrl(tab.id, currentUrl);
          }
        } catch (e) {}
      });
    }, 500);

    return () => clearInterval(interval);
  }, [tabs, iframeUrls, setIframeUrl]);

  useEffect(() => {
    if (activeFrameRef?.current) {
      try {
        activeFrameRef.current.contentWindow.document.body.style.zoom = conf.zoom;
      } catch (e) {}
    }
  }, [activeFrameRef, conf.zoom]);

  useEffect(() => {
    tabs.forEach((tab) => {
      if (tab.active) {
        const iframeRef = { current: frameRefs.current[tab.id] };
        updateActiveFrameRef(iframeRef);
      }
    });
  }, [tabs]);

  const activeNewTab = tabs.find((tab) => tab.url === 'tabs://new' && tab.active);

  return (
    <div className="relative w-full h-full">
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-70 px-4 w-full max-w-lg pointer-events-none">
          <div className="rounded-xl border border-amber-500/30 bg-[#0b0f16]/95 backdrop-blur-xl px-4 py-3 text-sm text-amber-200 shadow-2xl">
            {toast}
          </div>
        </div>
      )}
      {tabs.map(({ id, url, active }) => {
        if (url === 'tabs://new') return null;
        return (
          <div
            key={id}
            className={clsx(
              'absolute inset-0 w-full h-full',
              active ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none',
            )}
          >
            {active && (
              <div
                className="absolute inset-0 w-full h-full flex items-center justify-center -z-20"
                style={{ backgroundColor: options.tabBarColor || '#070e15' }}
              >
                {/*
                  If not static build, show loader
                  If static, show loader when wispStatus == true
                  If Wisp is still being found (init), show loading
                  Otherwise show error
                */}
                {!isStaticBuild ? (
                  <Loader size={32} className="animate-spin" />
                ) : wispStatus ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader size={32} className="animate-spin" />
                    {wispStatus === 'init' && (
                      <p className="mt-2">Finding a Wisp server to route your request...</p>
                    )}
                  </div>
                ) : wispStatus === false && (
                  <StaticError />
                )}
              </div>
            )}
            {/* if not static, show frame. otherwise if wisp is found (and is static) show iframe,
            otherwise display error msg */}
            {!isStaticBuild ? (
              <iframe
                ref={(el) => (frameRefs.current[id] = el)}
                src={url}
                style={{ display: 'block', width: '100%', height: '100%' }}
                className="absolute inset-0 w-full h-full transition-opacity duration-200"
              />
            ) : (
              wispStatus === true && (
                <iframe
                  ref={(el) => (frameRefs.current[id] = el)}
                  src={url}
                  style={{ display: 'block', width: '100%', height: '100%' }}
                  className="absolute inset-0 w-full h-full transition-opacity duration-200"
                />
              )
            )}

            {/*transparent overlay for when click on content */}
            {showMenu && (
              <div className="absolute inset-0 w-full h-full z-50" onClick={() => toggleMenu()} />
            )}
          </div>
        );
      })}
      {activeNewTab && (
        <div
          key={activeNewTab.id}
          className={clsx('absolute inset-0 w-full h-full', 'opacity-100 z-10 pointer-events-auto')}
        >
          <NewTab id={activeNewTab.id} updateFn={updateUrl} options={options} />
        </div>
      )}
    </div>
  );
};

export default Viewer;
