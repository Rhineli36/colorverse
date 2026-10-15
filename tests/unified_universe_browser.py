"""Real cloud classroom and static snapshot share the existing full universe renderer."""
import os, sys, json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=60000)
managed=json.loads((ROOT/'work/demo-accounts.json').read_text(encoding='utf-8-sig'))
isolated=json.loads((ROOT/'work/learning-demo-accounts.json').read_text(encoding='utf-8-sig'))
assert managed['marker']=='colorverse-class-demo-2026-10-14'
checks,errors=[],[]
def passed(message):checks.append(message);print('PASS:',message,flush=True)
def position(page,id):
    item=page.locator(f'[data-planet-id="{id}"]')
    x=float(item.get_attribute('data-world-x'));y=float(item.get_attribute('data-world-y'))
    canvas=page.locator('.cloud-observatory canvas');box=canvas.bounding_box()
    camera=json.loads(canvas.get_attribute('data-camera'));scale=min(box['width']/1600,box['height']/900)
    return (box['x']+(box['width']-1600*scale*camera['zoom'])/2+camera['x']*scale+x*scale*camera['zoom'],box['y']+(box['height']-900*scale*camera['zoom'])/2+camera['y']*scale+y*scale*camera['zoom'])
def enter_by_double(page,id):
    page.wait_for_selector('canvas[data-scene-ready="true"]',timeout=60000)
    x,y=position(page,id);page.mouse.dblclick(x,y,delay=90)
    expect(page.get_by_role('region',name='云端大宇宙')).to_have_attribute('data-view-mode','focus')
    expect(page.locator('.cloud-room')).to_have_count(0)
    canvas=page.locator('.cloud-observatory canvas')
    page.wait_for_function("()=>Math.abs(JSON.parse(document.querySelector('.cloud-observatory canvas').dataset.camera).zoom-.38)<.001")
    box=canvas.bounding_box();page.mouse.dblclick(box['x']+box['width']/2,box['y']+box['height']/2,delay=90)
def navigate_from_directory(page,id):
    page.locator('.cloud-observatory .universe-toolbar summary').click()
    page.locator(f'[data-planet-id="{id}"]').click()
    page.get_by_role('button',name='进入星球内部 ↗',exact=True).click()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,
        proxy={'server':os.environ.get('COLORVERSE_TEST_PROXY','http://127.0.0.1:18081')},args=['--disable-http2','--disable-quic','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    def fresh(actor):
        context=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce',has_touch=True)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(e.message))
        page.goto('https://colorverse-dev.2999346.workers.dev/',wait_until='networkidle',timeout=60000)
        page.get_by_role('button',name='登录',exact=True).click();page.get_by_label('课堂邮箱').fill(actor['email']);page.get_by_label('密码',exact=True).fill(actor['password'])
        page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click()
        page.get_by_role('button',name='进入班级管理 →' if actor.get('role')=='teacher' else '进入我的星球 →',exact=True).click()
        try:page.wait_for_selector('.cloud-observatory canvas[data-scene-ready="true"]',timeout=60000)
        except Exception:
            page.screenshot(path=str(ROOT/'outputs/unified-cloud-entry-failure.png'))
            print('PAGE ERRORS:',errors,flush=True)
            raise
        return context,page
    context,page=fresh(managed['students'][0])
    nav=page.get_by_role('navigation',name='主导航')
    for name in ['色彩的奥秘','探索宇宙','星球内部','编辑我的星球']:
        expect(nav.get_by_role('button',name=name,exact=True)).to_be_visible()
    expect(nav.get_by_role('button',name='教师管理',exact=True)).to_have_count(0)
    assert page.locator('.observatory-directory button').count()>=10
    expect(page.locator('.observatory-labels small').filter(has_text=managed['students'][0]['displayName'])).to_be_visible()
    page.screenshot(path=str(ROOT/'outputs/unified-cloud-universe.png'))
    enter_by_double(page,managed['students'][0]['planetId'])
    expect(page.locator('.cloud-room-background')).to_be_visible()
    expect(page.locator('.cloud-growth')).to_have_count(5)
    expect(page.get_by_role('button',name='＋ 上传作品 · 点亮新元素',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='编辑星球外貌与背景',exact=True)).to_have_count(0)
    page.locator('.explorer-viewport').screenshot(path=str(ROOT/'outputs/unified-cloud-interior.png'))
    passed('real student enters the full cloud universe; the first canvas double-click focuses and the next enters the saved private backdrop with five works')
    page.locator('.cloud-growth').first.click();dialog=page.get_by_role('dialog',name='云端作品展示')
    dialog.locator('img[alt="提交的展示作品"],.cloud-image-loading button').first.wait_for(state='visible',timeout=60000)
    if dialog.get_by_role('button',name='重新读取作品图片',exact=True).is_visible():
        dialog.get_by_role('button',name='重新读取作品图片',exact=True).click()
    expect(dialog.get_by_role('img',name='提交的展示作品')).to_be_visible()
    dialog.get_by_role('region',name='教师点评与评分').scroll_into_view_if_needed()
    assert float(dialog.locator('.cloud-review-record p').evaluate('(e)=>getComputedStyle(e).fontSize').replace('px',''))<=14
    page.screenshot(path=str(ROOT/'outputs/unified-cloud-detail.png'))
    dialog.get_by_role('button',name='×',exact=True).click()
    nav.get_by_role('button',name='编辑我的星球',exact=True).click()
    launch=page.get_by_role('region',name='编辑我的星球入口');expect(launch.locator('.cloud-planet-orb')).to_have_count(1)
    expect(page.locator('.cloud-observatory')).to_have_count(0)
    page.screenshot(path=str(ROOT/'outputs/unified-own-edit-entry.png'))
    launch.get_by_role('button',name='双击编辑我的星球',exact=True).dblclick()
    expect(page.get_by_role('region',name='云端星球设置')).to_be_visible()
    page.get_by_role('button',name='完成设置',exact=True).click()
    passed('the editing entrance shows only the signed-in student planet, double-click opens its existing editor, and review text is reduced to 14px')
    nav.get_by_role('button',name='色彩的奥秘',exact=True).click();expect(page.get_by_role('dialog',name='色彩的奥秘')).to_be_visible();page.get_by_role('dialog',name='色彩的奥秘').get_by_role('button',name='关闭色彩的奥秘',exact=True).click()
    nav.get_by_role('button',name='探索宇宙',exact=True).click()
    # Verify a second student's real data through the same universe entrance.
    navigate_from_directory(page,managed['students'][1]['planetId'])
    expect(page.locator('.cloud-growth')).to_have_count(5)
    expect(page.get_by_role('button',name='＋ 上传作品 · 点亮新元素',exact=True)).to_have_count(0)
    page.locator('.cloud-growth').first.click();dialog=page.get_by_role('dialog',name='云端作品展示')
    expect(dialog.get_by_role('region',name='同学互动')).to_be_visible()
    expect(dialog.get_by_label('作品留言',exact=True)).to_be_visible()
    dialog.get_by_role('button',name='×',exact=True).click()
    page.set_viewport_size({'width':390,'height':844});page.locator('.cloud-growth').last.tap();expect(page.get_by_role('dialog',name='云端作品展示')).to_be_visible()
    page.screenshot(path=str(ROOT/'outputs/unified-cloud-mobile.png'));context.close()
    passed('a different saved cloud planet opens its own work and real peer interaction controls; phone-sized touch opens the work')
    teacher_context,tp=fresh(isolated['accounts'][0]);expect(tp.get_by_role('navigation',name='主导航').get_by_role('button',name='教师管理',exact=True)).to_be_visible()
    tp.get_by_role('button',name='教师管理',exact=True).click();expect(tp.get_by_role('table')).to_contain_text('演示学生 1');teacher_context.close()
    passed('teacher management appears for a real teacher account and opens the existing live classroom statistics')
    # Static package retains the shared canvas but never claims real authentication or writes.
    static=browser.new_context(viewport={'width':1600,'height':1050},reduced_motion='reduce');sp=static.new_page();sp.on('pageerror',lambda e:errors.append(e.message))
    sp.goto('http://127.0.0.1:5193/',wait_until='networkidle');sp.wait_for_selector('canvas[data-scene-ready="true"]');sp.screenshot(path=str(ROOT/'outputs/unified-static-universe.png'))
    enter_by_double(sp,'demo-2');expect(sp.locator('.scene-saved-background')).to_have_attribute('src','./competition/case-2-interior.webp')
    sp.locator('.scene-growth').first.click();expect(sp.get_by_role('dialog',name='比赛作品展示')).to_contain_text('只读展示快照');static.close()
    passed('the static showcase uses the same full universe and two-stage double-click route with explicit read-only work details')
    assert not errors,errors;browser.close()
(ROOT/'outputs/unified-universe-acceptance.json').write_text(json.dumps({'status':'passed','checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
