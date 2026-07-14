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
]);

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
