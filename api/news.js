const {guard,limitedText} = require('../lib/server.cjs');
/* MONO · /api/news — weather headlines in Greek and English, straight from the publishers' own RSS feeds.
 * Only headline, short summary, source, time and the link back to the article are shown.
 * Response: { at, items: [{ id, title, summary, link, source, lang, t, image }] }  (newest first, cached 15 min at the edge) */
const FEEDS = [
  { url: 'https://www.ertnews.gr/tag/kairos/feed/', source: 'ERTnews', lang: 'el', all: true },
  { url: 'https://www.ertnews.gr/feed/', source: 'ERTnews', lang: 'el' },
  { url: 'https://www.newsbeast.gr/tag/kairos/feed', source: 'Newsbeast', lang: 'el', all: true },
  { url: 'https://www.newsbeast.gr/greece/feed', source: 'Newsbeast', lang: 'el' },
  { url: 'https://www.severe-weather.eu/feed/', source: 'Severe Weather Europe', lang: 'en', all: true },
  { url: 'https://earthobservatory.nasa.gov/feeds/natural-hazards.rss', source: 'NASA', lang: 'en' },
  { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', source: 'BBC News', lang: 'en' },
  // Publisher RSS feeds can go quiet or block serverless IPs: this is a fallback, not a replacement.
  { url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('καιρός OR κακοκαιρία OR βροχές when:3d') + '&hl=el&gl=GR&ceid=GR:el', source: 'Google News', lang: 'el', aggregate: true },
  { url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('weather alerts OR heavy rain OR storms when:3d') + '&hl=en-US&gl=US&ceid=US:en', source: 'Google News', lang: 'en', aggregate: true }
];
/* general feeds are filtered down to weather stories */
const WEATHER_EN = /\b(weather|storms?|hurricanes?|typhoons?|cyclones?|tornado(es)?|flood(s|ing|ed)?|flash flood|heat ?waves?|heatwave|wildfires?|blizzards?|snow(fall|storm)?|rainfall|heavy rain|downpours?|monsoon|droughts?|el ni[nñ]o|la ni[nñ]a|forecasters?|met office|gales?|hail|landslides?|extreme heat|cold snap|frost)\b/i;
const WEATHER_EL = /(καιρ|κακοκαιρ|βροχ|καταιγ|χιον|καύσων|καυσων|θερμοκρασ|ΕΜΥ|μετεωρ|πλημμ|μποφόρ|ανέμ|χαλάζ|παγετ|meteo|ΕΜΥ)/i;

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (block, name, a) => { const m = block.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]+)"`, 'i')); return m ? m[1] : ''; };

async function readFeed(f) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(f.url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MONOWeather/1.0; +https://monokairos.vercel.app/)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }
    });
    if (!r.ok) return { ok: false, items: [] };
    const xml = await limitedText(r, 1200000);
    const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, 90);
    if (!entries.length) return { ok: false, items: [] };
    const items = entries.map(([, , block]) => {
      const title = decode(tag(block, 'title'));
      const link = decode(tag(block, 'link')) || attr(block, 'link', 'href');
      const rawSummary = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded');
      const summary = decode(rawSummary).replace(/\s*(The post|Το άρθρο|Η δημοσίευση)\s.*$/i, '').slice(0, 260);
      const date = Date.parse(decode(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date')));
      const t = Number.isFinite(date) ? date : null;
      const rawImage = attr(block, 'media:content', 'url') || attr(block, 'media:thumbnail', 'url') || attr(block, 'enclosure', 'url');
      const image = /^https:\/\//i.test(rawImage) ? rawImage : '';
      const source = f.aggregate ? (decode(tag(block, 'source')) || f.source) : f.source;
      return { title, summary, link, source, lang: f.lang, t, image, all: !!f.all };
    }).filter(x => x.title && /^https?:\/\//i.test(x.link))
      .filter(x => x.all || (x.lang === 'el' ? WEATHER_EL : WEATHER_EN).test(x.title + ' ' + x.summary));
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  } finally { clearTimeout(timer); }
}
module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const lists = await Promise.all(FEEDS.map(readFeed));
  const seen = new Set(), items = [];
  const now = Date.now();
  for (const x of lists.flatMap(r => r.items).sort((a, b) => (b.t || 0) - (a.t || 0))) {
    const key = x.link.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (x.t && (now - x.t > 7 * 86400e3 || x.t - now > 86400e3)) continue;
    delete x.all;
    x.id = key;
    items.push(x);
  }
  const sourcesOk = lists.filter(r => r.ok).length;
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
  res.status(sourcesOk ? 200 : 503).json({ at: now, items: items.slice(0, 160), sourcesOk, sourcesTotal: FEEDS.length });
};
