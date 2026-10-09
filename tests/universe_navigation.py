"""Real WebGL checks for motion, cameras, 24-planet framing and reduced motion."""
import io, json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
from PIL import Image, ImageChops

URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5173')
checks, errors = [], []
def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)
def camera(page):
    return json.loads(page.locator('canvas').get_attribute('data-camera'))
def pixels(canvas):
    return Image.open(io.BytesIO(canvas.screenshot())).convert('RGB')
def observe(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

with sync_playwright() as p:
    channel = os.environ.get('COLORVERSE_BROWSER_CHANNEL', 'chrome' if os.name == 'nt' else '') or None
    browser = p.chromium.launch(headless=True, channel=channel, args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1440, 'height':1000})
    page = context.new_page(); observe(page)
    page.goto(URL); page.wait_for_load_state('networkidle')
    canvas = page.locator('canvas')
    expect(page.get_by_role('button', name='宇宙全景', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.wait_for_timeout(3500)
    initial = camera(page)
    assert initial['zoom'] <= .32
    passed('initial panorama uses a farther camera')
    a = pixels(canvas); page.wait_for_timeout(2500); b = pixels(canvas)
    assert ImageChops.difference(a, b).getbbox() is not None
    page.get_by_role('button', name='暂停运行', exact=True).click()
    page.wait_for_timeout(100)
    a = pixels(canvas); page.wait_for_timeout(1200); b = pixels(canvas)
    assert ImageChops.difference(a, b).getbbox() is None
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-universe-preview.png'), full_page=True)
    passed('planets move independently and pause without jumping')
    box = canvas.bounding_box(); c = camera(page); base = min(box['width']/1600, box['height']/900)
    page.mouse.click(box['x']+box['width']/2+(500-800)*base*c['zoom']+c['x']*base,
                     box['y']+box['height']/2+(200-450)*base*c['zoom']+c['y']*base)
    expect(page.locator('.universe-main')).to_have_attribute('data-view-mode','focus')
    expect(page.locator('.planet-peek h2')).to_have_text('日落收藏家')
    passed('clicking the moving planet on canvas selects its real transform')
    page.get_by_role('button', name='局部探索', exact=True).click()
    page.wait_for_timeout(2500)
    assert abs(camera(page)['zoom'] - .85) < .01
    page.get_by_role('button', name='薄荷来信', exact=True).click()
    page.wait_for_timeout(2500)
    assert abs(camera(page)['zoom'] - .38) < .01
    expect(page.locator('.planet-peek h2')).to_have_text('薄荷来信')
    passed('local view and selected planet focus animate to different scales')
    page.get_by_role('button', name='进入星球内部 ↗').click()
    expect(page.get_by_role('button', name='← 返回宇宙')).to_be_visible()
    page.get_by_role('button', name='← 返回宇宙').click()
    expect(page.get_by_role('button', name='聚焦星球', exact=True)).to_have_attribute('aria-pressed', 'true')
    expect(page.get_by_role('button', name='继续运行', exact=True)).to_be_visible()
    page.get_by_role('button', name='宇宙全景', exact=True).click()
    page.wait_for_timeout(2500)
    assert abs(camera(page)['zoom'] - initial['zoom']) < .01, (initial, camera(page), page.locator('.universe-main').get_attribute('data-view-mode'))
    passed('return from room keeps focus and pause; overview restores full framing')
    before = canvas.element_handle()
    generation = canvas.get_attribute('data-scene-generation')
    box = canvas.bounding_box()
    page.mouse.move(box['x']+700, box['y']+350)
    page.mouse.down(); page.mouse.move(box['x']+760, box['y']+390, steps=8); page.mouse.up()
    page.mouse.wheel(0, 120); page.wait_for_timeout(300)
    expect(page.locator('.universe-main')).to_have_attribute('data-view-mode', 'free')
    assert page.evaluate('(old) => old === document.querySelector("canvas")', before)
    assert canvas.get_attribute('data-scene-generation') == generation
    page.get_by_label('重置宇宙视角').click(); page.wait_for_timeout(2500)
    assert abs(camera(page)['zoom'] - initial['zoom']) < .01
    passed('manual pan and zoom keep the renderer mounted; reset returns to overview')
    # Isolated context: simulate 24 classroom works sharing fixture media.
    layout = json.loads((ROOT / 'tests/fixtures/universe-24-layout.json').read_text(encoding='utf-8'))
    page.evaluate("""async (layout) => {
      const db = await new Promise((resolve, reject) => { const r=indexedDB.open('colorverse-v1'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
      const get = (store) => new Promise(resolve => { const r=db.transaction(store).objectStore(store).getAll(); r.onsuccess=()=>resolve(r.result); });
      const docs=await get('planets'), u=(await get('universes'))[0];
      const planets=Array.from({length:24},(_,i)=> {const doc=structuredClone(docs[i%docs.length]); doc.planetId=crypto.randomUUID(); doc.metadata.name='课堂星球 '+String(i+1).padStart(2,'0'); return doc;});
      u.entries=planets.map((doc,i)=>({planetId:doc.planetId,visible:true,position:layout[i].position,scale:layout[i].scale,order:i}));
      const tx=db.transaction(['planets','universes'],'readwrite');
      tx.objectStore('planets').clear(); planets.forEach(doc=>tx.objectStore('planets').put(doc,doc.planetId)); tx.objectStore('universes').put(u,u.universeId);
      await new Promise((resolve,reject)=> {tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); db.close();
    }""", layout)
    page.reload(); page.wait_for_load_state('networkidle'); page.wait_for_timeout(3500)
    expect(page.locator('.planet-directory button')).to_have_count(24)
    assert camera(page)['zoom'] < initial['zoom']
    # Browser checks actual viewport placement; domain tests cover the full orbit envelope.
    result = page.evaluate("""async () => {
      const db=await new Promise(resolve=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>resolve(r.result);});
      const u=await new Promise(resolve=>{const r=db.transaction('universes').objectStore('universes').getAll();r.onsuccess=()=>resolve(r.result[0]);});db.close();
      const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
      return {entries:u.entries,camera:JSON.parse(canvas.dataset.camera),width:rect.width,height:rect.height};
    }""")
    c=result['camera']; base=min(result['width']/1600,result['height']/900)
    for e in result['entries']:
        x=result['width']/2+(e['position']['x']-800)*base*c['zoom']+c['x']*base
        y=result['height']/2+(e['position']['y']-450)*base*c['zoom']+c['y']*base
        radius=256*e['scale']*.9*base*c['zoom']
        assert radius <= x <= result['width']-radius
        assert 120+radius <= y <= result['height']-135-radius
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-24-planets-preview.png'), full_page=True)
    page.get_by_label('搜索星球').fill('课堂星球 24')
    expect(page.locator('.planet-directory button')).to_have_count(1)
    page.get_by_role('button',name='课堂星球 24',exact=True).click()
    expect(page.locator('.planet-peek h2')).to_have_text('课堂星球 24')
    passed('24 works fit the overview and remain searchable and focusable')
    reduced = browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
    other=reduced.new_page(); observe(other);other.goto(URL);other.wait_for_load_state('networkidle');other.wait_for_timeout(800)
    expect(other.get_by_role('button',name='继续运行',exact=True)).to_be_disabled()
    a=pixels(other.locator('canvas'));other.wait_for_timeout(1000);b=pixels(other.locator('canvas'))
    assert ImageChops.difference(a,b).getbbox() is None
    passed('system reduced-motion preference stops motion and camera transitions')
    other.set_viewport_size({'width':390,'height':844});other.wait_for_timeout(500)
    assert other.evaluate('document.documentElement.scrollWidth <= innerWidth')
    expect(other.get_by_role('button',name='宇宙全景',exact=True)).to_be_visible()
    expect(other.get_by_role('button',name='局部探索',exact=True)).to_be_visible()
    other.screenshot(path=str(ROOT/'outputs/COLORVERSE-mobile-preview.png'),full_page=True)
    passed('mobile camera controls stay visible without horizontal overflow')
    assert not errors, errors
    passed('no browser runtime or resource errors')
    (ROOT/'outputs/COLORVERSE-universe-test-report.json').write_text(json.dumps({'url':URL,'checks':checks,'errors':errors,'browser':browser.version,'rendering':'SwiftShader WebGL'},ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()

