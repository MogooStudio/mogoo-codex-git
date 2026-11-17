/* Website-only analytics. Reusable source: mogoo-plugin-launch/assets/clarity.js. */
(function () {
  'use strict';
  if (window.mogooAnalytics) return;
  var config = document.currentScript && document.currentScript.dataset;
  if (!config || !/^[a-z0-9]+$/.test(config.clarityProject || '')) return;
  var page = new URL(window.location.href);
  var query = page.searchParams;
  if (query.get('capture') === '1' || query.get('analytics') === 'off' || navigator.globalPrivacyControl === true) return;
  var debug = query.get('analytics') === 'debug' && ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname);
  var canonical;
  try { canonical = new URL(config.siteUrl); } catch (_) { return; }
  var base = canonical.pathname.replace(/\/$/, '');
  if (!debug && (page.protocol !== 'https:' || page.origin !== canonical.origin ||
      (page.pathname !== base && !page.pathname.startsWith(base + '/')))) return;

  var failed = false;
  var debugCalls = [];
  function send() {
    try {
      if (failed) return;
      if (debug) {
        debugCalls.push(Array.from(arguments));
        if (debugCalls.length > 100) debugCalls.shift();
      } else if (typeof window.clarity === 'function') {
        window.clarity.apply(window, arguments);
      }
    } catch (_) { /* Analytics must not interrupt installation or clipboard UI. */ }
  }
  if (!debug) {
    window.clarity = window.clarity || function () {
      var queue = window.clarity.q = window.clarity.q || [];
      if (queue.length < 100) queue.push(arguments);
    };
  }
  // No assumed consent: use Clarity's cookie-free, limited-tracking mode.
  send('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
  send('set', 'product', config.product);

  function channel() {
    var source = (query.get('utm_source') || '').toLowerCase();
    if (['x', 'twitter', 't.co'].includes(source)) return 'x';
    if (['bilibili', 'b23'].includes(source)) return 'bilibili';
    if (source === 'github') return 'github';
    if (source) return 'other';
    var host;
    try { host = new URL(document.referrer).hostname; } catch (_) { return 'direct_or_unknown'; }
    if (['x.com', 'twitter.com', 't.co'].some(function (domain) { return host === domain || host.endsWith('.' + domain); })) return 'x';
    if (['bilibili.com', 'b23.tv'].some(function (domain) { return host === domain || host.endsWith('.' + domain); })) return 'bilibili';
    if (host === 'github.com') return 'github';
    return 'other';
  }
  send('set', 'channel', channel());
  ['medium', 'campaign', 'content'].forEach(function (key) {
    var value = query.get('utm_' + key) || '';
    if (/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) send('set', key === 'campaign' ? 'campaign_name' : 'campaign_' + key, value);
  });

  function track(name, detail) {
    detail = detail || {};
    if (name === 'install_click') {
      if (['nav', 'hero', 'workflow'].includes(detail.entry)) send('set', 'install_entry', detail.entry);
    } else if (name === 'install_copy_success') {
      if (!['agent', 'terminal'].includes(detail.method)) return;
      send('set', 'install_method', detail.method);
    } else {
      return;
    }
    send('event', name);
  }
  window.mogooAnalytics = Object.freeze({ track: track });
  if (debug) window.mogooAnalyticsDebug = debugCalls;
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest && event.target.closest('[data-install-entry]');
    if (link) track('install_click', { entry: link.dataset.installEntry });
  });
  if (!debug) {
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + config.clarityProject;
    script.onerror = function () {
      failed = true;
      if (window.clarity && window.clarity.q) window.clarity.q.length = 0;
    };
    document.head.appendChild(script);
  }
}());
