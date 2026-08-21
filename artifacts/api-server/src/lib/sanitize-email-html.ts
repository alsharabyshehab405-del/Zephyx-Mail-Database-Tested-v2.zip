import sanitizeHtml from "sanitize-html";

const EMAIL_HTML_FIELDS = new Set(["bodyHtml", "body_html"]);

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "div", "span",
      "strong", "b", "em", "i", "u", "s",
      "blockquote", "pre", "code",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tfoot",
      "tr", "th", "td",
      "hr",
      "a", "img",
      "h1", "h2", "h3", "h4", "h5", "h6",
    ],
    allowedAttributes: {
      "*": ["dir", "lang", "class"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "cid", "data"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      }),
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sanitizeEmailHtmlPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeEmailHtmlPayload);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (EMAIL_HTML_FIELDS.has(key) && typeof child === "string") {
      output[key] = sanitizeEmailHtml(child);
    } else {
      output[key] = sanitizeEmailHtmlPayload(child);
    }
  }

  return output;
}
