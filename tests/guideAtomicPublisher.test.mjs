import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { expect, it } from 'vitest'

const published = JSON.parse(readFileSync('content/guide/getting-started.json','utf8'))
const png = await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer()
const webp = await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).webp().toBuffer()
const lossless = await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).webp({lossless:true}).toBuffer()
const extended = await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).withMetadata().webp().toBuffer()
const path = 'assets/getting-started/en/desktop/image-test.png'
const wp = 'assets/getting-started/en/mobile/image-test.webp'
function asset(bytes=png, guidePath=path) { return {guidePath,mimeType:guidePath.endsWith('.png')?'image/png':'image/webp',size:bytes.length,width:2,height:2,sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')} }
function setup(refs=[], options={}) {
  const document=structuredClone(published)
  for(const [i,src] of refs.entries()) document.blocks.push({blockId:'test-'+i,type:'screenshot',media:{figureId:'test-'+i,variants:{en:{desktop:{src,alt:'test',caption:'test',viewport:'2x2'}}}}})
  const calls=[], entries=[]
  for(const block of published.blocks) for(const locale of Object.values(block.media?.variants??{})) for(const v of Object.values(locale)) entries.push({path:'content/guide/'+v.src,mode:'100644',type:'blob',sha:'existing'})
  if(options.existing)entries.push({path:'content/guide/'+path,mode:'100644',type:'blob',sha:'existing'})
  let rebased=0,refsRead=0
  const ctx=vm.createContext({Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,v)=>[...createHash('sha256').update(typeof v==='string'?v:Buffer.from(v)).digest()],base64Decode:s=>[...Buffer.from(s,'base64')],newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString()})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},json_:v=>v,GUIDE_FORMAT_:'accordbook-guide-draft',folder_:()=>({})})
  for(const name of ['GuidePublishValidation','GuidePublishAssets','GuidePublisher'])vm.runInContext(readFileSync('scripts/apps-script/guide-drafts/'+name+'.gs','utf8'),ctx)
  ctx.head_=()=>({guideId:document.guideId,revision:7,document,basePublishedFingerprint:options.fingerprint??ctx.publishFingerprint_(published)})
  ctx.savePublishRevision_=()=>{rebased++;if(options.rebase)throw Error('rebase')}
  ctx.publishGithub_=(method,url,body)=>{calls.push({method,url,body});if(options.fail===url&&method!=='get')throw {code:'GITHUB_WRITE_FAILED'};if(url.includes('/git/refs')){if(method==='get')return{object:{sha:options.race&&refsRead++?'other':'parent'}};return{}};if(url.startsWith('/contents/'))return{content:Buffer.from(JSON.stringify(published)).toString('base64')};if(url.startsWith('/git/commits/')&&method==='get')return{tree:{sha:'tree'}};if(url.startsWith('/git/trees/')&&method==='get')return{tree:entries};if(url==='/git/blobs/existing')return{encoding:'base64',size:png.length,content:png.toString('base64')};return{sha:'a'.repeat(40)}}
  return {ctx,calls,run:(assets=[],revision=7)=>ctx.publishGuideServer_({guideId:'getting-started',expectedDraftRevision:revision,stagedAssets:assets}),rebased:()=>rebased}
}
it.each([0,1,2])('publishes JSON with %i new assets in one tree/commit/ref',n=>{const t=setup([path,wp].slice(0,n));expect(t.run([asset(),asset(webp,wp)].slice(0,n)).ok).toBe(true);expect(t.calls.filter(c=>c.url==='/git/trees')[0].body.tree).toHaveLength(n+1);expect(t.calls.filter(c=>c.url==='/git/commits')).toHaveLength(1);expect(t.calls.filter(c=>c.method==='patch')).toHaveLength(1);expect(t.calls.find(c=>c.method==='patch').body.force).toBe(false);expect(t.rebased()).toBe(1)})
it.each(['missing','extra','hash','mime','path','guide','png','webp','dimension','oversize','aggregate','duplicate','conflict','revision','fingerprint'])('rejects %s before any Git mutation',kind=>{let refs=[path],bundle=[asset()],opt={},revision=7;if(kind==='missing')bundle=[];if(kind==='extra')refs=[];if(kind==='hash')bundle[0].sha256='bad';if(kind==='mime')bundle[0].mimeType='image/webp';if(kind==='path')bundle[0].guidePath='../evil.png';if(kind==='guide')bundle[0].guidePath='assets/time-machine/en/desktop/evil.png';if(kind==='png')bundle[0]=asset(Buffer.alloc(40));if(kind==='webp'){refs=[wp];bundle=[asset(Buffer.alloc(40),wp)]}if(kind==='dimension')bundle[0].width=9;if(kind==='oversize')bundle[0].base64='a'.repeat(6990512);if(kind==='aggregate')bundle[0]=asset(Buffer.alloc(5000001));if(kind==='duplicate')bundle.push(asset());if(kind==='conflict'){opt.existing=true;bundle[0]=asset(Buffer.from(png));bundle[0].base64=Buffer.concat([png,Buffer.from([0])]).toString('base64');bundle[0].size++;bundle[0].sha256=createHash('sha256').update(Buffer.from(bundle[0].base64,'base64')).digest('hex')}if(kind==='revision')revision=6;if(kind==='fingerprint')opt.fingerprint='stale';const t=setup(refs,opt);expect(t.run(bundle,revision).ok).toBe(false);expect(t.calls.every(c=>c.method==='get')).toBe(true)})
it('reuses identical existing bytes without an asset blob',()=>{const t=setup([path],{existing:true});expect(t.run([asset()]).ok).toBe(true);expect(t.calls.filter(c=>c.url==='/git/blobs')).toHaveLength(1)})
it.each(['/git/blobs','/git/trees','/git/commits','/git/refs/heads/main'])('does not rebase after %s failure',fail=>{const t=setup([path],{fail});expect(t.run([asset()]).ok).toBe(false);expect(t.rebased()).toBe(0)})
it('ref race never forces or rebases',()=>{const t=setup([path],{race:true});expect(t.run([asset()]).code).toBe('PUBLISH_CONFLICT');expect(t.rebased()).toBe(0);expect(t.calls.some(c=>c.method==='patch')).toBe(false)})
it('rebase failure remains publication success warning',()=>{const t=setup([path],{rebase:true});expect(t.run([asset()])).toMatchObject({code:'PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED',commitSha:'a'.repeat(40)});expect(t.calls.filter(c=>c.method==='patch')).toHaveLength(1)})
it.each([['VP8 ',webp],['VP8L',lossless],['VP8X',extended]])('accepts real WebP %s', (kind,bytes)=>{expect(bytes.toString('ascii',12,16)).toBe(kind);expect(setup([wp]).run([asset(bytes,wp)]).ok).toBe(true)})
it('all supplied files are validated before the JSON blob',()=>{const t=setup([path,wp]);const bad=asset(webp,wp);bad.sha256='wrong';expect(t.run([asset(),bad]).code).toBe('ASSET_HASH_MISMATCH');expect(t.calls.every(c=>c.method==='get')).toBe(true)})
it('asset blob failure does not create a tree or rebase',()=>{const t=setup([path]),original=t.ctx.publishGithub_;t.ctx.publishGithub_=(method,url,body)=>{if(method==='post'&&url==='/git/blobs'&&body.encoding==='base64')throw{code:'GITHUB_WRITE_FAILED'};return original(method,url,body)};expect(t.run([asset()]).ok).toBe(false);expect(t.calls.some(c=>c.method==='post'&&c.url==='/git/trees')).toBe(false);expect(t.rebased()).toBe(0)})
