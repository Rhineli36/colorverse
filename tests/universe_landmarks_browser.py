"""World-space landmark pixels, navigation, shared motion and saved-data checks."""
import io, json, math, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5173')
checks, errors = [], []
STARS = [(-2100, 400, 400), (11500, -6500, 780), (-12800, 7100, 950), (12800, 7600, 620)]
HOLES = [(1750, 820, 103), (-9600, -5200, 515), (6800, 3800, 370.8)]

def passed(message):
    checks.append(message); print('PASS:', message, flush=True)

def state(page):
    c = page.locator('canvas')
    return json.loads(c.get_attribute('data-camera')), c.bounding_box()

def project(page, x, y):
    camera, box = state(page)
    base = min(box['width'] / 1600, box['height'] / 900)
    return (box['width'] / 2 + (x - 800) * base * camera['zoom'] + camera['x'] * base,
            box['height'] / 2 + (y - 450) * base * camera['zoom'] + camera['y'] * base,
            base * camera['zoom'])

def shot(page):
    return Image.open(io.BytesIO(page.locator('canvas').screenshot())).convert('RGB')

def mean(image, x, y, radius=2):
    return ImageStat.Stat(image.crop((round(x)-radius, round(y)-radius, round(x)+radius+1, round(y)+radius+1))).mean

def documents(page):
    return page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const out={};for(const s of ['planets','universes','revisions','assets','ownership'])out[s]=await new Promise(ok=>{const r=db.transaction(s).objectStore(s)[s==='assets'?'getAllKeys':'getAll']();r.onsuccess=()=>ok(r.result)});db.close();return out;}""")

def open_page(browser, **options):
    page = browser.new_page(**options)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(URL); page.wait_for_load_state('networkidle')
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready', 'true')
    return page

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = open_page(browser, viewport={'width':1650, 'height':1000}, reduced_motion='reduce')
    # Inspect the rendered buttons before actions; tests use a fresh browser store.
    assert '宇宙全景' in page.get_by_role('button').all_text_contents()
    saved = documents(page)
    generation = page.locator('canvas').get_attribute('data-scene-generation')
    image = shot(page); x,y,scale = project(page, *STARS[0][:2])
    assert max(mean(image,x,y)) > 180
    assert max(mean(image,x+STARS[0][2]*scale*.75,y)) > 110
    assert max(mean(image,x+STARS[0][2]*scale*1.25,y)) < 100
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-landmarks-near.png'),full_page=True)
    passed('initial view has a luminous giant with a fixed world-space surface and soft corona')
    box=state(page)[1]
    page.mouse.move(box['x']+x,box['y']+y);page.mouse.down()
    page.mouse.move(box['x']+x+170,box['y']+y+35,steps=10);page.mouse.up();page.wait_for_timeout(250)
    nx,ny,_=project(page,*STARS[0][:2])
    assert abs(nx-x-170)<1 and abs(ny-y-35)<1
    assert max(mean(shot(page),nx,ny))>180
    assert page.locator('.planet-peek').count()==0
    passed('dragging a giant pans the universe without selecting or editing scenery')
    before=project(page,*STARS[0][:2])
    page.mouse.move(box['x']+nx,box['y']+ny);page.mouse.wheel(0,-math.log(1.6)*1000);page.wait_for_timeout(250)
    after=project(page,*STARS[0][:2])
    assert abs(after[0]-before[0])<1 and abs(after[1]-before[1])<1
    assert abs(after[2]/before[2]-1.6)<.001
    zoom_image=shot(page)
    assert max(mean(zoom_image,after[0]+400*after[2]*.75,after[1]))>110
    assert max(mean(zoom_image,after[0]+400*after[2]*1.25,after[1]))<100
    passed('actual surface pixels and corona enlarge around the same mouse anchor as planets')
    page.get_by_role('button',name='宇宙全景',exact=True).click()
    camera,box=state(page)
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.wheel(0,math.log(camera['zoom']/.04)*1000);page.wait_for_timeout(250)
    wide=shot(page)
    for wx,wy,radius in STARS:
        x,y,scale=project(page,wx,wy)
        assert max(mean(wide,x,y))>180, (wx,wy,mean(wide,x,y))
    for wx,wy,radius in HOLES:
        x,y,scale=project(page,wx,wy)
        assert max(mean(wide,x,y,0))<30,(wx,wy,mean(wide,x,y,0))
        # At least one bright accretion-ring pixel around the real dark center.
        rim=[]
        for angle in range(0,360,10):
            a=math.radians(angle)
            rim.extend(mean(wide,x+math.cos(a)*radius*scale*1.08,y+math.sin(a)*radius*scale*1.08,0))
        assert max(rim)>60,(wx,wy,max(rim))
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-landmarks-wide.png'),full_page=True)
    passed('minimum zoom shows four separate giants and three dark centers with bright accretion rings')
    page.wait_for_timeout(1100)
    assert wide.tobytes()==shot(page).tobytes()
    assert page.locator('canvas').get_attribute('data-atmosphere-time')=='0.000'
    assert documents(page)==saved
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    passed('reduced motion freezes scenery; exploring creates no saved layers, assets or revisions')
    page.close()
    moving=open_page(browser,viewport={'width':1650,'height':1000})
    moving.wait_for_timeout(1000)
    t=float(moving.locator('canvas').get_attribute('data-atmosphere-time'))
    assert t>0
    moving.get_by_role('button',name='暂停运行',exact=True).click();moving.wait_for_timeout(250)
    paused=shot(moving);time=moving.locator('canvas').get_attribute('data-atmosphere-time')
    moving.wait_for_timeout(1100)
    assert time==moving.locator('canvas').get_attribute('data-atmosphere-time')
    assert paused.tobytes()==shot(moving).tobytes()
    moving.get_by_role('button',name='继续运行',exact=True).click();moving.wait_for_timeout(700)
    assert float(moving.locator('canvas').get_attribute('data-atmosphere-time'))>float(time)
    assert moving.locator('canvas').get_attribute('data-active-meteors')=='0'
    passed('coronas and black-hole dust share the existing pause/resume clock without frequent meteors')
    moving.close()
    mobile=open_page(browser,viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,reduced_motion='reduce')
    assert mobile.locator('canvas').get_attribute('data-wandering-stars')=='24'
    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert max(mean(shot(mobile),*project(mobile,*STARS[0][:2])[:2],radius=1))>170
    mobile.screenshot(path=str(ROOT/'outputs/COLORVERSE-landmarks-mobile.png'),full_page=True)
    passed('mobile view still displays the giant without horizontal overflow or runtime errors')
    assert not errors,errors
    browser.close()
(ROOT/'outputs/COLORVERSE-landmarks-test-report.json').write_text(json.dumps({
    'checks':checks,'errors':errors,'rendering':'headless Chrome / SwiftShader; not target hardware performance acceptance'
},ensure_ascii=False,indent=2),encoding='utf-8')
