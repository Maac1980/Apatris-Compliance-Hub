import DOMPurify from "dompurify";

/**
 * Sanitize HTML from API responses before rendering with dangerouslySetInnerHTML.
 * Strips all scripts, event handlers, and dangerous attributes while keeping
 * safe formatting tags (headings, paragraphs, lists, tables, spans, etc.).
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr", "div", "span", "blockquote", "pre", "code",
      "strong", "em", "b", "i", "u", "s", "sub", "sup", "mark",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "a", "img",
      "section", "article", "header", "footer", "main", "aside", "nav",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "width", "height",
      "class", "style", "id", "colspan", "rowspan", "scope",
    ],
    ALLOW_DATA_ATTR: false,
  });
}
