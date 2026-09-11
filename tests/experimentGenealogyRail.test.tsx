import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ExperimentGenealogyRail from '../src/components/ExperimentGenealogyRail'
import type { ExperimentVariant } from '../src/models/experiment'

const variant=(id:string,parent:string|null):ExperimentVariant=>({variantId:id,parentVariantId:parent,label:id,createdAt:'',updatedAt:'',note:'',snapshot:{rows:[]}})
const model={baseIncluded:true as const,families:[{parent:variant('A',null),children:[variant('A1','A'),variant('A2','A')]},{parent:variant('B',null),children:[variant('B1','B')]}],additionalLegacyCandidates:[]}
const render=(state:string,language:'en'|'ko'='en')=>renderToStaticMarkup(<ExperimentGenealogyRail model={model} editingState={state} activeFamilyId={state==='base'?null:'A'} language={language} onSelectBase={()=>{}} onSelectVariant={()=>{}}/>)
describe('normal genealogy rail static semantics',()=>{
  it('uses native comparison checkboxes in the same families, with BASE non-removable',()=>{
    const html=renderToStaticMarkup(<ExperimentGenealogyRail model={model} mode="compare" compareDraftIds={['A','A1','A2','B']} editingState="A2" activeFamilyId="A" language="en" onSelectBase={()=>{}} onSelectVariant={()=>{}} onToggleCompare={()=>{}}/>)
    expect(html.match(/type="checkbox"/g)).toHaveLength(5)
    expect(html.match(/checked=""/g)).toHaveLength(4)
    expect(html.match(/disabled=""/g)).toHaveLength(1)
    expect(html).toContain('BASE, included in comparison')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('aria-pressed')
    expect(html).not.toContain('rail-parent--context')
    expect(html.indexOf('Select A1, Branch of A')).toBeLessThan(html.indexOf('Select B, 1 Branch'))
  })
  it('keeps deep legacy candidates comparable and localizes comparison meaning',()=>{
    const html=renderToStaticMarkup(<ExperimentGenealogyRail model={{...model,additionalLegacyCandidates:[variant('deep','A1')]}} mode="compare" compareDraftIds={['deep']} editingState="A" activeFamilyId="A" language="ko" onSelectBase={()=>{}} onSelectVariant={()=>{}} onToggleCompare={()=>{}}/>)
    expect(html).toContain('deep, 부모 A1 비교 대상으로 선택')
    expect(html.match(/type="checkbox"/g)).toHaveLength(6)
    expect(html.match(/checked=""/g)).toHaveLength(1)
  })
  it('keeps all families and children visible even at BASE, with no compare inputs',()=>{
    const html=render('base')
    expect(html).toContain('aria-label="A1, Branch of A"')
    expect(html).toContain('aria-label="B1, Branch of B"')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('rail-parent--context')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
  })
  it('distinguishes the actual child selection from parent context',()=>{
    const html=render('A2')
    expect(html).toContain('rail-parent--context')
    expect(html).toContain('aria-pressed="true" aria-label="A2, Branch of A"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="A, 2 Branches"')
  })
  it('localizes count and parent context',()=>{
    expect(render('A','ko')).toContain('A, Branch 2개')
    expect(render('A','ko')).toContain('A1, 부모 A')
  })
  it('exposes deep legacy selection separately without promoting it to a family',()=>{
    const html=renderToStaticMarkup(<ExperimentGenealogyRail model={{...model,additionalLegacyCandidates:[variant('deep','A1')]}} editingState="deep" activeFamilyId="A" language="en" onSelectBase={()=>{}} onSelectVariant={()=>{}}/>)
    expect(html).toContain('LEGACY STATES')
    expect(html).toContain('aria-pressed="true" aria-label="deep, Branch of A1"')
  })
})
