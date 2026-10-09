"""Universe ambience: real pixels, motion preferences and existing navigation."""
import io, json, math, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageChops
expect.set_options(timeout=15000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5173')
checks, errors = [], []
def passed(message):
    checks.append(message); print('PASS:', message, flush=True)
def pixels(page):
    return Image.open(io.BytesIO(page.locator('canvas').screenshot())).convert('RGB')
def observe(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
def planets(page):
    return page.evaluate("""async () => { const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const data=await new Promise(res=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>res(r.result)});db.close();return data }""")
def ready(page):
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name=='nt' else None,
        args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1650,'height':1000})
    page = context.new_page(); observe(page)
    page.goto(URL); page.wait_for_load_state('networkidle'); ready(page)
    original = planets(page)
    expect(page.locator('canvas')).to_have_attribute('data-universe-atmosphere','true')
    passed('universe renders its dedicated ambience without adding editable layers')
    expect(page.locator('canvas')).to_have_attribute('data-wandering-stars','24')
    page.wait_for_timeout(1000); idle_a=pixels(page); page.wait_for_timeout(1000); idle_b=pixels(page)
    assert ImageChops.difference(idle_a,idle_b).getbbox() is not None
    expect(page.locator('canvas')).to_have_attribute('data-active-meteors','0')
    passed('small ambient stars move during the quiet interval without early meteors')
    n=math.sin(51*311.7)*43758.5453; start=90+(n-math.floor(n))*30
    # Check the visible peak, rather than whichever fractional second occurs
    # first during the meteor's faint fade-in.
    page.wait_for_function("Number(document.querySelector('canvas').dataset.activeMeteors)>0 && Number(document.querySelector('canvas').dataset.atmosphereTime)>"+str(start+.65)+" && Number(document.querySelector('canvas').dataset.atmosphereTime)<"+str(start+1),timeout=180000)
    page.get_by_role('button',name='暂停运行',exact=True).click()
    expect(page.get_by_role('button',name='继续运行',exact=True)).to_be_visible()
    page.wait_for_timeout(1500)
    # React applies pause after the click: use the settled renderer timestamp.
    time = page.locator('canvas').get_attribute('data-atmosphere-time')
    image = pixels(page)
    seconds = float(time); cycle = 0
    n = math.sin(cycle * 127.1 + 98 * 311.7) * 43758.5453; seed = n - math.floor(n)
    n = math.sin(cycle * 127.1 + 7 * 311.7) * 43758.5453; sy = n - math.floor(n)
    progress = (seconds - start)/1.65
    n=math.sin(13*311.7)*43758.5453; direction=1 if n-math.floor(n)>.5 else -1
    x = (.24 + seed*.5 + progress*.16*direction)*image.width
    y = (.13 + sy*.43 + progress*.16)*image.height
    head = image.crop((int(x)-4,int(y)-4,int(x)+5,int(y)+5))
    head_pixels=(head.getpixel((px,py)) for px in range(head.width) for py in range(head.height))
    assert any(b>170 and g>150 for r,g,b in head_pixels), (seconds,x,y)
    passed('scheduled meteor head is visible in actual canvas pixels')
    page.wait_for_timeout(650); frozen = pixels(page)
    assert ImageChops.difference(image,frozen).getbbox() is None
    assert page.locator('canvas').get_attribute('data-atmosphere-time') == time
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-atmosphere-preview.png'),full_page=True)
    passed('pause freezes meteors, twinkling stars, black-hole dust and planets together')
    page.get_by_role('button',name='继续运行',exact=True).click()
    page.wait_for_function("document.querySelector('canvas').dataset.activeMeteors==='0' && Number(document.querySelector('canvas').dataset.atmosphereTime)>"+str(seconds+2))
    assert ImageChops.difference(frozen,pixels(page)).getbbox() is not None
    passed('resuming advances scenery and the meteor fades after its short event')
    page.get_by_role('button',name='暂停运行',exact=True).click(); page.wait_for_timeout(1200)
    canvas = page.locator('canvas'); box = canvas.bounding_box()
    generation = canvas.get_attribute('data-scene-generation')
    page.mouse.move(box['x']+box['width']*.82,box['y']+box['height']*.48)
    page.mouse.wheel(0,-350); page.wait_for_timeout(1500)
    camera = json.loads(canvas.get_attribute('data-camera'))
    base = min(box['width']/1600,box['height']/900)
    hx = box['width']/2+(1750-800)*base*camera['zoom']+camera['x']*base
    hy = box['height']/2+(820-450)*base*camera['zoom']+camera['y']*base
    hole = pixels(page)
    assert max(hole.getpixel((round(hx),round(hy))))<25
    assert canvas.get_attribute('data-scene-generation')==generation
    passed('black-hole shadow follows the world camera during zoom without reloading planets')
    page.get_by_role('button',name='日落收藏家',exact=True).click()
    page.get_by_role('button',name='进入星球内部 ↗',exact=True).click(); ready(page)
    expect(page.locator('canvas')).to_have_attribute('data-universe-atmosphere','false')
    page.get_by_label('返回宇宙总览',exact=True).click(); ready(page)
    expect(page.locator('canvas')).to_have_attribute('data-universe-atmosphere','true')
    assert planets(page)==original
    passed('entering a planet hides universe scenery and returning preserves artwork data')
    context.close()
    reduced = browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce')
    other = reduced.new_page(); observe(other); other.goto(URL); other.wait_for_load_state('networkidle'); ready(other)
    expect(other.locator('canvas')).to_have_attribute('data-active-meteors','0')
    a=pixels(other); other.wait_for_timeout(700); b=pixels(other)
    assert ImageChops.difference(a,b).getbbox() is None
    expect(other.locator('canvas')).to_have_attribute('data-atmosphere-time','0.000')
    passed('reduced motion preserves static scenery and disables all ambient animation')
    other.set_viewport_size({'width':390,'height':844}); other.wait_for_timeout(400)
    assert other.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(other.locator('canvas')).to_have_attribute('data-universe-atmosphere','true')
    other.screenshot(path=str(ROOT/'outputs/COLORVERSE-atmosphere-mobile.png'),full_page=True)
    passed('small viewport covers the background without horizontal overflow')
    reduced.close(); browser.close()
assert not errors, errors
(ROOT/'outputs/COLORVERSE-atmosphere-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} ambience browser checks passed.')
