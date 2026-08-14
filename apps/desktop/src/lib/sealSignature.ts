// [印・署名] 氏名から「認印風の印影(丸印)」と「署名」をSVGで自動生成する。
// 承認時にログイン担当者の氏名から生成し、PDF/画面に押印・署名する。
// ※ 実際の印影・署名画像へは後日差し替え可能（同じ関数シグネチャで画像URLを返す実装に置換）。

/** 氏名から姓（最初のトークン、無ければ先頭2文字）を取り出す。 */
export function surnameOf(name: string): string {
  const t = name.trim().split(/[\s　]+/)[0] ?? name.trim()
  return t.length > 0 ? t : name.trim()
}

/** 認印風の丸印SVG（朱色）。姓を縦（2文字）/中央（1文字）に配置。size=mm相当のpx。 */
export function buildSealSvg(name: string, sizePx = 56): string {
  const s = surnameOf(name)
  const chars = [...s].slice(0, 2)
  const cx = sizePx / 2
  const r = sizePx / 2 - 2
  const red = '#c0392b'
  let text = ''
  if (chars.length <= 1) {
    text = `<text x="${cx}" y="${cx}" fill="${red}" font-size="${sizePx * 0.5}" text-anchor="middle" dominant-baseline="central" font-family="'Yu Mincho','Hiragino Mincho ProN',serif" font-weight="700">${chars[0] ?? ''}</text>`
  } else {
    const y1 = sizePx * 0.34, y2 = sizePx * 0.68
    text =
      `<text x="${cx}" y="${y1}" fill="${red}" font-size="${sizePx * 0.36}" text-anchor="middle" dominant-baseline="central" font-family="'Yu Mincho','Hiragino Mincho ProN',serif" font-weight="700">${chars[0]}</text>` +
      `<text x="${cx}" y="${y2}" fill="${red}" font-size="${sizePx * 0.36}" text-anchor="middle" dominant-baseline="central" font-family="'Yu Mincho','Hiragino Mincho ProN',serif" font-weight="700">${chars[1]}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" role="img" aria-label="印 ${s}">` +
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${red}" stroke-width="${Math.max(2, sizePx * 0.045)}"/>${text}</svg>`
}

/** 署名（氏名をやや手書き風に）。SVGテキストで返す。 */
export function buildSignatureSvg(name: string, widthPx = 120, heightPx = 28): string {
  const esc = name.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" role="img" aria-label="署名 ${name}">` +
    `<text x="4" y="${heightPx * 0.72}" fill="#1a2a44" font-size="${heightPx * 0.62}" font-style="italic" font-family="'Yu Mincho','Hiragino Mincho ProN',serif">${esc}</text></svg>`
}

/** data URI 版（img src に使いたい場合）。 */
export function sealDataUri(name: string, sizePx = 56): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(buildSealSvg(name, sizePx))
}
