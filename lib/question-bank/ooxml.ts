const MAX_XML_NODES_PER_PART = 100_000;
const MAX_XML_DEPTH = 128;
const XML_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/u;
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

function findTagEnd(source: string, start: number) {
  let quote: string | null = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

type XmlAttribute = {
  localName: string;
  name: string;
  namespaceUri: string;
  value: string;
};

type XmlElement = {
  attributes: XmlAttribute[];
  children: XmlElement[];
  localName: string;
  name: string;
  namespaceUri: string;
  text: string[];
};

class OoxmlParseError extends Error {
  constructor(readonly code = "xlsx_structure_invalid") {
    super(code);
    this.name = "OoxmlParseError";
  }
}

function splitName(name: string) {
  const separator = name.indexOf(":");
  return separator === -1
    ? { localName: name, prefix: "" }
    : { localName: name.slice(separator + 1), prefix: name.slice(0, separator) };
}

function decodeXmlEntities(value: string) {
  let decoded = "";
  for (let offset = 0; offset < value.length;) {
    if (value[offset] !== "&") {
      decoded += value[offset];
      offset += 1;
      continue;
    }
    const end = value.indexOf(";", offset + 1);
    if (end < 0 || end - offset > 16) throw new OoxmlParseError();
    const token = value.slice(offset + 1, end);
    const named: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"',
    };
    if (Object.prototype.hasOwnProperty.call(named, token)) {
      decoded += named[token];
    } else if (/^#(?:x[0-9a-f]{1,6}|[0-9]{1,7})$/iu.test(token)) {
      const codePoint = token[1]?.toLowerCase() === "x"
        ? Number.parseInt(token.slice(2), 16)
        : Number.parseInt(token.slice(1), 10);
      if (
        !Number.isInteger(codePoint)
        || codePoint <= 0
        || codePoint > 0x10ffff
        || (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d)
        || (codePoint & 0xffff) === 0xfffe
        || (codePoint & 0xffff) === 0xffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new OoxmlParseError();
      }
      decoded += String.fromCodePoint(codePoint);
    } else {
      throw new OoxmlParseError();
    }
    offset = end + 1;
  }
  return decoded;
}

function parseXmlDocument(bytes: Uint8Array, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new Error("OOXML parsing was aborted.");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new OoxmlParseError();
  }
  if (source.startsWith("\uFEFF")) source = source.slice(1);
  if (
    /<!\s*(?:DOCTYPE|ENTITY)/iu.test(source)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(source)
  ) throw new OoxmlParseError();

  const rootNamespaces = new Map<string, string>([["xml", XML_NAMESPACE]]);
  const stack: Array<{ element: XmlElement; namespaces: Map<string, string> }> = [];
  let root: XmlElement | null = null;
  let cursor = 0;
  let nodeCount = 0;

  const appendText = (rawText: string) => {
    if (!rawText) return;
    const text = decodeXmlEntities(rawText);
    if (stack.length) stack.at(-1)!.element.text.push(text);
    else if (text.trim()) throw new OoxmlParseError();
  };

  while (cursor < source.length) {
    if (signal?.aborted) throw signal.reason ?? new Error("OOXML parsing was aborted.");
    const tagStart = source.indexOf("<", cursor);
    if (tagStart < 0) {
      appendText(source.slice(cursor));
      cursor = source.length;
      break;
    }
    appendText(source.slice(cursor, tagStart));

    if (source.startsWith("<!--", tagStart)) {
      const commentEnd = source.indexOf("-->", tagStart + 4);
      if (commentEnd < 0 || source.slice(tagStart + 4, commentEnd).includes("--")) {
        throw new OoxmlParseError();
      }
      cursor = commentEnd + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", tagStart)) {
      if (!stack.length) throw new OoxmlParseError();
      const cdataEnd = source.indexOf("]]>", tagStart + 9);
      if (cdataEnd < 0) throw new OoxmlParseError();
      stack.at(-1)!.element.text.push(source.slice(tagStart + 9, cdataEnd));
      cursor = cdataEnd + 3;
      continue;
    }

    if (source.startsWith("<?", tagStart)) {
      const instructionEnd = source.indexOf("?>", tagStart + 2);
      if (
        instructionEnd < 0
        || tagStart !== source.indexOf("<")
        || !/^<\?xml\s+version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])UTF-8\2)?\s*\?>$/iu.test(source.slice(tagStart, instructionEnd + 2))
      ) {
        throw new OoxmlParseError();
      }
      cursor = instructionEnd + 2;
      continue;
    }

    if (source.startsWith("<!", tagStart)) throw new OoxmlParseError();
    const tagEnd = findTagEnd(source, tagStart);
    if (tagEnd < 0) throw new OoxmlParseError();
    const rawTag = source.slice(tagStart + 1, tagEnd);
    if (rawTag.startsWith("/")) {
      const closingName = rawTag.slice(1);
      if (!XML_NAME_PATTERN.test(closingName)) throw new OoxmlParseError();
      const current = stack.pop();
      if (!current || current.element.name !== closingName) throw new OoxmlParseError();
      cursor = tagEnd + 1;
      continue;
    }

    const selfClosing = /\/\s*$/u.test(rawTag);
    const content = selfClosing ? rawTag.replace(/\/\s*$/u, "") : rawTag;
    let index = 0;
    const skipWhitespace = () => {
      while (index < content.length && /\s/u.test(content[index]!)) index += 1;
    };
    skipWhitespace();
    const nameStart = index;
    while (index < content.length && !/[\s=]/u.test(content[index]!)) index += 1;
    const elementName = content.slice(nameStart, index);
    if (!XML_NAME_PATTERN.test(elementName)) throw new OoxmlParseError();

    const rawAttributes: Array<{ name: string; value: string }> = [];
    while (index < content.length) {
      skipWhitespace();
      if (index >= content.length) break;
      const attributeStart = index;
      while (index < content.length && !/[\s=]/u.test(content[index]!)) index += 1;
      const name = content.slice(attributeStart, index);
      if (!XML_NAME_PATTERN.test(name) || rawAttributes.some((attribute) => attribute.name === name)) {
        throw new OoxmlParseError();
      }
      skipWhitespace();
      if (content[index] !== "=") throw new OoxmlParseError();
      index += 1;
      skipWhitespace();
      const quote = content[index];
      if (quote !== "'" && quote !== '"') throw new OoxmlParseError();
      index += 1;
      const valueStart = index;
      while (index < content.length && content[index] !== quote) {
        if (content[index] === "<") throw new OoxmlParseError();
        index += 1;
      }
      if (index >= content.length) throw new OoxmlParseError();
      rawAttributes.push({ name, value: decodeXmlEntities(content.slice(valueStart, index)) });
      index += 1;
      if (rawAttributes.length > 64) throw new OoxmlParseError();
    }

    const namespaces = new Map(stack.at(-1)?.namespaces ?? rootNamespaces);
    for (const attribute of rawAttributes) {
      if (attribute.name === "xmlns") {
        namespaces.set("", attribute.value);
      } else if (attribute.name.startsWith("xmlns:")) {
        const prefix = attribute.name.slice(6);
        if (!prefix || prefix === "xmlns" || (prefix === "xml" && attribute.value !== XML_NAMESPACE)) {
          throw new OoxmlParseError();
        }
        namespaces.set(prefix, attribute.value);
      }
    }

    const elementNameParts = splitName(elementName);
    const namespaceUri = namespaces.get(elementNameParts.prefix);
    if (namespaceUri === undefined) throw new OoxmlParseError();
    const attributes = rawAttributes
      .filter((attribute) => attribute.name !== "xmlns" && !attribute.name.startsWith("xmlns:"))
      .map((attribute) => {
        const parts = splitName(attribute.name);
        const attributeNamespace = parts.prefix ? namespaces.get(parts.prefix) : "";
        if (attributeNamespace === undefined) throw new OoxmlParseError();
        return {
          localName: parts.localName,
          name: attribute.name,
          namespaceUri: attributeNamespace,
          value: attribute.value,
        };
      });
    const expandedAttributeNames = new Set<string>();
    for (const attribute of attributes) {
      const expandedName = `${attribute.namespaceUri}\u0000${attribute.localName}`;
      if (expandedAttributeNames.has(expandedName)) throw new OoxmlParseError();
      expandedAttributeNames.add(expandedName);
    }
    const element: XmlElement = {
      attributes,
      children: [],
      localName: elementNameParts.localName,
      name: elementName,
      namespaceUri,
      text: [],
    };
    nodeCount += 1;
    if (nodeCount > MAX_XML_NODES_PER_PART || stack.length >= MAX_XML_DEPTH) {
      throw new OoxmlParseError();
    }
    if (stack.length) stack.at(-1)!.element.children.push(element);
    else if (root) throw new OoxmlParseError();
    else root = element;

    if (!selfClosing) stack.push({ element, namespaces });
    cursor = tagEnd + 1;
  }

  if (stack.length || !root) throw new OoxmlParseError();
  return root;
}

function xmlChildren(element: XmlElement, localName: string, namespaceUri?: string) {
  return element.children.filter((child) =>
    child.localName === localName
    && (namespaceUri === undefined || child.namespaceUri === namespaceUri),
  );
}

function xmlAttribute(element: XmlElement, localName: string, namespaceUri = "") {
  return element.attributes.find((attribute) =>
    attribute.localName === localName && attribute.namespaceUri === namespaceUri,
  )?.value ?? null;
}

function xmlDescendants(element: XmlElement, localName: string, namespaceUri?: string): XmlElement[] {
  const matches: XmlElement[] = [];
  for (const child of element.children) {
    if (child.localName === localName && (namespaceUri === undefined || child.namespaceUri === namespaceUri)) {
      matches.push(child);
    }
    matches.push(...xmlDescendants(child, localName, namespaceUri));
  }
  return matches;
}

export {
  OoxmlParseError,
  parseXmlDocument,
  xmlAttribute,
  xmlChildren,
  xmlDescendants,
};
export type { XmlElement };
