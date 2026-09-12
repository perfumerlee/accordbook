import type { FormulaDropDownload } from './formulaDropPublicApi'
export const FORMULA_DROP_ACCESS_KEY='accordbook.drop.access'
export function formatFormulaDropAccessDetails(download:FormulaDropDownload){return `Accordbook Formula Access\n\nFile: ${download.fileName}\nName: ${download.accessName}\nLast 4 digits: ${download.accessLast4}\nPIN: ${download.accessPin}`}
export function rememberFormulaDropAccess(download:FormulaDropDownload,dropSlug:string,title?:string){sessionStorage.setItem(FORMULA_DROP_ACCESS_KEY,JSON.stringify({download,dropSlug,title}))}
export function readFormulaDropAccess():{download:FormulaDropDownload;dropSlug:string;title?:string}|undefined{try{const value=JSON.parse(sessionStorage.getItem(FORMULA_DROP_ACCESS_KEY)||'null');return value?.download&&value?.dropSlug?value:undefined}catch{return undefined}}
export function clearFormulaDropAccess(){sessionStorage.removeItem(FORMULA_DROP_ACCESS_KEY)}
