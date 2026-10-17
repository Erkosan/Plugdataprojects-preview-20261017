// Pastor Gregorius postorderkatalog. Allt innehåll kommer från katalog.json (inbakat av tools/build_site.py);
// här finns bara hur en artikel ritas. Ingen ljudmotor laddas: SPELA NU öppnar maskinens egen sida.
(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('katalog-data').textContent);
  const root = document.getElementById('katalog');
  const OS_ORDNING = ['mac', 'windows', 'linux', 'kit'];

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(child.nodeType ? child : String(child));
    }
    return el;
  };

  // Adresserna i registret är absoluta på runken.nu (/turbotutti/). Länkarna görs relativa från katalogens egen
  // adress, så att katalogen fungerar även under en undermapp (GitHub Pages-previewn).
  const djup = data.katalog.adress.split('/').filter(Boolean).length;
  const lank = (adress) => (adress.startsWith('/') ? '../'.repeat(djup) + adress.slice(1) : adress);
  const datum = (iso) => {
    const [, mm, dd] = iso.split('-');
    return `${Number(dd)}/${Number(mm)}`;
  };

  // LYSSNA: ett förrenderat klipp åt gången, laddas först vid klick.
  let spelar = null;
  const stoppa = () => {
    if (!spelar) return;
    spelar.audio.pause();
    spelar.knapp.classList.remove('spelar');
    spelar.knapp.setAttribute('aria-pressed', 'false');
    spelar.knapp.querySelector('.etikett').textContent = 'LYSSNA';
    spelar.knapp.style.removeProperty('--klar');
    spelar = null;
  };
  const lyssna = (m, knapp) => {
    if (spelar && spelar.knapp === knapp) return stoppa();
    stoppa();
    const audio = new Audio(m.klipp);
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) knapp.style.setProperty('--klar', (audio.currentTime / audio.duration).toFixed(3));
    });
    audio.addEventListener('ended', stoppa);
    audio.addEventListener('error', () => { stoppa(); knapp.disabled = true; knapp.querySelector('.etikett').textContent = 'SLUTSÅLT'; });
    spelar = { audio, knapp };
    knapp.classList.add('spelar');
    knapp.setAttribute('aria-pressed', 'true');
    knapp.querySelector('.etikett').textContent = 'STOPPA';
    audio.play().catch(stoppa);
  };

  const foto = (m) => {
    const ruta = h('div', { class: 'foto' });
    if (m.bild) {
      ruta.append(h('img', { src: m.bild, alt: `${m.namn} i sitt rum`, loading: 'lazy', decoding: 'async', width: 960, height: 600 }));
    } else {
      // Ingen bild: en ritad skylt i maskinens tema.
      ruta.classList.add('foto--skylt');
      ruta.append(h('span', { class: 'skylt', 'aria-hidden': 'true' }, m.namn));
    }
    if (m.status.length) {
      ruta.append(h('div', { class: 'stamplar' }, m.status.map((s) => h('span', { class: `stampel stampel--${s.split(' ')[0].toLowerCase()}` }, s))));
    }
    return ruta;
  };

  const artikel = (m) => {
    const kommer = m.status.includes('KOMMER');
    return h('article', { class: 'artikel', id: m.id, 'data-theme': m.tema },
      h('header', { class: 'artikel-band' }, h('span', { class: 'artnr' }, `ART.NR ${m.artnr}`)),
      foto(m),
      h('div', { class: 'artikel-text' },
        h('div', { class: 'namnrad' },
          h('p', { class: 'roll' }, m.roll),
          h('h3', { class: 'namn' }, m.namn)),
        h('p', { class: 'pitch' }, m.pitch),
        h('div', { class: 'pris', 'aria-label': `Pris ${m.pris}, ${m.betalning}` },
          h('span', { class: 'belopp' }, m.pris),
          h('span', { class: 'villkor' }, m.betalning)),
        h('div', { class: 'knappar' },
          kommer ? h('span', { class: 'knapp knapp--av' }, 'KOMMER')
            : h('a', { class: 'knapp knapp--spela', href: lank(m.adress) }, h('span', { class: 'play', 'aria-hidden': 'true' }), 'SPELA NU'),
          m.klipp && h('button', { class: 'knapp knapp--lyssna', type: 'button', 'aria-pressed': 'false', onclick: (e) => lyssna(m, e.currentTarget) },
            h('span', { class: 'etikett' }, 'LYSSNA')))));
  };

  // Allt som inte är själva sortimentet ligger i kugghjulet, som i maskinerna.
  const KUGGE = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';
  const svg = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const meny = () => {
    const ikon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    ikon.append(svg('circle', { cx: 12, cy: 12, r: 3 }), svg('path', { d: KUGGE }));
    const med = data.maskiner.filter((m) => !m.status.includes('KOMMER') && m.vst3 !== false);
    // Plattformar utan färdig VST3 står som "kommer snart"; byggkit visas aldrig på sidan.
    const snart = (m) => ['mac', 'windows', 'linux'].filter((os) => !m.nedladdningar.some((f) => f.os === os));
    const OS_NAMN = { mac: 'MAC', windows: 'WINDOWS', linux: 'LINUX' };
    return h('details', { class: 'meny' },
      h('summary', { 'aria-label': 'Meny' }, ikon),
      h('div', { class: 'meny-panel' },
        h('h2', {}, 'VST3'),
        h('ul', { class: 'meny-vst3' }, med.map((m) => h('li', {},
          h('span', {}, m.namn),
          h('span', { class: 'meny-filer' },
            [...m.nedladdningar].filter((f) => f.os !== 'kit').sort((a, b) => OS_ORDNING.indexOf(a.os) - OS_ORDNING.indexOf(b.os))
              .map((f) => h('a', { href: lank(`${m.adress}downloads/${f.fil}`), download: true }, f.etikett)),
            snart(m).length ? h('span', { class: 'snart' }, `${snart(m).map((os) => OS_NAMN[os]).join('/')} KOMMER SNART`) : null,
            (m.fler || []).map((f) => h('a', { href: lank(f.adress) }, f.etikett)))))),
        data.nytt.length ? [h('h2', {}, 'NYTT'),
          h('ul', { class: 'meny-nytt' }, data.nytt.slice(0, 5).map((n) => h('li', {}, h('time', { datetime: n.datum }, datum(n.datum)), ' ', n.text)))] : null,
        h('p', { class: 'meny-villkor' }, data.katalog.villkor)));
  };

  const render = () => {
    const sidor = data.miljoer
      .map((miljo) => ({ miljo, artiklar: data.maskiner.filter((m) => m.miljo === miljo.id) }))
      .filter((s) => s.artiklar.length);

    const bilder = data.maskiner.filter((m) => m.bild).slice(0, 5);
    const omslag = h('header', { class: 'omslag' },
      h('div', { class: 'omslag-topp' }, h('span', { class: 'logga' }, 'PG'), h('span', {}, data.katalog.upplaga), meny()),
      h('h1', { class: 'titel' }, data.katalog.titel.split(' ').map((ord) => h('span', {}, ord))),
      h('p', { class: 'ingress' }, data.katalog.ingress),
      h('div', { class: 'kollage', 'aria-hidden': 'true' },
        bilder.map((m, i) => h('img', { src: m.bild, alt: '', class: `kort kort-${i}`, decoding: 'async' }))),
      h('div', { class: 'stjarna', 'aria-hidden': 'true' }, h('span', {}, 'ALLT'), h('strong', {}, '0:-')),
      h('ol', { class: 'flikar' }, sidor.map((s, i) => h('li', {}, h('a', { href: `#${s.miljo.id}` }, s.miljo.namn)))));

    const avdelningar = sidor.map((s, i) => h('section', { class: `avdelning avdelning-${i % 4}`, id: s.miljo.id, 'aria-labelledby': `${s.miljo.id}-rubrik` },
      h('div', { class: 'sidhuvud', 'aria-hidden': 'true' }, h('span', {}, data.katalog.titel), h('span', {}, data.katalog.upplaga)),
      h('header', { class: 'avdelning-rubrik' }, h('h2', { id: `${s.miljo.id}-rubrik` }, s.miljo.namn), h('p', {}, s.miljo.text)),
      h('span', { class: 'flik', 'aria-hidden': 'true' }, s.miljo.namn),
      h('div', { class: 'artiklar' }, s.artiklar.map(artikel))));

    const kolofon = h('footer', { class: 'kolofon' }, h('span', { class: 'logga' }, 'PG'), `© ${data.katalog.upplaga.replace(/\D/g, '')} ${data.katalog.titel}`);
    root.replaceChildren(omslag, ...avdelningar, kolofon);
  };

  render();
})();
