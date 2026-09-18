import { useEffect, useRef } from 'react'
import type { FormulaDropDownload } from '../services/formulaDropPublicApi'
import { readFormulaDropAccess } from '../services/formulaDropAccess'
import FormulaAccessDetails from './FormulaAccessDetails'
import './downloadHelpModal.css'

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
      {title:'Downloaded ✓',description:'The Formula file has been saved to your device.'},
      {title:'Import formula',description:'Continue to Accordbook and select the file you just downloaded.'},
      {title:'Unlock',description:'Use the access details below when Accordbook asks for them.'},
    ]
    :[
      {title:'Open Accordbook',description:'Continue to Accordbook from this guide.'},
      {title:'Select the file',description:'Choose the downloaded .accordbook file, usually found in your Downloads folder.'},
      {title:'Unlock',description:'Enter the access details supplied with the Formula.'},
    ]

  return <div className="download-help-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section ref={dialog} className="download-help-modal" role="dialog" aria-modal="true" aria-labelledby="download-help-title">
      <button ref={closeRef} className="download-help-close" type="button" aria-label="Close" onClick={onClose}>×</button>
      <p className="formula-drop-kicker">{mode==='download-success'?'Formula Drop · Next step':'Opening guide'}</p>
      <h2 id="download-help-title">{mode==='download-success'?'FORMULA DOWNLOADED':'HOW TO OPEN AN .ACCORDBOOK FILE'}</h2>
      <h3>{title}</h3>
      {mode==='download-success'&&<p className="download-help-intro">Your file is ready. Now import it into Accordbook.</p>}
      {fileName&&<p className="download-help-file">DOWNLOADED FILE<br/><strong>{fileName}</strong></p>}

      <ol className="download-help-steps">
        {steps.map((step,index)=><li key={step.title}>
          <span>{String(index+1).padStart(2,'0')}</span>
          <div><strong>{step.title}</strong><p>{step.description}</p></div>
        </li>)}
      </ol>

      {mode==='download-success'&&download&&<div className="download-help-access">
        <p className="download-help-warning"><strong>ACCESS DETAILS READY</strong><br/>You’ll need these when the file opens.</p>
        <FormulaAccessDetails download={download}/>
      </div>}

      <a className="formula-drop-button download-help-open" href={openUrl}>
        {mode==='download-success'?'CONTINUE TO IMPORT →':'OPEN ACCORDBOOK →'}
      </a>
      <button className="download-help-dismiss" type="button" onClick={onClose}>CLOSE</button>
    </section>
  </div>
}
