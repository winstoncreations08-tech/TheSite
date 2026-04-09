import { mango } from './of.js';
import whitelist from '/src/data/whitelist.json';
import appsData from '/src/data/apps.json';

const check = (inp, engine) => {
  const trimmed = inp.trim();
  if (!trimmed) return '';

  const isUrl =
    /^https?:\/\//i.test(trimmed) ||
    /^[\w-]+\.[\w.-]+/i.test(trimmed) ||
    trimmed.startsWith('localhost');

  if (isUrl) {
    return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  } else {
    const searchUrl = engine + encodeURIComponent(trimmed);
    // Google is often blocked behind extra checks inside proxies.
    // Routing the Google results page through Google Translate ("translator thing")
    // makes it load reliably for many filtered networks.
    if (/^https?:\/\/www\.google\.com\/search\?q=/i.test(engine)) {
      return `https://translate.google.com/translate?sl=auto&tl=en&u=${encodeURIComponent(searchUrl)}`;
    }
    return searchUrl;
  }
};

const scrwlist = new Set([
  ...whitelist,
  ...Object.values(appsData.games || {}).flatMap(cat => 
    cat.filter(g => g.url && !g.local).map(g => {
      try { return new URL(g.url.startsWith('http') ? g.url : `https://${g.url}`).hostname.replace(/^www\./, ''); }
      catch { return null; }
    }).filter(Boolean)
  )
]);

export const process = (input, decode = false, prType, engine = "https://www.google.com/search?q=") => {
  const upwefix = isStaticBuild 
    ? new URL('./portal/k12/', location.href).pathname
    : '/portal/k12/';
  const eggowaffle = isStaticBuild
    ? new URL('./ham/', location.href).pathname
    : '/ham/';
  
  let prefix;

  switch (prType) {
    case 'uv':
      prefix = upwefix;
      break;
    case 'scr':
      prefix = eggowaffle;
      break;
    default:
      const url = check(input, engine);
      const match = [...scrwlist].some(d => url.includes(d));
      prefix = match ? eggowaffle : upwefix;
  }

  if (decode) {
    const uvPart = input.split(upwefix)[1];
    const scrPart = input.split(eggowaffle)[1];
    const decoded = uvPart ? mango.dnc(uvPart) : scrPart ? mango.dnc(scrPart) : input;
    return decoded.endsWith('/') ? decoded.slice(0, -1) : decoded;
  } else {
    const final = check(input, engine);
    if (!final || final.trim() === '') {
      return null;
    }
    const encoded = prefix === eggowaffle ? mango.enc(final) : mango.enc(final);
    return `${location.protocol}//${location.host}${prefix}${encoded}`;
  }
};

export function openEmbed(url) {
  // Open in a real tab (same-origin) so the proxy SW can control it.
  // Embedding in about:blank breaks the service worker scope (proxy won't work).
  window.open(url, '_blank', 'noopener,noreferrer');
}