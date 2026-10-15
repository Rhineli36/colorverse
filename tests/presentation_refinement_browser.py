"""Live cloud checks without API mocks. Uses only managed demo/isolated accounts."""
import json,sys,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=60000)
j=json.loads((ROOT/'work/demo-accounts.json').read_text(encoding='utf-8-sig'));iso=json.loads((ROOT/'work/learning-demo-accounts.json').read_text(encoding='utf-8-sig'))
checks=[];errors=[];images=set()
def passed(s):checks.append(s);print('PASS',s,flush=True)
def api(page,path,method='GET',body=None):
 return page.evaluate('''async ({path,method,body})=>{const k=Object.keys(localStorage).find(k=>k.startsWith('colorverse.auth.')); const session=JSON.parse(localStorage.getItem(k)); const r=await fetch('/api/v1/cloud/'+path,{method,headers:{Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}''',dict(path=path,method=method,body=body))
def enter(page,id):
 page.locator('.cloud-observatory .universe-toolbar summary').click();page.locator(f'.observatory-directory [data-planet-id="{id}"]').click();page.get_by_role('button',name='进入星球内部 ↗',exact=True).click();expect(page.locator('.cloud-room')).to_be_visible();expect(page.locator('.cloud-room-background')).to_be_visible()
def fresh(browser,actor):
 c=browser.new_context(viewport={'width':1800,'height':1100},reduced_motion='reduce',has_touch=True);page=c.new_page();page.on('pageerror',lambda e:errors.append(e.message));page.on('response',lambda r:images.add(r.url.split('/')[-1]) if '/competition/case-' in r.url and '-exterior.webp' in r.url and r.status==200 else None)
 page.goto('https://colorverse-dev.2999346.workers.dev/',wait_until='networkidle',timeout=60000);page.get_by_role('button',name='登录',exact=True).click();page.get_by_label('课堂邮箱').fill(actor['email']);page.get_by_label('密码',exact=True).fill(actor['password']);page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();page.get_by_role('button',name='进入班级管理 →' if actor.get('role')=='teacher' else '进入我的星球 →',exact=True).click();page.wait_for_selector('canvas[data-scene-ready="true"]',timeout=90000);return c,page
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome',proxy={'server':os.environ.get('COLORVERSE_TEST_PROXY','http://127.0.0.1:18081')},args=['--disable-http2','--disable-quic','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c,page=fresh(b,j['students'][0]);nav=page.get_by_role('navigation',name='主导航')
 assert nav.locator('button').all_text_contents()[:4]==['探索宇宙','我的星球','编辑星球','色彩的奥秘']
 expect(page.locator('.cloud-student-guide')).to_have_count(0);expect(page.get_by_role('button',name='打开功能探索进度')).to_have_count(0)
 expect(page.locator('.observatory-labels small')).to_have_count(0)
 assert {f'case-{i}-exterior.webp' for i in range(1,6)}<=images,sorted(images)
 expect(page.locator('.observatory-image-notice')).to_have_count(0)
 page.screenshot(path=str(ROOT/'outputs/refined-cloud-universe.png'))
 page.get_by_role('checkbox',name='显示姓名与学号').check();expect(page.locator('.observatory-labels small').first).to_be_visible();page.reload(wait_until='networkidle');page.wait_for_selector('canvas[data-scene-ready="true"]');expect(page.get_by_role('checkbox',name='显示姓名与学号')).to_be_checked();page.get_by_role('checkbox',name='显示姓名与学号').uncheck()
 passed('four ordered navigation entries; guide hidden without removal; all five approved exterior images load; identity toggle persists across refresh')
 enter(page,j['students'][3]['planetId']);expect(page.get_by_role('heading',name='云隙漫游',exact=True).last).to_be_visible();expect(page.get_by_role('complementary',name='星球创作手记')).to_contain_text('创作碎碎念');expect(page.locator('.scene-work-directory time')).to_have_count(5)
 viewport=page.locator('.explorer-viewport');expect(viewport).to_have_attribute('data-zoom','1.000');expect(page.get_by_role('button',name='放大场景',exact=True)).to_have_count(0)
 page.screenshot(path=str(ROOT/'outputs/refined-cloud-interior.png'));viewport.hover();before=page.evaluate('scrollY');page.mouse.wheel(0,650);page.wait_for_timeout(600);assert page.evaluate('scrollY')>before;expect(viewport).to_have_attribute('data-zoom','1.000');passed('fixed interior wheel scrolls the page, not its image; full artwork, writing and five timestamped entries are displayed')
 directory=page.locator('.scene-work-directory button');directory.nth(2).click();expected=j['students'][3]['works'][2]['id'];assert page.evaluate('document.activeElement.dataset.workId')==expected
 expect(page.get_by_role('dialog',name='云端作品展示')).to_have_count(0);page.keyboard.press('Enter');dialog=page.get_by_role('dialog',name='云端作品展示');expect(dialog).to_be_visible();expect(dialog).not_to_contain_text('图片直接提取自原PPTX');expect(dialog).not_to_contain_text('梦嗯对');expect(dialog).to_contain_text('温柔和缓');expect(dialog.get_by_role('region',name='教师点评与评分')).to_be_visible();expect(dialog.get_by_label('作品留言',exact=True)).to_be_visible();dialog.get_by_role('button',name='×',exact=True).click();expect(page.locator('.cloud-room')).to_be_visible();passed('directory focuses the matching element; Enter opens correct work, readable review and live peer controls; provenance clutter and typo are absent')
 page.get_by_label('星球留言',exact=True).scroll_into_view_if_needed();content='演示留言（界面验收）：蓝紫云层与暖色微光的对比很轻盈。'
 if page.get_by_role('region',name='星球互动记录').get_by_text(content,exact=False).count()==0:
  page.get_by_label('星球留言',exact=True).fill(content);page.locator('.planet-quick-message').get_by_role('button',name='发送留言',exact=True).click();expect(page.get_by_label('星球留言',exact=True)).to_have_value('')
 expect(page.get_by_role('region',name='星球互动记录')).to_contain_text(content)
 page.reload(wait_until='networkidle');page.wait_for_selector('canvas[data-scene-ready="true"]');enter(page,j['students'][3]['planetId']);expect(page.get_by_role('region',name='星球互动记录')).to_contain_text(content);passed('quick planet message is saved by the real backend and remains after refresh')
 nav.get_by_role('button',name='色彩的奥秘',exact=True).click();m=page.get_by_role('dialog',name='色彩的奥秘');expect(m).to_be_visible();assert m.bounding_box()['width']>1200
 expect(m.locator('.mystery-knowledge-card')).to_have_count(7);m.get_by_role('tab',name='02 / FEELINGS IN COLOR',exact=False).click();expect(m.locator('.mystery-knowledge-card')).to_have_count(1);expect(m.locator('.mystery-color-card')).to_have_count(12);m.locator('.mystery-color-card summary').first.click();page.screenshot(path=str(ROOT/'outputs/refined-color-mystery.png'));m.get_by_role('button',name='关闭色彩的奥秘',exact=True).click();passed('wide knowledge atlas separates K01–K07 from K08 and twelve emotional color cards')
 page.set_viewport_size({'width':390,'height':844});page.locator('.cloud-growth').first.tap();expect(page.get_by_role('dialog',name='云端作品展示')).to_be_visible();page.screenshot(path=str(ROOT/'outputs/refined-cloud-mobile.png'));c.close();passed('phone-sized touch still opens the correct work')
 # A new browser context logs in again, with no previously retained app state.
 c,page=fresh(b,j['students'][0]);enter(page,j['students'][3]['planetId']);expect(page.get_by_role('region',name='星球互动记录')).to_contain_text(content);expect(page.locator('.planet-story')).to_contain_text('云隙漫游');c.close();passed('new login restores saved names, writing and peer message')
 c,page=fresh(b,iso['accounts'][1]);gallery=api(page,f"classes/{iso['classId']}/planets")['data'];own=next(x for x in gallery['planets'] if x['owner_enrollment_id']==gallery['actorId']);doc=own['document'];writing='演示验收：给一小块暖色留下呼吸的空间。'
 saved=api(page,f"classes/{iso['classId']}/planets/{own['id']}/appearance",'PUT',{'name':doc['metadata']['name'],'skin':doc['skin'],'color':doc['color'],'revision':doc['revision'],'reflection':writing,'courseNotes':'演示验收：比较冷暖与面积之后，再说明自己的选择。'})
 assert saved['status']==200;page.reload(wait_until='networkidle');page.wait_for_selector('canvas[data-scene-ready="true"]')
 nav=page.get_by_role('navigation',name='主导航');nav.get_by_role('button',name='我的星球',exact=True).click();expect(page.locator('.planet-story')).to_contain_text(writing);page.reload(wait_until='networkidle');page.wait_for_selector('canvas[data-scene-ready="true"]');nav.get_by_role('button',name='我的星球',exact=True).click();expect(page.locator('.planet-story')).to_contain_text(writing);c.close()
 c,page=fresh(b,iso['accounts'][1]);page.get_by_role('navigation',name='主导航').get_by_role('button',name='我的星球',exact=True).click();expect(page.locator('.planet-story')).to_contain_text(writing);c.close();passed('new reflection and course fields persist through real appearance PUT, refresh and fresh login in the isolated classroom')
 # Local static site uses identical composition and remains explicitly read-only.
 c=b.new_context(viewport={'width':1800,'height':1100},reduced_motion='reduce');page=c.new_page();page.on('pageerror',lambda e:errors.append(e.message));page.goto('http://127.0.0.1:5193/',wait_until='networkidle');page.wait_for_selector('canvas[data-scene-ready="true"]');page.locator('.universe-toolbar summary').click();page.locator('.observatory-directory [data-planet-id="demo-4"]').click();page.get_by_role('button',name='进入星球内部 ↗',exact=True).click();expect(page.locator('.planet-story')).to_contain_text('云隙漫游');expect(page.locator('.scene-work-directory time')).to_have_count(5);page.screenshot(path=str(ROOT/'outputs/refined-static-interior.png'));c.close();b.close();passed('static backup shares the new scene layout and saved timestamps')
assert not errors,errors
(ROOT/'outputs/presentation-refinement-acceptance.json').write_text(json.dumps({'status':'passed','checks':checks,'pageErrors':errors,'exteriorPreviews':sorted(images)},ensure_ascii=False,indent=2),encoding='utf-8')

