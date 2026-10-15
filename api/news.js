const {guard,coordinates,bounded} = require('../lib/server.cjs');
/* MONO · /api/news — weather headlines in Greek and English, straight from the publishers' own RSS feeds.
 * Only headline, short summary, source, time and the link back to the article are shown.
 * Response: { at, items: [{ id, title, summary, link, source, lang, t, image }] }  (newest first, cached 15 min at the edge) */
const FEEDS = [
  { url: 'https://www.ertnews.gr/tag/kairos/feed/', source: 'ERTnews', lang: 'el', all: true },
  { url: 'https://www.newsbeast.gr/tag/kairos/feed', source: 'Newsbeast', lang: 'el', all: true },
  { url: 'https://www.severe-weather.eu/feed/', source: 'Severe Weather Europe', lang: 'en', all: true },
  { url: 'https://earthobservatory.nasa.gov/feeds/natural-hazards.rss', source: 'NASA', lang: 'en' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC News', lang: 'en' },
  { url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', source: 'BBC News', lang: 'en' }
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
    const r = await fetch(f.url, { signal: ac.signal, headers: { 'User-Agent': 'MONO-Weather news reader (monokairos.vercel.app)', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!r.ok) return [];
    const xml = await r.text();
    return xml.split(/<item[\s>]/i).slice(1).map(b => {
      const title = decode(tag(b, 'title')), link = decode(tag(b, 'link')) || attr(b, 'guid', 'href');
      const summary = decode(tag(b, 'description')).replace(/\s*(The post|Το άρθρο|Η δημοσίευση)\s.*$/i, '').slice(0, 260);
      const t = Date.parse(decode(tag(b, 'pubDate')) || decode(tag(b, 'dc:date')));
      const image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || '';
      return { title, summary, link, source: f.source, lang: f.lang, t: Number.isFinite(t) ? t : null, image, all: !!f.all };
    }).filter(x => x.title && /^https?:\/\//.test(x.link))
      .filter(x => x.all || (x.lang === 'el' ? WEATHER_EL : WEATHER_EN).test(x.title + ' ' + x.summary));
  } catch { return []; } finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  const lists = await Promise.all(FEEDS.map(readFeed));
  const seen = new Set(), items = [];
  for (const x of lists.flat().sort((a, b) => (b.t || 0) - (a.t || 0))) {
    const key = x.link.replace(/[?#].*$/, '');
    if (seen.has(key)) continue; seen.add(key);
    if (x.t && Date.now() - x.t > 14 * 86400e3) continue;
    delete x.all; delete x.summary; delete x.image; x.id = key;
    items.push(x);
  }
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json({ at: Date.now(), items: items.slice(0, 160) });
};
