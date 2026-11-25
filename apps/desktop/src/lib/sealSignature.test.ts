import { describe, expect, it } from 'vitest'
import { buildSealSvg, buildSignatureSvg, escapeXml } from './sealSignature.js'

// 印影・署名は dangerouslySetInnerHTML で画面に入るため、氏名に含まれる記号で別の要素・属性を作れないこと
describe('sealSignature のエスケープ', () => {
  const evil = '<img src=x onerror=alert(1)> "x" \'y\' &'
  it('escapeXml は < > & " \' を置き換える', () => {
    expect(escapeXml(evil)).toBe('&lt;img src=x onerror=alert(1)&gt; &quot;x&quot; &#39;y&#39; &amp;')
  })
  it('印影のSVGに、氏名由来の生の < " が入らない', () => {
    const svg = buildSealSvg(evil)
    expect(svg).not.toContain('<img')
    expect(svg).not.toMatch(/aria-label="[^"]*"[^>]*"x"/)
    expect((svg.match(/</g) ?? []).length).toBe((svg.match(/<(svg|circle|text|\/text|\/svg)/g) ?? []).length)
  })
  it('署名のSVGに、氏名由来の生の < " が入らない', () => {
    const svg = buildSignatureSvg(evil)
    expect(svg).not.toContain('<img')
    expect(svg).toContain('&lt;img')
    expect((svg.match(/aria-label=/g) ?? []).length).toBe(1)
    expect(svg).not.toContain('aria-label="署名 <')
  })
  it('通常の氏名はそのまま使える', () => {
    expect(buildSealSvg('試験 一郎')).toContain('試験')
    expect(buildSignatureSvg('試験 一郎')).toContain('試験 一郎')
  })
})
