"""Isolated WebGL acceptance for classroom placement edges and larger scenery."""
import json, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174/')
checks, errors = [], []

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

def state(page):
    return page.evaluate("""async () => {
      const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});
      const out={};for(const s of ['planets','universes','revisions','assets','ownership']){
        out[s]=await new Promise(ok=>{const r=db.transaction(s).objectStore(s)[s==='assets'?'getAllKeys':'getAll']();r.onsuccess=()=>ok(r.result)});
      }db.close();return out;
    }""")

def seed(page, position):
    # Test-only fixture in this browser context. Never connect to the user's tab.
    page.evaluate("""async position=>{
      const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});
      const u=await new Promise(ok=>{const r=db.transaction('universes').objectStore('universes').getAll();r.onsuccess=()=>ok(r.result[0])});
      u.schemaVersion='1.1.0';u.layout.version='1.1.0';u.requiredCapabilities=['motion-presets@1'];
      for(const e of u.entries)e.layoutRevision??=0;
      Object.assign(u.entries[0],{position,scale:1,motion:{version:'1.0.0',mode:'stationary',trajectory:'circle',range:'wide',direction:'forward'}});
      const tx=db.transaction('universes','readwrite');tx.objectStore('universes').put(u,u.universeId);
      await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close();
    }""", position)
    page.reload();page.wait_for_load_state('networkidle')
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    page.get_by_role('button', name='定位我的星球 ↗', exact=True).click()
    page.wait_for_timeout(150)

def drag_center(page, dx, dy, cancel=False):
    canvas=page.locator('canvas');box=canvas.bounding_box()
    x,y=box['x']+box['width']/2,box['y']+box['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=10)
    expect(canvas).to_have_attribute('data-deployment-clamped','true')
    if cancel:page.keyboard.press('Escape')
    page.mouse.up()

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,
        args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':2057,'height':1060},reduced_motion='reduce')
    page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(URL);page.wait_for_load_state('networkidle')
    radius=256*.9
    cases=[('right',{'x':20500,'y':450},300,0,'x',20800-radius),
           ('left',{'x':-18900,'y':450},-300,0,'x',-19200+radius),
           ('bottom',{'x':800,'y':11400},0,300,'y',11700-radius),
           ('top',{'x':800,'y':-10500},0,-300,'y',-10800+radius)]
    for name,position,dx,dy,axis,edge in cases:
        seed(page,position);before=state(page)
        drag_center(page,dx,dy)
        expect(page.locator('.notice')).to_contain_text('星球位置已保存')
        after=state(page);e=after['universes'][0]['entries'][0]
        assert abs(e['position'][axis]-edge)<1e-6,(name,e)
        assert e['layoutRevision']==before['universes'][0]['entries'][0]['layoutRevision']+1
        assert after['universes'][0]['entries'][1:]==before['universes'][0]['entries'][1:]
        for s in ['planets','revisions','assets','ownership']:assert after[s]==before[s]
        passed(f'student drag stops at the {name} edge and saves only the bounded layout')
    seed(page,{'x':20500,'y':450});before=state(page)
    drag_center(page,300,0,cancel=True)
    assert state(page)==before
    passed('Escape cancels a boundary drag without saving or changing artwork')
    drag_center(page,300,0)
    expect(page.locator('.notice')).to_contain_text('星球位置已保存')
    page.get_by_role('button',name='定位我的星球 ↗',exact=True).click()
    page.get_by_role('button',name='星球运动设置',exact=True).click()
    controls=page.get_by_role('region',name='星球运动设置',exact=True)
    controls.get_by_role('button',name='快速',exact=True).click()
    controls.get_by_role('button',name='八字漫游',exact=True).click()
    controls.get_by_role('button',name='保存运动设置',exact=True).click()
    expect(page.locator('.notice')).to_contain_text('位置已向星域内调整')
    after=state(page);e=after['universes'][0]['entries'][0]
    assert e['motion']['trajectory']=='figure-eight' and e['motion']['mode']=='fast'
    assert e['position']['x']<20800-radius-80
    assert after['planets']==before['planets']
    page.reload();page.wait_for_load_state('networkidle')
    assert state(page)==after
    passed('widening motion at an edge moves inward to reserve the path and survives reload')
    # Restore a centered test fixture, then use actual navigation controls.
    seed(page,{'x':800,'y':450})
    page.get_by_role('button',name='宇宙全景',exact=True).click()
    page.wait_for_timeout(200)
    before=state(page);canvas=page.locator('canvas')
    generation=canvas.get_attribute('data-scene-generation')
    while json.loads(canvas.get_attribute('data-camera'))['zoom']>.051:
        page.get_by_role('button',name='缩小宇宙',exact=True).click()
    assert state(page)==before
    assert canvas.get_attribute('data-scene-generation')==generation
    expect(page.get_by_text('星球布置在班级星域内，拖拽时显示边界',exact=True)).to_be_visible()
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-classroom-reference-preview.png'),full_page=True)
    passed('reference desktop far view has continuous larger scenery without navigation writes')
    assert not errors,errors
    browser.close()
(ROOT/'outputs/COLORVERSE-classroom-bounds-test-report.json').write_text(
    json.dumps({'checks':checks,'errors':errors,'rendering':'headless Chrome / SwiftShader; not target hardware performance acceptance'},ensure_ascii=False,indent=2),encoding='utf-8')
