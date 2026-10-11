"""Project cloud pixels across zoom/pan to detect a fixed background."""
import io,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageStat
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
checks,errors,backgrounds=[],[],[]
def passed(message): checks.append(message);print('PASS:',message,flush=True)
def snapshot(page):
    c=page.locator('canvas')
    camera=json.loads(c.get_attribute('data-camera'))
    # A locator screenshot also captures overlapping HTML controls. Exclude
    # those screen-fixed panels from world-space cloud pixel comparisons.
    camera['_hud']=page.evaluate("""()=>{const c=document.querySelector('canvas').getBoundingClientRect();return [...document.querySelectorAll('.universe-intro,.universe-identity,.universe-view-controls,.universe-toolbar,.universe-navigation,.universe-bottom,.planet-directory,.planet-peek')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left-c.left-8,right:r.right-c.left+8,top:r.top-c.top-8,bottom:r.bottom-c.top+8};});}""")
    return Image.open(io.BytesIO(c.screenshot())).convert('RGB'),camera
def mean(image,x,y): return ImageStat.Stat(image.crop((round(x)-3,round(y)-3,round(x)+4,round(y)+4))).mean
def compare(before,after):
    a,c0=before;b,c1=after;base=min(a.width/1600,a.height/900)
    projected,stationary=[],[]
    def covered(camera,x,y):
        return any(r['left']<=x<=r['right'] and r['top']<=y<=r['bottom'] for r in camera['_hud'])
    for y in range(30,a.height-30,20):
        for x in range(30,a.width-30,20):
            wx=(x-a.width/2-c0['x']*base)/(base*c0['zoom'])+800
            wy=(y-a.height/2-c0['y']*base)/(base*c0['zoom'])+450
            px=b.width/2+(wx-800)*base*c1['zoom']+c1['x']*base
            py=b.height/2+(wy-450)*base*c1['zoom']+c1['y']*base
            if not(20<px<b.width-20 and 20<py<b.height-20):continue
            if covered(c0,x,y) or covered(c1,px,py) or covered(c1,x,y):continue
            old=mean(a,x,y)
            if sum(old)<25 or max(old)>190:continue
            projected.append(sum(abs(v-w) for v,w in zip(old,mean(b,px,py)))/3)
            stationary.append(sum(abs(v-w) for v,w in zip(old,mean(b,x,y)))/3)
    assert len(projected)>20,len(projected)
    mapped=sum(projected)/len(projected);fixed=sum(stationary)/len(stationary)
    assert mapped<5 and mapped<fixed*.72,(mapped,fixed)
    return {'mapped_error':round(mapped,3),'fixed_error':round(fixed,3),'samples':len(projected)}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1650,'height':1000},reduced_motion='reduce')
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('response',lambda r:backgrounds.append(r.url) if 'universe-v2-' in r.url and r.url.endswith('.webp') else None)
    page.goto(URL);page.wait_for_load_state('networkidle')
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    initial=snapshot(page);box=page.locator('canvas').bounding_box()
    generation=page.locator('canvas').get_attribute('data-scene-generation')
    saved=page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const out={};for(const s of ['planets','universes','revisions','assets','ownership'])out[s]=await new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAllKeys();r.onsuccess=()=>ok(r.result)});for(const s of ['planets','universes'])out[s]=await new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result)});db.close();return out;}""")
    page.mouse.move(box['x']+825,box['y']+460);page.mouse.wheel(0,-230);page.wait_for_timeout(250)
    zoomed=snapshot(page);zoom_pixels=compare(initial,zoomed)
    passed('cloud pixels enlarge with the same world transform as planets')
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-atmosphere-zoom.png'),full_page=True)
    page.mouse.move(box['x']+100,box['y']+650);page.mouse.down()
    page.mouse.move(box['x']+190,box['y']+605,steps=10);page.mouse.up();page.wait_for_timeout(250)
    pan_pixels=compare(zoomed,snapshot(page))
    passed('cloud pixels translate with the camera during empty-space dragging')
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    base=min(box['width']/1600,box['height']/900)
    assert abs(float(page.locator('canvas').get_attribute('data-background-scale'))-base*snapshot(page)[1]['zoom'])<1e-8
    passed('camera navigation keeps the renderer and textures intact')
    # Both views are below even a cover floor for the expanded 16000x9000
    # panorama (~10% here), so a reintroduced cover clamp cannot pass this.
    page.get_by_role('button',name='宇宙全景',exact=True).click()
    camera=snapshot(page)[1]
    page.mouse.move(box['x']+box['width']*.67,box['y']+box['height']*.53)
    import math
    page.mouse.wheel(0,math.log(camera['zoom']/.06)*1000);page.wait_for_timeout(250)
    distant=snapshot(page)
    assert abs(distant[1]['zoom']-.06)<1e-6
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-background-sync-before.png'),full_page=True)
    anchor=(box['width']*.67,box['height']*.53)
    def anchor_world(camera):
        return ((anchor[0]-box['width']/2-camera['x']*base)/(base*camera['zoom'])+800,
                (anchor[1]-box['height']/2-camera['y']*base)/(base*camera['zoom'])+450)
    anchor_before=anchor_world(distant[1])
    page.mouse.wheel(0,-300);page.wait_for_timeout(250)
    distant_zoom=snapshot(page)
    distant_pixels=compare(distant,distant_zoom)
    assert distant_zoom[1]['zoom']<.1
    # A 7x7 patch can change when a tiny bright star grows under the anchor;
    # test its actual world point plus cloud projection, not patch brightness.
    anchor_error=max(abs(a-b) for a,b in zip(anchor_before,anchor_world(distant_zoom[1])))*base*distant_zoom[1]['zoom']
    # Chromium quantizes the fractional input coordinates of this pointer.
    assert anchor_error<.5, {'screen_error':anchor_error,'before':distant[1],'after':distant_zoom[1]}
    passed('below the former cover floor, cloud pixels zoom around an off-center mouse anchor')
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-background-sync-after.png'),full_page=True)
    page.mouse.move(box['x']+70,box['y']+box['height']*.8);page.mouse.down()
    page.mouse.move(box['x']+450,box['y']+box['height']*.8+70,steps=10);page.mouse.up();page.wait_for_timeout(250)
    edge_pixels=compare(distant_zoom,snapshot(page))
    passed('dragging beyond the former background clamp still translates the same cloud pixels')
    page.mouse.move(box['x']+70,box['y']+box['height']*.6)
    page.mouse.wheel(0,3000);page.wait_for_timeout(250)
    assert json.loads(page.locator('canvas').get_attribute('data-camera'))['zoom']==.04
    assert page.locator('canvas').get_attribute('data-universe-atmosphere')=='true'
    assert not errors,errors
    assert len(backgrounds)==1,backgrounds
    current=page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const out={};for(const s of ['planets','universes','revisions','assets','ownership'])out[s]=await new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAllKeys();r.onsuccess=()=>ok(r.result)});for(const s of ['planets','universes'])out[s]=await new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result)});db.close();return out;}""")
    assert current==saved
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-background-sync-distant.png'),full_page=True)
    passed('minimum zoom uses one feathered panorama, without reloads, renderer recreation or saved-data changes')
    browser.close()
(ROOT/'outputs/COLORVERSE-background-camera-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors,'zoom_pixels':zoom_pixels,'pan_pixels':pan_pixels,'distant_pixels':distant_pixels,'edge_pixels':edge_pixels,'mouse_anchor_error_css_px':anchor_error,'background_requests':len(backgrounds),'rendering':'headless Chrome / SwiftShader; not target hardware performance acceptance'},ensure_ascii=False,indent=2),encoding='utf-8')
