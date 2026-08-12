// [REQ-018] Claude構造化レスポンス → ConstraintDef[] のパース parseConstraintsFromLLM の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 正常系＋想定外出力の異常系 / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { parseConstraintsFromLLM } from '../index.js'

/** 想定外出力に対し「実装済みのバリデーションエラー」で throw することを検証（NotImplemented スタブの throw では合格させない） */
function expectValidationThrow(fn: () => unknown): void {
  let err: unknown
  try {
    fn()
  } catch (e) {
    err = e
  }
  expect(err, 'バリデーションエラーを投げるべき').toBeInstanceOf(Error)
  expect((err as Error).message, 'NotImplemented スタブではなく実装済みの検証エラーであること').not.toMatch(/NotImplemented/)
}

const validRaw = [
  {
    id: 'c-1',
    category: 'legal',
    severity: 'hard',
    kind: 'qualification_required',
    params: { position: '責任者', qualification: '施設警備2級' },
    label: '責任者は有資格',
  },
]

describe('parseConstraintsFromLLM [REQ-018] 正常系', () => {
  it('parseConstraintsFromLLM_配列レスポンス_ConstraintDef配列へ写像する', () => {
    // Arrange & Act
    const defs = parseConstraintsFromLLM(validRaw)
    // Assert
    expect(defs).toHaveLength(1)
    expect(defs[0].id).toBe('c-1')
    expect(defs[0].kind).toBe('qualification_required')
    expect(defs[0].params).toEqual({ position: '責任者', qualification: '施設警備2級' })
  })

  it('parseConstraintsFromLLM_constraintsキー包含オブジェクト_内部配列を写像する', () => {
    // Arrange
    const wrapped = { constraints: validRaw }
    // Act
    const defs = parseConstraintsFromLLM(wrapped)
    // Assert
    expect(defs).toHaveLength(1)
    expect(defs[0].category).toBe('legal')
  })

  it('parseConstraintsFromLLM_active未指定_既定でtrueを補完する', () => {
    // Arrange & Act
    const defs = parseConstraintsFromLLM(validRaw)
    // Assert
    expect(defs[0].active).toBe(true)
  })

  it('parseConstraintsFromLLM_active明示false_値を保持する', () => {
    // Arrange
    const raw = [{ ...validRaw[0], active: false }]
    // Act
    const defs = parseConstraintsFromLLM(raw)
    // Assert
    expect(defs[0].active).toBe(false)
  })
})

describe('parseConstraintsFromLLM [REQ-018] 異常系(想定外出力)', () => {
  it('parseConstraintsFromLLM_必須フィールド欠落_throwする', () => {
    // Arrange: id 欠落
    const raw = [{ category: 'legal', severity: 'hard', kind: 'x', params: {}, label: 'no id' }]
    // Act & Assert
    expectValidationThrow(() => parseConstraintsFromLLM(raw))
  })

  it('parseConstraintsFromLLM_非配列かつconstraints無し_throwする', () => {
    // Arrange & Act & Assert
    expectValidationThrow(() => parseConstraintsFromLLM({ foo: 'bar' }))
  })

  it('parseConstraintsFromLLM_null入力_throwする（境界）', () => {
    // Arrange & Act & Assert
    expectValidationThrow(() => parseConstraintsFromLLM(null))
  })

  it('parseConstraintsFromLLM_要素が非オブジェクト_throwする', () => {
    // Arrange
    const raw = ['not-an-object']
    // Act & Assert
    expectValidationThrow(() => parseConstraintsFromLLM(raw))
  })

  it('parseConstraintsFromLLM_文字列入力_throwする（境界）', () => {
    // Arrange & Act & Assert
    expectValidationThrow(() => parseConstraintsFromLLM('constraints'))
  })
})
