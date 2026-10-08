import { describe, expect, it } from 'vitest'
import { classifyExperimentViewport } from '../src/services/experimentViewport'
import { readFileSync } from 'node:fs'
describe('experiment viewport policy', () => { it.each([[1440,900],[1920,1080],[1180,820],[1024,768]])('supports landscape', (w,h) => expect(classifyExperimentViewport(w,h)).toBe('full')); it.each([[820,1180],[768,1024]])('gates portrait tablets', (w,h) => expect(classifyExperimentViewport(w,h)).toBe('rotate')); it.each([[430,932],[390,844],[375,812],[360,800]])('blocks phones', (w,h) => expect(classifyExperimentViewport(w,h)).toBe('unsupported')); it('does not support 768px landscape', () => expect(classifyExperimentViewport(768,600)).toBe('rotate')) })
it('localizes the viewport gate when Korean is selected', () => {
  const source = readFileSync('src/components/ExperimentsWorkspace.tsx', 'utf8')
  expect(source).toContain("ko?'지원되지 않는 화면':'WORKSPACE UNAVAILABLE'")
  expect(source).toContain('실험 작업공간은 데스크톱과 가로 모드 태블릿에서 사용할 수 있습니다.')
  expect(source).toContain("ko?'실험 닫기':'Close Experiments'")
})
