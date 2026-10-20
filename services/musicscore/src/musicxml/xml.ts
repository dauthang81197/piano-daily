import { XMLParser } from "fast-xml-parser";

/** Order-preserving XML element. MusicXML is order-sensitive (backup/forward), so a plain object map won't do. */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text, trimmed. */
  text: string;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  // MusicXML files carry a DOCTYPE; the parser must not try to resolve it.
  ignoreDeclaration: true,
});

type Raw = Record<string, unknown>;

function convert(raw: Raw[]): XmlNode[] {
  const out: XmlNode[] = [];
  for (const entry of raw) {
    const name = Object.keys(entry).find((k) => k !== ":@");
    if (!name || name === "#text") continue;
    const attrs: Record<string, string> = {};
    const rawAttrs = (entry[":@"] ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(rawAttrs)) attrs[k.replace(/^@_/, "")] = v;

    const kids = (entry[name] ?? []) as Raw[];
    const text = kids
      .filter((k) => "#text" in k)
      .map((k) => String(k["#text"]))
      .join("");
    out.push({ name, attrs, children: convert(kids), text });
  }
  return out;
}

export function parseXml(xml: string): XmlNode {
  const nodes = convert(parser.parse(xml) as Raw[]);
  const root = nodes[0];
  if (!root) throw new Error("Empty XML document");
  return root;
}

export const child = (n: XmlNode, name: string): XmlNode | undefined => n.children.find((c) => c.name === name);
export const childrenNamed = (n: XmlNode, name: string): XmlNode[] => n.children.filter((c) => c.name === name);
export const childText = (n: XmlNode, name: string): string | undefined => child(n, name)?.text;

export function childInt(n: XmlNode, name: string): number | undefined {
  const t = childText(n, name);
  if (t === undefined || t === "") return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

export const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
