import { decodeEntities, stripHtml } from "./util.mjs";

function textOf(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1];
  return decodeEntities(v).trim();
}

/**
 * Parse a Google My Maps KML export into flat placemarks:
 * [{ folder, name, description, lng, lat }]
 */
export function parseKml(xml) {
  const out = [];
  const folderRe = /<Folder>([\s\S]*?)<\/Folder>/g;
  let anyFolder = false;
  for (const fm of xml.matchAll(folderRe)) {
    anyFolder = true;
    const block = fm[1];
    const folder = textOf(block, "name");
    for (const pm of block.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const p = parsePlacemark(pm[1], folder);
      if (p) out.push(p);
    }
  }
  if (!anyFolder) {
    for (const pm of xml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const p = parsePlacemark(pm[1], "");
      if (p) out.push(p);
    }
  }
  return out;
}

function parsePlacemark(block, folder) {
  const name = textOf(block, "name");
  const coords = textOf(block, "coordinates");
  if (!name || !coords) return null;
  const [lng, lat] = coords.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const description = stripHtml(textOf(block, "description"));
  return { folder, name, description, lng, lat };
}
