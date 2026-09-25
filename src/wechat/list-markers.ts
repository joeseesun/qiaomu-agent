// Ported unchanged from qmblog lib/wechat-list-markers.ts (same author). Keep in sync when the blog changes.
export const WECHAT_LIST_MARKER_CLASS = 'wechat-list-marker'

const UNORDERED_MARKERS = ['•', '◦', '▪'] as const

export function getWechatUnorderedListMarker(depth: number) {
  const index = Math.abs(Math.trunc(depth)) % UNORDERED_MARKERS.length
  return UNORDERED_MARKERS[index]
}

function formatAlphaMarker(index: number, uppercase: boolean) {
  if (index <= 0) return String(index)

  let value = index
  let marker = ''
  while (value > 0) {
    value -= 1
    marker = String.fromCharCode(97 + (value % 26)) + marker
    value = Math.floor(value / 26)
  }

  return uppercase ? marker.toUpperCase() : marker
}

function formatRomanMarker(index: number, uppercase: boolean) {
  if (index <= 0 || index >= 4000) return String(index)

  const parts: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ]
  let value = index
  let marker = ''

  for (const [amount, label] of parts) {
    while (value >= amount) {
      marker += label
      value -= amount
    }
  }

  return uppercase ? marker.toUpperCase() : marker
}

export function formatWechatOrderedListMarker(index: number, type = '1') {
  const normalized = Number.isFinite(index) ? Math.trunc(index) : 1
  let marker: string

  switch (type) {
    case 'a':
      marker = formatAlphaMarker(normalized, false)
      break
    case 'A':
      marker = formatAlphaMarker(normalized, true)
      break
    case 'i':
      marker = formatRomanMarker(normalized, false)
      break
    case 'I':
      marker = formatRomanMarker(normalized, true)
      break
    default:
      marker = String(normalized)
      break
  }

  return `${marker}.`
}
