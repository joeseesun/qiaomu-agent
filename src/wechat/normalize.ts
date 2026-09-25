// Ported from qmblog lib/wechat-copy.ts and lib/code-highlight.ts (same author).
// Only the framework-free DOM normalization is kept: no juice, html2pdf, KaTeX or
// highlight.js, so the Obsidian bundle stays small. Keep in sync with the blog.
import {
  normalizeWechatExternalLinkFootnotes,
  normalizeWechatImageFigures,
  normalizeWechatInlineMarkup,
  normalizeWechatPublishingBlocks,
  normalizeWechatVideoPlaceholders,
} from './publishing-enhancements'
import {
  formatWechatOrderedListMarker,
  getWechatUnorderedListMarker,
  WECHAT_LIST_MARKER_CLASS,
} from './list-markers'
import { normalizeWechatExportHtml } from './export-style'

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getCodeLanguage(code: HTMLElement) {
  const languageClass = Array.from(code.classList).find(className => className.startsWith('language-'))
  const fromClass = languageClass?.replace(/^language-/, '').trim()
  const fromData = code.getAttribute('data-language')?.trim()
  const language = fromClass || fromData || ''
  return language.toLowerCase()
}

export function isMermaidLanguage(language: string) {
  return language.toLowerCase() === 'mermaid'
}

export function isPlantUmlLanguage(language: string) {
  const normalized = language.toLowerCase()
  return normalized === 'plantuml' || normalized === 'puml'
}

export function isInfographicLanguage(language: string) {
  return language.toLowerCase() === 'infographic'
}

export function isVisualDiagramLanguage(language: string) {
  return isMermaidLanguage(language) || isPlantUmlLanguage(language) || isInfographicLanguage(language)
}

// WeChat export renders plain code blocks without syntax highlighting:
// each line is emitted as escaped text inside a single-color line span.
export function buildPlainCodeLinesHtml(codeText: string) {
  return codeText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line, index) => (
      `<span class="wechat-code-row"><span class="wechat-code-line-number" aria-hidden="true">${index + 1}</span><span class="wechat-code-line">${escapeHtml(line) || '&nbsp;'}</span></span>`
    ))
    .join('')
}


const THEME_OWNED_INLINE_STYLE_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'background-image',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-decoration-color',
  'caret-color',
  'border-left',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-radius',
] as const

const WECHAT_MAC_CODE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" width="45px" height="13px" viewBox="0 0 450 130">
  <ellipse cx="50" cy="65" rx="50" ry="52" stroke="rgb(220,60,54)" stroke-width="2" fill="rgb(237,108,96)" />
  <ellipse cx="225" cy="65" rx="50" ry="52" stroke="rgb(218,151,33)" stroke-width="2" fill="rgb(247,193,81)" />
  <ellipse cx="400" cy="65" rx="50" ry="52" stroke="rgb(27,161,37)" stroke-width="2" fill="rgb(100,200,86)" />
</svg>
`.trim()

function normalizeMediaAttributes(root: ParentNode) {
  for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
    const width = image.getAttribute('width')
    const height = image.getAttribute('height')

    if (width) {
      image.removeAttribute('width')
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }

    if (height) {
      image.removeAttribute('height')
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }
  }
}

function stripThemeConflictingInlineStyles(root: ParentNode) {
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (element.closest('pre, code, .code__pre')) continue

    for (const property of THEME_OWNED_INLINE_STYLE_PROPERTIES) {
      element.style.removeProperty(property)
    }

    const style = element.getAttribute('style')
    if (!style || style.trim().length === 0) {
      element.removeAttribute('style')
    }
  }
}

function normalizeCodeLinesMarkup(code: HTMLElement) {
  if (code.querySelector(':scope > .wechat-code-body')) return

  const codeText = (code.textContent || '').replace(/\r\n/g, '\n')
  const body = code.ownerDocument.createElement('span')
  body.className = 'wechat-code-body'

  const codeScroll = code.ownerDocument.createElement('span')
  codeScroll.className = 'wechat-code-scroll'

  const codeLines = code.ownerDocument.createElement('span')
  codeLines.className = 'wechat-code-lines'
  codeLines.innerHTML = buildPlainCodeLinesHtml(codeText)

  codeScroll.appendChild(codeLines)
  body.appendChild(codeScroll)
  code.replaceChildren(body)
}

function normalizeCodeBlockMarkup(root: ParentNode) {
  for (const pre of root.querySelectorAll<HTMLPreElement>('pre')) {
    const code = pre.querySelector<HTMLElement>('code')
    if (!code)
      continue

    pre.classList.add('code__pre')

    normalizeCodeLinesMarkup(code)

    for (const sign of pre.querySelectorAll(':scope > .mac-sign')) {
      sign.remove()
    }

    const sign = pre.ownerDocument.createElement('span')
    sign.className = 'mac-sign'
    sign.setAttribute('aria-hidden', 'true')
    sign.setAttribute('style', 'padding: 10px 14px 0;')
    sign.innerHTML = WECHAT_MAC_CODE_SVG

    pre.insertBefore(sign, code)
  }
}

function isListElement(element: Element): element is HTMLUListElement | HTMLOListElement {
  const tagName = element.tagName.toLowerCase()
  return tagName === 'ul' || tagName === 'ol'
}

function readIntegerAttribute(element: Element, name: string) {
  const value = element.getAttribute(name)
  if (!value) return null

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function getListDepth(list: Element) {
  let depth = 0
  let current = list.parentElement
  while (current) {
    if (isListElement(current)) depth += 1
    current = current.parentElement
  }
  return depth
}

function getDirectListItems(list: Element) {
  return Array.from(list.children).filter((child): child is HTMLLIElement => child.tagName.toLowerCase() === 'li')
}

function isExistingListMarker(element: Element) {
  return element.classList.contains(WECHAT_LIST_MARKER_CLASS)
}

function hasDirectListMarker(item: HTMLLIElement) {
  for (const child of Array.from(item.children)) {
    if (isExistingListMarker(child)) return true
    if (isListElement(child)) continue
    if (child.firstElementChild && isExistingListMarker(child.firstElementChild)) return true
  }
  return false
}

function isTaskList(list: Element) {
  return list.tagName.toLowerCase() === 'ul' && list.getAttribute('data-type') === 'taskList'
}

function findTaskCheckbox(item: HTMLLIElement) {
  for (const child of Array.from(item.children)) {
    if (child.tagName.toLowerCase() === 'label') {
      const input = child.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (input) return input
    }
    if (child.tagName.toLowerCase() === 'input' && child.getAttribute('type') === 'checkbox') {
      return child as HTMLInputElement
    }
  }
  return null
}

function isEmptyListItemBlock(element: Element) {
  const tagName = element.tagName.toLowerCase()
  if (tagName !== 'p' && tagName !== 'div') return false

  return getMeaningfulChildNodes(element).length === 0
}

function removeLeadingEmptyListItemBlocks(item: HTMLLIElement) {
  for (const child of Array.from(item.children)) {
    if (isListElement(child)) break
    if (!isEmptyListItemBlock(child)) break
    child.remove()
  }
}

function removeDirectTaskControl(item: HTMLLIElement) {
  for (const child of Array.from(item.children)) {
    const tagName = child.tagName.toLowerCase()
    if (tagName === 'label') {
      child.remove()
      continue
    }
    if (tagName === 'input' && child.getAttribute('type') === 'checkbox') {
      child.remove()
    }
  }
}

function hasMarkerContent(element: Element) {
  if (element.textContent?.replace(/\u00a0/g, ' ').trim()) return true
  return Boolean(element.querySelector('img, video, audio, iframe, svg, math, table, pre, code'))
}

function findFirstMarkerContentBlock(element: HTMLElement): HTMLElement | null {
  if (element.tagName.toLowerCase() === 'p' && hasMarkerContent(element)) return element

  for (const child of Array.from(element.children)) {
    const tagName = child.tagName.toLowerCase()
    if (isListElement(child) || tagName === 'label') continue
    if (!hasMarkerContent(child)) continue
    if (tagName === 'p') return child as HTMLElement
    if (tagName === 'div' || tagName === 'section') {
      return findFirstMarkerContentBlock(child as HTMLElement) || (child as HTMLElement)
    }
    return child as HTMLElement
  }

  return null
}

function findMarkerTarget(item: HTMLLIElement) {
  for (const node of Array.from(item.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return item
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue

    const element = node as HTMLElement
    if (isListElement(element) || element.tagName.toLowerCase() === 'label') continue
    if (!hasMarkerContent(element)) continue

    if (
      element.tagName.toLowerCase() === 'p'
      || element.tagName.toLowerCase() === 'div'
      || element.tagName.toLowerCase() === 'section'
    ) {
      return findFirstMarkerContentBlock(element) || element
    }

    return element
  }

  return item
}

function prependListMarker(item: HTMLLIElement, marker: string, options: { task?: boolean } = {}) {
  if (hasDirectListMarker(item)) return

  const target = findMarkerTarget(item)
  const markerElement = item.ownerDocument.createElement('span')
  markerElement.className = WECHAT_LIST_MARKER_CLASS
  markerElement.setAttribute('data-wechat-list-marker', 'true')
  markerElement.setAttribute('aria-hidden', 'true')
  if (options.task) markerElement.setAttribute('data-wechat-task-marker', 'true')
  markerElement.textContent = marker

  target.insertBefore(markerElement, target.firstChild)
}

function normalizeWechatList(list: HTMLUListElement | HTMLOListElement, depth: number) {
  const ordered = list.tagName.toLowerCase() === 'ol'
  const taskList = isTaskList(list)
  const orderedType = ordered ? list.getAttribute('type') || '1' : '1'
  let counter = ordered ? readIntegerAttribute(list, 'start') ?? 1 : 1

  list.setAttribute('data-wechat-list', ordered ? 'ordered' : taskList ? 'task' : 'unordered')

  for (const item of getDirectListItems(list)) {
    removeLeadingEmptyListItemBlocks(item)

    if (taskList) {
      const checkbox = findTaskCheckbox(item)
      const checked = item.getAttribute('data-checked') === 'true'
        || Boolean(checkbox?.checked)
        || Boolean(checkbox?.hasAttribute('checked'))
        || checkbox?.getAttribute('aria-checked') === 'true'
      removeDirectTaskControl(item)
      prependListMarker(item, checked ? '☑' : '☐', { task: true })
    } else if (ordered) {
      const explicitValue = readIntegerAttribute(item, 'value')
      const value = explicitValue ?? counter
      prependListMarker(item, formatWechatOrderedListMarker(value, orderedType))
      counter = value + 1
    } else {
      prependListMarker(item, getWechatUnorderedListMarker(depth) ?? '•')
    }
  }
}

function normalizeWechatListMarkup(root: ParentNode) {
  const lists = Array.from(root.querySelectorAll<HTMLUListElement | HTMLOListElement>('ul, ol'))
    .filter((list) => !list.closest('pre, code, .code-snippet__fix'))

  for (const list of lists) {
    normalizeWechatList(list, getListDepth(list))
  }
}

function getMeaningfulChildNodes(element: Element) {
  return Array.from(element.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim())
    if (node.nodeType !== Node.ELEMENT_NODE) return true
    return (node as Element).tagName.toLowerCase() !== 'br'
  })
}

function isImageGridItem(node: Node): node is HTMLElement {
  if (node.nodeType !== Node.ELEMENT_NODE) return false

  const element = node as HTMLElement
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'img') return true
  if (tagName !== 'a') return false

  const children = getMeaningfulChildNodes(element)
  return children.length === 1
    && children[0]!.nodeType === Node.ELEMENT_NODE
    && (children[0] as HTMLElement).tagName.toLowerCase() === 'img'
}

function getImageOnlyParagraphItems(paragraph: HTMLParagraphElement) {
  if (paragraph.closest('pre, code, .code-snippet__fix')) return null
  if (paragraph.closest('.wechat-image-slider, [data-wechat-component="slider"]')) return null

  const children = getMeaningfulChildNodes(paragraph)
  if (children.length === 0) return null
  if (!children.every(isImageGridItem)) return null

  return children as HTMLElement[]
}

function createWechatImageGridTable(doc: Document, items: HTMLElement[]) {
  const table = doc.createElement('table')
  table.className = 'wechat-image-grid'
  table.setAttribute('data-wechat-image-grid', 'true')

  const tbody = doc.createElement('tbody')

  for (let index = 0; index < items.length; index += 2) {
    const row = doc.createElement('tr')
    row.setAttribute('data-wechat-image-grid-row', 'true')

    for (const item of items.slice(index, index + 2)) {
      const cell = doc.createElement('td')
      cell.setAttribute('data-wechat-image-grid-cell', 'true')
      cell.appendChild(item)
      row.appendChild(cell)
    }

    tbody.appendChild(row)
  }

  table.appendChild(tbody)
  return table
}

function normalizeWechatImageGridMarkup(root: ParentNode) {
  const paragraphs = Array.from(root.querySelectorAll<HTMLParagraphElement>('p'))
  const processed = new Set<HTMLParagraphElement>()

  for (const paragraph of paragraphs) {
    if (!paragraph.isConnected || processed.has(paragraph)) continue

    const firstItems = getImageOnlyParagraphItems(paragraph)
    if (!firstItems) continue

    const run = [paragraph]
    const items = [...firstItems]
    processed.add(paragraph)

    let cursor = paragraph.nextElementSibling
    while (cursor?.tagName.toLowerCase() === 'p') {
      const nextParagraph = cursor as HTMLParagraphElement
      const nextItems = getImageOnlyParagraphItems(nextParagraph)
      if (!nextItems) break

      run.push(nextParagraph)
      items.push(...nextItems)
      processed.add(nextParagraph)
      cursor = nextParagraph.nextElementSibling
    }

    if (items.length < 2) continue

    const table = createWechatImageGridTable(paragraph.ownerDocument, items)
    paragraph.parentNode?.insertBefore(table, paragraph)

    for (const item of run) {
      if (item.isConnected) item.remove()
    }
  }
}

function replaceElementWithInlineSpan(element: HTMLElement) {
  const span = element.ownerDocument.createElement('span')
  span.innerHTML = element.innerHTML

  const style = element.getAttribute('style')
  if (style) span.setAttribute('style', style)

  element.replaceWith(span)
}

function getWechatTableColumnCount(table: HTMLTableElement) {
  let maxColumns = 0

  const rows = Array.from(table.children).flatMap((child) => {
    const tagName = child.tagName.toLowerCase()
    if (tagName === 'tr') return [child]
    if (tagName === 'thead' || tagName === 'tbody' || tagName === 'tfoot') {
      return Array.from(child.children).filter(row => row.tagName.toLowerCase() === 'tr')
    }
    return []
  })

  for (const row of rows) {
    const cells = Array.from(row.children).filter((cell) => {
      const tagName = cell.tagName.toLowerCase()
      return tagName === 'th' || tagName === 'td'
    })
    const columns = cells.reduce((total, cell) => {
      const colSpan = Number.parseInt(cell.getAttribute('colspan') || '', 10)
      return total + Math.max(1, Number.isFinite(colSpan) ? colSpan : 1)
    }, 0)
    maxColumns = Math.max(maxColumns, columns)
  }

  return maxColumns
}

function ensureWechatTableScrollContainer(table: HTMLTableElement) {
  if (table.closest('[data-wechat-table-scroll="true"]')) return
  if (!table.parentNode) return

  const wrapper = table.ownerDocument.createElement('section')
  wrapper.className = 'wechat-table-scroll'
  wrapper.setAttribute('data-wechat-table-scroll', 'true')

  table.parentNode.insertBefore(wrapper, table)
  wrapper.appendChild(table)
}

function normalizeWechatTableMarkup(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>('table:not(.wechat-image-grid)')) {
    if (table.closest('pre, code, .code-snippet__fix')) continue
    table.setAttribute('data-wechat-table', 'true')

    const columnCount = getWechatTableColumnCount(table)
    if (columnCount > 0) {
      table.setAttribute('data-wechat-table-columns', String(columnCount))
      table.classList.add(columnCount > 3 ? 'wechat-table-wide' : 'wechat-table-compact')
    }

    for (const cell of table.querySelectorAll<HTMLTableCellElement>('th, td')) {
      const blockChildren = Array.from(cell.children).filter((child): child is HTMLElement => {
        const tagName = child.tagName.toLowerCase()
        if (child.querySelector('ul, ol, blockquote, table, pre')) return false
        return tagName === 'p' || tagName === 'div'
      })

      blockChildren.forEach((child, index) => {
        replaceElementWithInlineSpan(child)
        if (index < blockChildren.length - 1) {
          cell.insertBefore(cell.ownerDocument.createElement('br'), blockChildren[index + 1] ?? null)
        }
      })
    }

    ensureWechatTableScrollContainer(table)
  }
}

function normalizeWechatListItemMarkup(root: ParentNode) {
  for (const item of root.querySelectorAll<HTMLLIElement>('li')) {
    if (item.closest('pre, code, .code-snippet__fix')) continue

    for (const child of Array.from(item.children)) {
      const tagName = child.tagName.toLowerCase()
      if (tagName !== 'p' && tagName !== 'div') continue
      if (child.querySelector('ul, ol, blockquote, table, pre')) continue
      replaceElementWithInlineSpan(child as HTMLElement)
    }
  }
}

function getWechatListKind(list: HTMLUListElement | HTMLOListElement) {
  const existing = list.getAttribute('data-wechat-list')
  if (existing) return existing

  if (isTaskList(list)) return 'task'
  return list.tagName.toLowerCase() === 'ol' ? 'ordered' : 'unordered'
}

function transferListItemAttributes(source: HTMLLIElement, target: HTMLElement) {
  for (const attribute of Array.from(source.attributes)) {
    if (!attribute.name.startsWith('data-')) continue
    target.setAttribute(attribute.name, attribute.value)
  }
}

function normalizeWechatListContainers(root: ParentNode) {
  const lists = Array.from(root.querySelectorAll<HTMLUListElement | HTMLOListElement>('ul, ol'))
    .filter((list) => !list.closest('pre, code, .code-snippet__fix'))
    .sort((a, b) => getListDepth(b) - getListDepth(a))

  for (const list of lists) {
    if (!list.isConnected) continue

    const block = list.ownerDocument.createElement('section')
    block.className = 'wechat-list-block'
    block.setAttribute('data-wechat-list-block', 'true')
    block.setAttribute('data-wechat-list', getWechatListKind(list))

    const dataType = list.getAttribute('data-type')
    if (dataType) block.setAttribute('data-type', dataType)

    for (const item of getDirectListItems(list)) {
      const itemBlock = list.ownerDocument.createElement('section')
      itemBlock.className = 'wechat-list-item'
      itemBlock.setAttribute('data-wechat-list-item', 'true')
      transferListItemAttributes(item, itemBlock)

      while (item.firstChild) {
        itemBlock.appendChild(item.firstChild)
      }

      block.appendChild(itemBlock)
    }

    list.replaceWith(block)
  }
}

function isWechatEmptyParagraph(element: Element | null): element is HTMLParagraphElement {
  if (!element || element.tagName.toLowerCase() !== 'p') return false
  if (element.querySelector('img, video, audio, iframe, svg, math, table, pre, code')) return false

  const text = (element.textContent || '').replace(/\u00a0/g, ' ').trim()
  return element.getAttribute('data-wechat-empty') === 'true' || text.length === 0
}

function removeEmptyParagraphsAroundWechatLists(root: ParentNode) {
  const lists = Array.from(root.querySelectorAll<HTMLElement>('ul, ol, .wechat-list-block'))
    .filter((list) => !list.closest('pre, code, .code-snippet__fix'))

  for (const list of lists) {
    let previous = list.previousElementSibling
    while (isWechatEmptyParagraph(previous)) {
      const current = previous
      previous = current.previousElementSibling
      current.remove()
    }

    let next = list.nextElementSibling
    while (isWechatEmptyParagraph(next)) {
      const current = next
      next = current.nextElementSibling
      current.remove()
    }
  }
}

export interface WechatNormalizeOptions {
  /** Base URL for turning relative links into footnotes. */
  baseUrl?: string
}

/** Normalizes rendered article HTML into WeChat-safe markup (before CSS inlining). */
export function normalizeWechatArticleDom(doc: Document, options: WechatNormalizeOptions = {}) {
  normalizeMediaAttributes(doc)
  normalizeWechatPublishingBlocks(doc)
  normalizeWechatInlineMarkup(doc)
  normalizeCodeBlockMarkup(doc)
  normalizeWechatImageGridMarkup(doc)
  normalizeWechatImageFigures(doc)
  normalizeWechatListMarkup(doc)
  normalizeWechatTableMarkup(doc)
  normalizeWechatListItemMarkup(doc)
  normalizeWechatListContainers(doc)
  removeEmptyParagraphsAroundWechatLists(doc)
  normalizeWechatVideoPlaceholders(doc)
  stripThemeConflictingInlineStyles(doc)
  normalizeWechatExternalLinkFootnotes(doc, options.baseUrl || 'https://example.invalid/')
}

export function parseWechatArticleHtml(html: string) {
  return new DOMParser().parseFromString(normalizeWechatExportHtml(html), 'text/html')
}

export function buildWechatExportFragment(html: string) {
  return `<section class="wechat-export-root"><article class="wechat-export-article"><div class="wechat-export-content">${html}</div></article></section>`
}

function parseCssColor(value: string) {
  const color = value.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const raw = hex[1] ?? ''
    const full = raw.length === 3
      ? raw.split('').map(char => `${char}${char}`).join('')
      : raw
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    }
  }

  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color)
  if (!rgb) return null

  return {
    r: Number.parseInt(rgb[1] ?? '0', 10),
    g: Number.parseInt(rgb[2] ?? '0', 10),
    b: Number.parseInt(rgb[3] ?? '0', 10),
  }
}

function readBorderLeftColor(element: HTMLElement) {
  return element.style.getPropertyValue('border-left-color')
    || element.style.borderLeftColor
    || element.style.borderColor
    || ''
}

function getQuoteDepth(element: HTMLElement) {
  let depth = 0
  let parent = element.parentElement?.closest('blockquote')
  while (parent) {
    depth += 1
    parent = parent.parentElement?.closest('blockquote') || null
  }
  return depth
}

function normalizeInlinedQuoteStyles(root: ParentNode) {
  for (const quote of Array.from(root.querySelectorAll<HTMLElement>('blockquote'))) {
    quote.style.borderTopLeftRadius = '0'
    quote.style.borderBottomLeftRadius = '0'

    const parentQuote = quote.parentElement?.closest('blockquote') as HTMLElement | null
    const sourceColor = parentQuote
      ? readBorderLeftColor(parentQuote)
      : readBorderLeftColor(quote)
    const rgb = parseCssColor(sourceColor)
    const depth = getQuoteDepth(quote)

    if (rgb && depth > 0) {
      const alpha = Math.max(0.34, 0.72 - depth * 0.18)
      quote.style.borderLeftColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(2)})`
    }
  }
}

export function normalizeInlinedWechatHtml(html: string) {
  if (typeof DOMParser === 'undefined') return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  normalizeInlinedQuoteStyles(doc)
  return doc.body.innerHTML
}