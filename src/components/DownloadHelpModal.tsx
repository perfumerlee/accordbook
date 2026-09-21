import { useEffect, useRef } from 'react'
import type { FormulaDropDownload } from '../services/formulaDropPublicApi'
import { readFormulaDropAccess } from '../services/formulaDropAccess'
import FormulaAccessDetails from './FormulaAccessDetails'
import './downloadHelpModal.css'
import { useFormulaDropLanguage } from './FormulaDropLanguage'

type Props={
  mode:'download-success'|'help'
  title:string
  fileName?:string
  download?:FormulaDropDownload
  dropSlug:string
  onClose:()=>void
}

type Step={title:string;description:string}

export default function DownloadHelpModal({mode,title,fileName,download:providedDownload,dropSlug,onClose}:Props){
  const { language } = useFormulaDropLanguage()
  const ko = language === 'ko'
  const download=providedDownload??readFormulaDropAccess()?.download
  const dialog=useRef<HTMLDivElement>(null)
  const closeRef=useRef<HTMLButtonElement>(null)
  const opener=useRef<Element|null>(document.activeElement)
  const openUrl='/?from=drop&drop='+encodeURIComponent(dropSlug)

  useEffect(()=>{
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    closeRef.current?.focus()
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return}
      if(event.key!=='Tab'||!dialog.current)return
      const items=Array.from(dialog.current.querySelectorAll<HTMLElement>('button,a[href]')).filter(item=>!item.matches(':disabled'))
      if(!items.length)return
      const[first]=items
      const last=items[items.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',onKey,true)
    return()=>{
      document.body.style.overflow=previous
      document.removeEventListener('keydown',onKey,true)
      if(opener.current instanceof HTMLElement)opener.current.focus()
    }
  },[onClose])

  const steps:Step[]=mode==='download-success'
    ?[
      {title:ko?'다운로드 완료 ✓':'Downloaded ✓',description:ko?'포뮬러 파일이 기기에 저장되었습니다.':'The Formula file has been saved to your device.'},
      {title:ko?'포뮬러 가져오기':'Import formula',description:ko?'Accordbook으로 이동해 방금 다운로드한 파일을 선택하세요.':'Continue to Accordbook and select the file you just downloaded.'},
      {title:ko?'잠금 해제':'Unlock',description:ko?'Accordbook에서 요청하면 아래 접근 정보를 입력하세요.':'Use the access details below when Accordbook asks for them.'},
    ]
    :[
      {title:ko?'Accordbook 열기':'Open Accordbook',description:ko?'이 안내에서 Accordbook으로 이동하세요.':'Continue to Accordbook from this guide.'},
      {title:ko?'파일 선택':'Select the file',description:ko?'다운로드 폴더 등에 저장된 .accordbook 파일을 선택하세요.':'Choose the downloaded .accordbook file, usually found in your Downloads folder.'},
      {title:ko?'잠금 해제':'Unlock',description:ko?'포뮬러와 함께 제공된 접근 정보를 입력하세요.':'Enter the access details supplied with the Formula.'},
    ]

  return <div className="download-help-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section ref={dialog} className="download-help-modal" role="dialog" aria-modal="true" aria-labelledby="download-help-title">
      <button ref={closeRef} className="download-help-close" type="button" aria-label={ko?'닫기':'Close'} onClick={onClose}>×</button>
      <p className="formula-drop-kicker">{mode==='download-success'?(ko?'Formula Drop · 다음 단계':'Formula Drop · Next step'):(ko?'열기 안내':'Opening guide')}</p>
      <h2 id="download-help-title">{mode==='download-success'?(ko?'포뮬러 다운로드 완료':'FORMULA DOWNLOADED'):(ko?' .ACCORDBOOK 파일 여는 방법':'HOW TO OPEN AN .ACCORDBOOK FILE')}</h2>
      <h3>{title}</h3>
      {mode==='download-success'&&<p className="download-help-intro">{ko?'파일이 준비되었습니다. 이제 Accordbook으로 가져오세요.':'Your file is ready. Now import it into Accordbook.'}</p>}
      {fileName&&<p className="download-help-file">{ko?'다운로드한 파일':'DOWNLOADED FILE'}<br/><strong>{fileName}</strong></p>}

      <ol className="download-help-steps">
        {steps.map((step,index)=><li key={step.title}>
          <span>{String(index+1).padStart(2,'0')}</span>
          <div><strong>{step.title}</strong><p>{step.description}</p></div>
        </li>)}
      </ol>

      {mode==='download-success'&&download&&<div className="download-help-access">
        <p className="download-help-warning"><strong>{ko?'ACCESS DETAILS 준비 완료':'ACCESS DETAILS READY'}</strong><br/>{ko?'파일을 열 때 필요합니다.':'You’ll need these when the file opens.'}</p>
        <FormulaAccessDetails download={download}/>
      </div>}

      <a className="formula-drop-button download-help-open" href={openUrl}>
        {mode==='download-success'?(ko?'가져오기로 계속 →':'CONTINUE TO IMPORT →'):(ko?'ACCORD­BOOK 열기 →':'OPEN ACCORDBOOK →')}
      </a>
      <button className="download-help-dismiss" type="button" onClick={onClose}>{ko?'닫기':'CLOSE'}</button>
    </section>
  </div>
}
