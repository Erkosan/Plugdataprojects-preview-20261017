// Älskog 3000: runs an unchanged machine page (any machine in maskiner.json) inside Älskog.
// The machine gets Älskog's shared AudioContext; its "speakers" are an Älskog
// input bus, so every sound passes through the Älskog mixer.
(function () {
  let host = null;
  try { host = window.parent !== window ? window.parent.alskog : null; } catch { host = null; }
  if (!host) return;
  const machine = document.currentScript && document.currentScript.dataset.machine;
  // Relative worklet URLs resolve against the machine's page, not Älskog's.
  window.AudioContext = window.webkitAudioContext = function () { return host.contextFor(machine, location.href); };
  window.AudioWorkletNode = function (context, name, options) { return host.createNode(machine, name, options); };
  // The page lives inside Älskog: no own service worker or install flow.
  try {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: () => Promise.resolve(), getRegistrations: () => Promise.resolve([]) } });
  } catch { /* keep default */ }
  // App install and MIDI belong to Älskog when the machines live inside it.
  const style = document.createElement('style');
  style.textContent = '#install-app, #midi { display: none !important; }';
  (document.head || document.documentElement).appendChild(style);
  // Space always means Älskog's shared transport.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat) return;
    if (event.target && event.target.closest && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    host.togglePlay();
  }, true);
  window.addEventListener('keydown', (event) => {
    if (event.key === '[' || event.key === ']') { event.preventDefault(); host.step(event.key === ']' ? 1 : -1); }
  }, true);
})();
