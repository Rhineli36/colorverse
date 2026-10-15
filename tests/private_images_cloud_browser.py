"""Real demo account and private Storage reads, with a controlled first-load 503 then real retry.
Only the image response is fault-injected; no teaching data is written.
"""
import os,sys,json,asyncio
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.async_api import async_playwright,expect
async def main():
 j=json.loads((ROOT/'work/learning-demo-accounts.json').read_text(encoding='utf-8-sig'));assert j['marker']=='colorverse-learning-demo-2026-10-14';a=j['accounts'][1]
 count=0;errors=[];checks=[]
 async with async_playwright()as p:
  b=await p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,proxy={'server':os.environ.get('COLORVERSE_TEST_PROXY','http://127.0.0.1:7892')},args=['--disable-http2','--disable-quic','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=await b.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(e.message))
  async def image(route):
   nonlocal count;count+=1
   if count==1:
    await asyncio.sleep(2);await route.fulfill(status=503,json={'error':{'message':'Controlled private image first-load failure'}})
   else:await route.continue_()
  await page.route(f"**/classes/{j['classId']}/planets/{a['planetId']}/exterior",image)
  await page.goto('https://colorverse-dev.2999346.workers.dev',wait_until='domcontentloaded',timeout=60000);await page.get_by_role('button',name='登录',exact=True).click();await page.get_by_label('课堂邮箱').fill(a['email']);await page.get_by_label('密码',exact=True).fill(a['password']);await page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();await page.get_by_role('button',name='进入我的星球 →',exact=True).click()
  await expect(page.get_by_text('正在读取外貌',exact=True).first).to_be_visible(timeout=45000);await page.screenshot(path=str(ROOT/'outputs/private-image-first-load.png'))
  await expect(page.get_by_text('外貌读取失败',exact=True).first).to_be_visible(timeout=45000);assert count==1,count;checks.append('concurrent planet views share one authenticated image read and show first-load progress followed by an explicit failure')
  await page.get_by_role('button',name='重新读取星球图片',exact=True).click();await page.wait_for_function("() => [...document.querySelectorAll('.cloud-planet-orb')].filter(i=>i.src.startsWith('blob:')&&i.complete&&i.naturalWidth>0).length>=4",timeout=60000);assert count==2,count;await expect(page.get_by_text('外貌读取失败',exact=True)).to_have_count(0);await page.screenshot(path=str(ROOT/'outputs/private-image-retry.png'));checks.append('one explicit retry reloads the real private image, decodes it before display and updates all mounted views')
  assert not errors,errors;await b.close()
 (ROOT/'outputs/private-images-cloud-acceptance.json').write_text(json.dumps({'status':'passed','mode':'real Auth/Storage with controlled first response failure','checks':checks,'readsForTargetImage':count,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
 for c in checks:print('PASS:',c,flush=True)
asyncio.run(main())
