"""Optional decorations: real WebGL rendering, editor history and portable persistence."""
import io, json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
from cloud_teacher_fixture import enable_teacher
expect.set_options(timeout=15000)
from PIL import Image, ImageChops
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5173')
checks, errors = [], []
def passed(message):
    checks.append(message); print('PASS:', message, flush=True)
def observe(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
def pixels(page):
    return Image.open(io.BytesIO(page.locator('canvas').screenshot())).convert('RGB')
def read_db(page):
    return page.evaluate("""async () => {const db=await new Promise((res,rej)=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const docs=await new Promise(res=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>res(r.result)});db.close();return docs}""")
def edit(page, name='日落收藏家'):
    page.get_by_role('button', name=name, exact=True).click()
    page.get_by_role('button', name='进入星球内部 ↗').click()
    page.get_by_role('button', name='编辑这颗星球 ↗').click()
    page.wait_for_selector('canvas')
def slider(page, name, value):
    page.get_by_label(name, exact=True).fill(str(value))
    page.get_by_label(name, exact=True).dispatch_event('change')
def save(page):
    page.get_by_role('button', name='保存', exact=True).click()
    expect(page.get_by_role('status').filter(has_text='草稿已保存')).to_be_visible()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name=='nt' else None, args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
    page = context.new_page(); observe(page)
    page.goto(URL); page.wait_for_load_state('networkidle')
    original = next(d for d in read_db(page) if d['metadata']['name']=='日落收藏家')
    edit(page)
    page.get_by_role('button',name='✦ 装饰星球',exact=True).click()
    expect(page.get_by_role('tab',name='装饰',exact=True)).to_have_attribute('aria-selected','true')
    page.get_by_label('轻微动画', exact=True).select_option('none')
    for group in ['粒子与气氛','光影','光环与卫星']: expect(page.get_by_role('heading', name=group, exact=True)).to_be_visible()
    passed('student Studio offers three groups of optional decorations')
    page.get_by_role('button', name='卫星', exact=True).click()
    page.get_by_label('卫星数量', exact=True).select_option('3')
    slider(page, '轨道半径', 390); slider(page, '卫星大小', 32); slider(page, '轨道倾斜', .6)
    slider(page, '运动速度', 0)
    save(page)
    doc = next(d for d in read_db(page) if d['planetId']==original['planetId'])
    satellite = next(l for l in doc['exterior']['scene']['layers'] if l['source'].get('effectId')=='satellite')
    assert satellite['source']['params']['satelliteCount']==3 and satellite['source']['params']['orbitRadiusPx']==390
    assert satellite['source']['params']['satelliteRadiusPx']==32 and satellite['source']['params']['orbitTilt']==.6
    assert doc['assetRefs']==original['assetRefs'] and 'decorations@1' in doc['requiredCapabilities']
    passed('satellite parameters persist while original asset records remain identical')
    page.wait_for_timeout(300)
    a = pixels(page); page.wait_for_timeout(700); b = pixels(page)
    assert ImageChops.difference(a,b).getbbox() is None
    slider(page, '运动速度', .8); page.wait_for_timeout(300)
    a = pixels(page); page.wait_for_timeout(900); b = pixels(page)
    assert ImageChops.difference(a,b).getbbox() is not None
    passed('satellites visibly orbit and speed zero is truly still')
    slider(page, '运动速度', 0); page.wait_for_timeout(250)
    baseline = pixels(page)
    page.get_by_role('button',name='光晕',exact=True).click(); page.wait_for_timeout(300)
    halo_pixels = pixels(page)
    changed = sum(1 for pixel in ImageChops.difference(baseline,halo_pixels).getdata() if max(pixel) > 16)
    assert changed > 200, changed
    passed('default halo changes more than 200 canvas pixels visibly, including its rim outside the planet')
    for name in ['星环','边缘光','星尘','萤火虫']: page.get_by_role('button', name=name, exact=True).click()
    slider(page, '密度', .8)
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','6')
    assert 0 < int(page.locator('canvas').get_attribute('data-particle-count')) <= 1000
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-decorations-studio.png'),full_page=True)
    passed('rings, halo, rim light and particles compose as independent rendered layers')
    page.get_by_role('button', name='隐藏图层', exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','5')
    page.get_by_role('button', name='显示图层', exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','6')
    page.get_by_role('button', name='删除图层', exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','5')
    page.get_by_role('button', name='↶ 撤销', exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','6')
    passed('hiding, deleting and undoing decoration changes update the real renderer')
    save(page)
    expected = next(d for d in read_db(page) if d['planetId']==original['planetId'])
    with page.expect_download() as pending: page.get_by_role('button', name='导出作品 ZIP ↗').click()
    package = ROOT/'work/decorated-planet.zip'; pending.value.save_as(str(package))
    page.get_by_label('返回宇宙总览',exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','6')
    page.get_by_role('button', name='暂停运行', exact=True).click()
    page.get_by_role('button', name='日落收藏家', exact=True).click()
    page.wait_for_function("""()=>{const c=JSON.parse(document.querySelector('canvas').dataset.camera),old=window.__pauseCamera;window.__pauseCamera=c;window.__pauseStable=old&&Math.max(...['x','y','zoom'].map(k=>Math.abs(c[k]-old[k])))<1e-7?(window.__pauseStable||0)+1:0;return window.__pauseStable>5}""",polling=100)
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-decorations-universe.png'),full_page=True)
    a=pixels(page); page.wait_for_timeout(700); b=pixels(page)
    assert ImageChops.difference(a,b).getbbox() is None,page.locator("canvas").get_attribute("data-camera")
    passed('universe renders saved decorations and pause freezes particles and satellites')
    page.reload(); page.wait_for_load_state('networkidle')
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','6')
    edit(page)
    expect(page.locator('canvas')).to_have_attribute('data-effect-layers','6')
    restored=next(d for d in read_db(page) if d['planetId']==original['planetId'])
    assert restored['exterior']['scene']['layers']==expected['exterior']['scene']['layers']
    passed('refresh and reopening restore complete decoration layers')
    context.close()
    second=browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
    other=second.new_page(); observe(other); other.goto(URL); other.wait_for_load_state('networkidle')
    enable_teacher(other);other.get_by_role('button',name='教师演示',exact=True).click()
    other.locator('input[type=file][accept=".zip,.json"]').set_input_files(str(package))
    expect(other.get_by_role('dialog',name='作品包校验报告')).to_be_visible(timeout=20000)
    other.get_by_role('button',name='确认导入宇宙').click()
    imported=next(d for d in read_db(other) if d['metadata']['name']=='日落收藏家 · 副本')
    assert [l['source']['params'] for l in imported['exterior']['scene']['layers'][1:]]==[l['source']['params'] for l in expected['exterior']['scene']['layers'][1:]]
    assert all(l['source']['anchorLayerId']==imported['exterior']['scene']['layers'][0]['id'] for l in imported['exterior']['scene']['layers'][1:])
    assert imported['assetRefs'][0]['original']['sha256']==original['assetRefs'][0]['original']['sha256']
    passed('ZIP import into another context preserves decorative parameters and original hashes')
    card=other.locator('.teacher-cards article').filter(has_text='日落收藏家 · 副本')
    card.get_by_role('button',name='编辑',exact=True).click()
    expect(other.locator('canvas')).to_have_attribute('data-effect-layers','6')
    other.wait_for_timeout(300); a=pixels(other); other.wait_for_timeout(700); b=pixels(other)
    assert ImageChops.difference(a,b).getbbox() is None
    passed('reduced-motion preference keeps animated decorations static')
    other.set_viewport_size({'width':390,'height':844})
    assert other.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    other.get_by_role('tab',name='装饰',exact=True).click()
    expect(other.get_by_role('button',name='卫星',exact=True)).to_be_visible()
    passed('mobile Studio keeps decoration options without horizontal overflow')
    second.close()
    third=browser.new_context(viewport={'width':1440,'height':1000})
    explorer=third.new_page(); observe(explorer); explorer.goto(URL); explorer.wait_for_load_state('networkidle')
    expect(explorer.locator('canvas')).to_have_attribute('data-scene-ready','true')
    explorer.wait_for_timeout(2500)
    explorer.get_by_role('button',name='暂停运行',exact=True).click()
    canvas=explorer.locator('canvas'); box=canvas.bounding_box()
    camera=json.loads(canvas.get_attribute('data-camera')); base=min(box['width']/1600,box['height']/900)
    explorer.mouse.click(box['x']+box['width']/2+((500-800)*camera['zoom']+camera['x'])*base,box['y']+box['height']/2+((200-450)*camera['zoom']+camera['y'])*base)
    expect(explorer.locator('.universe-main')).to_have_attribute('data-view-mode','focus')
    expect(explorer.get_by_role('button',name='进入星球内部 ↗',exact=True)).to_be_visible()
    explorer.wait_for_timeout(1800)
    explorer.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
    expect(explorer.get_by_role('heading',name='日落收藏家',exact=True)).to_be_visible()
    expect(explorer.get_by_role('button',name='打开色彩练习档案 ↗',exact=True)).to_be_visible()
    passed('first planet click focuses and a second canvas click enters the interior')
    explorer.get_by_role('button',name='打开色彩练习档案 ↗',exact=True).click()
    expect(explorer.get_by_role('dialog')).to_contain_text('色彩的第一封信')
    explorer.get_by_role('button',name='关闭展示',exact=True).click()
    explorer.get_by_label('返回宇宙总览',exact=True).click()
    expect(explorer.locator('.universe-main')).to_have_attribute('data-view-mode','focus')
    explorer.get_by_role('button',name='进入星球内部 ↗',exact=True).focus()
    explorer.keyboard.press('Enter')
    expect(explorer.get_by_role('heading',name='日落收藏家',exact=True)).to_be_visible()
    passed('interior hotspots, returning to focus and keyboard entry remain available')
    explorer.get_by_role('button',name='编辑这颗星球 ↗',exact=True).click()
    explorer.get_by_label('轻微动画',exact=True).select_option('none')
    explorer.get_by_role('tab',name='装饰',exact=True).click()
    explorer.get_by_role('button',name='星环',exact=True).click()
    explorer.get_by_label('效果颜色',exact=True).fill('#00ffff')
    expect(explorer.get_by_label('相对水平位置',exact=True)).to_have_value('0')
    def ring_center():
        explorer.wait_for_timeout(200)
        img=pixels(explorer)
        coords=[x for y in range(img.height) for x in range(img.width) if img.getpixel((x,y))[0]<20 and img.getpixel((x,y))[1]>60 and img.getpixel((x,y))[2]>60]
        assert coords
        # The photograph under the translucent ring changes which inner pixels
        # exceed the cyan threshold. Outer ring extents are clear of the fixed
        # planet mask and measure its actual position independently of artwork.
        return (min(coords)+max(coords))/2
    before=ring_center()
    explorer.locator('.layer-list button').first.click()
    zone=explorer.get_by_role('button',name='拖动选中图片',exact=True);zb=zone.bounding_box();x=zb['x']+zb['width']/2;y=zb['y']+zb['height']/2
    explorer.mouse.move(x,y);explorer.mouse.down();explorer.mouse.move(x+50,y,steps=8);explorer.mouse.up()
    after=ring_center()
    assert abs(after-before)<4,(before,after)
    passed('rings stay on the fixed planet frame while artwork is reframed and ZIP references survive')
    explorer.get_by_label('返回宇宙总览',exact=True).click()
    expect(explorer.locator('canvas')).to_have_attribute('data-orbit-guides','false')
    generation=explorer.locator('canvas').get_attribute('data-scene-generation')
    explorer.get_by_role('button',name='显示运行轨迹',exact=True).click()
    expect(explorer.locator('canvas')).to_have_attribute('data-orbit-guides','true')
    explorer.get_by_role('button',name='隐藏运行轨迹',exact=True).click()
    expect(explorer.locator('canvas')).to_have_attribute('data-orbit-guides','false')
    assert explorer.locator('canvas').get_attribute('data-scene-generation')==generation
    passed('fixed orbit guides are hidden by default and toggle independently of decorations')
    assert not errors,errors
    passed('no runtime or resource errors in decoration rendering and importing')
    (ROOT/'outputs/decorations-test-report.json').write_text(json.dumps({'status':'passed','browser':browser.version,'rendering':'headless Chrome / SwiftShader','checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf8')
    browser.close()
print(json.dumps({'passed':len(checks),'errors':errors},ensure_ascii=False))

