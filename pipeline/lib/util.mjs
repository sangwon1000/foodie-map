export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(name) {
  // unicode-aware: Cyrillic/CJK-only names must not collapse to "" — they
  // would all share one dedupe key and merge into geographic blobs
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const R = 6371; // km
export function haversine(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Minimal quote-aware CSV parser (handles quoted commas, escaped quotes, newlines in fields). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const COUNTRY_ALIASES = new Map([
  ["usa", "United States"],
  ["united states of america", "United States"],
  ["us", "United States"],
  ["uk", "United Kingdom"],
  ["viet nam", "Vietnam"],
  ["myanmar (burma)", "Myanmar"],
  ["burma", "Myanmar"],
  ["korea", "South Korea"],
  ["republic of korea", "South Korea"],
  ["czechia", "Czech Republic"],
  ["hong kong sar", "Hong Kong"],
  ["macau sar", "Macau"],
  ["brasil", "Brazil"],
  ["méxico", "Mexico"],
  ["perú", "Peru"],
  ["maroc ⵍⵎⵖⵔⵉⴱ المغرب", "Morocco"],
  ["تونس", "Tunisia"],
  ["中国", "China"],
  ["st. vincent and the grenadines", "Saint Vincent and the Grenadines"],
  // occasional US state / UK nation leakage in the fan data
  ["missouri", "United States"],
  ["washington", "United States"],
  ["california", "United States"],
  ["new york", "United States"],
  ["texas", "United States"],
  ["england", "United Kingdom"],
  ["scotland", "United Kingdom"],
  ["wales", "United Kingdom"],
  ["northern ireland", "United Kingdom"],
  // duplicate-variant spellings → one canonical dropdown entry
  ["turkey", "Türkiye"],
  ["the philippines", "Philippines"],
  ["principality of monaco", "Monaco"],
  ["uae", "United Arab Emirates"],
  ["are", "United Arab Emirates"],
  ["tha", "Thailand"],
  // city / street value that leaked into the country field (bourdain fan data)
  ["istanbul", "Türkiye"],
  ["paris", "France"],
  ["beirut", "Lebanon"],
  ["belfast", "United Kingdom"],
  ["cairo", "Egypt"],
  ["dublin", "Ireland"],
  ["kolkata", "India"],
  ["reykjavik", "Iceland"],
  ["vancouver", "Canada"],
  ["tahiti", "French Polynesia"],
  ["sao miguel", "Portugal"],
  ["manila philippines", "Philippines"],
  ["ciudad de panama", "Panama"],
  ["alameda joaquim eugenio de lima", "Brazil"],
  ["colonnata", "Italy"],
  ["laugavegur", "Iceland"],
  ["templarasund", "Iceland"],
  // Dubai / Abu Dhabi are emirates (cities) of the UAE — Michelin lists them as
  // their own guides, but for a country filter they belong under the UAE
  ["dubai", "United Arab Emirates"],
  ["abu dhabi", "United Arab Emirates"],
]);

// Loose country bounding boxes [minLng, minLat, maxLng, maxLat] — used to recover
// a country from coordinates when the source row has none (else it'd read
// "Elsewhere"). Generous boxes: this only fires when there is NO country label,
// so a rough hit beats no label; overlaps resolve to the first match.
const COUNTRY_BBOX = {
  "United States": [-125, 24, -66, 49.5], "Canada": [-141, 41.6, -52, 70],
  "Mexico": [-118.5, 14.4, -86.5, 32.8], "Brazil": [-74, -34, -34, 5.3],
  "Argentina": [-73.6, -55.1, -53.6, -21.8], "Peru": [-81.4, -18.4, -68.7, 0],
  "Colombia": [-79, -4.3, -66.8, 12.5], "Chile": [-75.7, -55.9, -66.4, -17.5],
  "Dominican Republic": [-72, 17.5, -68.3, 20], "Cuba": [-85, 19.8, -74, 23.3],
  "France": [-5.5, 41, 9.8, 51.5], "Spain": [-9.5, 35.8, 4.5, 43.9],
  "Portugal": [-9.6, 36.9, -6.1, 42.2], "Italy": [6.5, 36.5, 18.6, 47.2],
  "United Kingdom": [-8.7, 49.8, 2, 61], "Ireland": [-10.6, 51.4, -5.9, 55.4],
  "Germany": [5.8, 47.2, 15.1, 55.1], "Netherlands": [3.3, 50.7, 7.3, 53.6],
  "Belgium": [2.5, 49.4, 6.5, 51.6], "Switzerland": [5.9, 45.8, 10.6, 47.9],
  "Austria": [9.5, 46.3, 17.2, 49.1], "Greece": [19.3, 34.8, 28.3, 41.8],
  "Türkiye": [25.6, 35.8, 44.9, 42.2], "Morocco": [-13.2, 27.6, -1, 35.9],
  "Egypt": [24.7, 22, 36.9, 31.7], "South Africa": [16.4, -34.9, 32.9, -22.1],
  "Kenya": [33.9, -4.7, 41.9, 5.1], "Nigeria": [2.6, 4.2, 14.7, 13.9],
  "India": [68, 6.7, 97.4, 35.5], "China": [73, 18, 135, 53.6],
  "Japan": [128.5, 30, 146, 45.6], "South Korea": [124.5, 33, 132, 38.7],
  "Thailand": [97, 5.5, 106, 20.5], "Vietnam": [102, 8.3, 110, 23.5],
  "Malaysia": [99.5, 0.8, 119.4, 7.4], "Singapore": [103.5, 1.1, 104.2, 1.5],
  "Indonesia": [95, -11, 141, 6], "Philippines": [116.9, 4.6, 126.7, 21.2],
  "Taiwan": [119.5, 21.8, 122.1, 25.4], "Australia": [113, -43.7, 154, -10.5],
  "New Zealand": [166, -47.4, 179, -34],
};

/** Recover a country name from coordinates (loose bbox match); "" if none. */
export function reverseCountry(lng, lat) {
  if (!isFinite(lng) || !isFinite(lat)) return "";
  for (const [c, b] of Object.entries(COUNTRY_BBOX))
    if (lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]) return c;
  return "";
}

export function normCountry(c) {
  let t = (c ?? "").trim();
  if (!t) return "";
  const sub = t.match(/^(.+),\s*(united kingdom|united states)$/i);
  if (sub) t = sub[2];
  const direct = COUNTRY_ALIASES.get(t.toLowerCase());
  if (direct) return direct;
  if (/^united (kingdom|states)$/i.test(t)) {
    return t.replace(/^united kingdom$/i, "United Kingdom").replace(/^united states$/i, "United States");
  }
  return t;
}
