(() => {
  const key = 'mogoo-oil-design-theme';
  const valid = value => value === 'light' || value === 'dark';
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  const requested = new URLSearchParams(location.search).get('state');
  const initial = valid(requested) ? requested : valid(saved) ? saved : 'light';
  document.documentElement.dataset.theme = initial;
  document.addEventListener('alpine:init', () => {
    Alpine.data('oilTheme', () => ({
      mode: initial,
      choose(mode) {
        if (!valid(mode)) return;
        this.mode = mode;
        document.documentElement.dataset.theme = mode;
        try { localStorage.setItem(key, mode); } catch {}
      }
    }));
  });
})();
