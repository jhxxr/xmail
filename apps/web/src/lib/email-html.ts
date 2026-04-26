const BLOCKED_CSS_PROPERTIES = [
  "user-select",
  "-webkit-user-select",
  "-moz-user-select",
  "-ms-user-select",
  "-webkit-touch-callout",
  "pointer-events",
  "caret-color",
  "-webkit-user-drag",
  "user-drag",
]

const BLOCKED_SELECTION_RULES = [
  /[^{}]*::selection\s*{[^{}]*}/gi,
  /[^{}]*::-moz-selection\s*{[^{}]*}/gi,
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripBlockedCssDeclarations(css: string): string {
  let safe = css

  for (const property of BLOCKED_CSS_PROPERTIES) {
    safe = safe.replace(new RegExp(`${escapeRegExp(property)}\\s*:\\s*[^;}{]+;?`, "gi"), "")
  }

  return safe
}

function sanitizeInlineStyle(style: string): string {
  return stripBlockedCssDeclarations(style)
    .replace(/\s*;\s*/g, "; ")
    .replace(/^;\s*|\s*;$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function sanitizeEmbeddedCss(css: string): string {
  let safe = css

  for (const rule of BLOCKED_SELECTION_RULES) {
    safe = safe.replace(rule, "")
  }

  safe = stripBlockedCssDeclarations(safe)
    .replace(/[^{}]+\{\s*\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

  return safe
}

export function sanitizeEmailHtml(html: string): string {
  let safe = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi, "")

  safe = safe.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs: string, css: string) => {
    const sanitizedCss = sanitizeEmbeddedCss(css)
    return sanitizedCss ? `<style${attrs}>${sanitizedCss}</style>` : ""
  })

  safe = safe.replace(/\s+style\s*=\s*("([^"]*)"|'([^']*)')/gi, (_match, _quotedValue, doubleQuotedValue: string | undefined, singleQuotedValue: string | undefined) => {
    const value = doubleQuotedValue ?? singleQuotedValue ?? ""
    const quote = doubleQuotedValue !== undefined ? '"' : "'"
    const sanitizedStyle = sanitizeInlineStyle(value)
    return sanitizedStyle ? ` style=${quote}${sanitizedStyle}${quote}` : ""
  })

  safe = safe.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
  safe = safe.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "")
  safe = safe.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
  safe = safe.replace(/src\s*=\s*["']javascript:[^"']*["']/gi, "")
  safe = safe.replace(/<a\s+([^>]*href=)/gi, '<a target="_blank" rel="noopener noreferrer" $1')

  return safe
}
