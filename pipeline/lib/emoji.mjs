/** Pick a marker emoji from a venue's name / category / dish notes. First hit wins. */
const NAME_RULES = [
  [/pizz/i, "🍕"],
  [/sushi|omakase|sashimi/i, "🍣"],
  [/ramen|noodle|nudel|pho\b|phở|bún|bun bo|mì\b|mee\b|laksa|udon|soba|pasta|spaghett/i, "🍜"],
  [/taco|taquer|birria|carnitas|pastor\b/i, "🌮"],
  [/burger/i, "🍔"],
  [/hot ?dog|wiener|weiner|frankfurter|coney/i, "🌭"],
  [/oyster|austern/i, "🦪"],
  [/crab\b|cangrejo/i, "🦀"],
  [/lobster|homard/i, "🦞"],
  [/seafood|mariscos|fish|poisson|pesca|anchoa/i, "🐟"],
  [/barbecue|bbq|grill|asado|churrasc|yakitori|satay|kebab|braai|smokehouse|parrilla/i, "🍖"],
  [/steak|beef|carne|brasserie du boeuf/i, "🥩"],
  [/chicken|pollo|poulet|hühner/i, "🍗"],
  [/dumpling|momo\b|gyoza|dim sum|xiao ?long|mandu|pierogi|ravioli/i, "🥟"],
  [/curry|masala|tandoor/i, "🍛"],
  [/bakery|boulanger|pâtisserie|patisserie|croissant|pastry|pasteler/i, "🥐"],
  [/ice cream|gelato|helado|glacier/i, "🍦"],
  [/donut|doughnut/i, "🍩"],
  [/bagel/i, "🥯"],
  [/crêpe|crepe|pancake|waffle/i, "🥞"],
  [/cheese|fromager|queso/i, "🧀"],
  [/deli\b|sandwich|banh mi|bánh mì|sub shop|smørrebrød/i, "🥪"],
  [/lech[oó]n|pork|pig\b|cochon|schwein|char siu|porchetta/i, "🐷"],
  [/hot ?pot|hotpot|shabu|soup|stew|pot-au|goulash|ph[o0]?zzz/i, "🍲"],
  [/brewery|brau|beer|biergarten|pub\b|taproom|cervecer/i, "🍺"],
  [/winery|wine bar|vinho|bodega|weingut|cave à vin/i, "🍷"],
  [/cocktail|speakeasy|mezcal|tiki/i, "🍸"],
  [/coffee|café|cafe\b|espresso|kopi|kaffee/i, "☕"],
  [/tea house|teahouse|chá|čajovna/i, "🍵"],
  [/market|mercado|bazaar|souk|hawker|food court|stalls|marché|markt/i, "🧺"],
  [/temple|museum|park\b|palace|castle|cathedral|church|mosque|monument|bridge|tower|beach|falls|mountain|lake|shrine|fort\b|plaza|square|garden/i, "📍"],
  [/hotel|hostel|\binn\b|lodge|resort|ryokan|riad/i, "🛏️"],
];

const NOTE_RULES = [
  [/noodle|pho\b|ramen|bún|laksa/i, "🍜"],
  [/pizza/i, "🍕"],
  [/sushi|sashimi/i, "🍣"],
  [/oyster/i, "🦪"],
  [/crab/i, "🦀"],
  [/barbecue|bbq|grilled meat|spit|roast/i, "🍖"],
  [/dumpling|momo/i, "🥟"],
  [/curry/i, "🍛"],
  [/seafood|fish\b/i, "🐟"],
  [/beer|brew/i, "🍺"],
  [/coffee/i, "☕"],
  [/pork|pig/i, "🐷"],
  [/soup|stew|broth/i, "🍲"],
];

export function emojiFor(name, kind, note) {
  for (const [re, e] of NAME_RULES) if (re.test(name)) return e;
  if (kind === "market") return "🧺";
  for (const [re, e] of NOTE_RULES) if (re.test(note ?? "")) return e;
  if (kind === "restaurant / bar" && /\bbar\b/i.test(name)) return "🍻";
  return "🍽️";
}
