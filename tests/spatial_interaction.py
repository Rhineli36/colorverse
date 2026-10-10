"""Browser acceptance for deep-space navigation and owner/teacher layout dragging."""
import json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
checks, errors=[],[]
def passed(text): checks.append(text); print('PASS:',text,flush=True)
def state(page):
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    return page.evaluate("""async () => {
      const db=await new Promise(resolve=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>resolve(r.result);});
      const get=s=>new Promise(resolve=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>resolve(r.result);});
      const universe=(await get('universes'))[0], planets=await get('planets');db.close();
      const canvas=document.querySelector('canvas'), r=canvas.getBoundingClientRect();
      return {universe,planets,camera:JSON.parse(canvas.dataset.camera),rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
    }""")
def point(snapshot,entry):
    r=snapshot['rect'];c=snapshot['camera'];base=min(r['width']/1600,r['height']/900)
    return (r['x']+r['width']/2+(entry['position']['x']-800)*base*c['zoom']+c['x']*base,
            r['y']+r['height']/2+(entry['position']['y']-450)*base*c['zoom']+c['y']*base)
def drag(page,start,delta):
    page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+delta[0],start[1]+delta[1],steps=10);page.mouse.up()
def close_notice(page):
    close=page.get_by_role('button',name='关闭提示',exact=True)
    if close.count(): close.click()

with sync_playwright() as p:
    channel=os.environ.get('COLORVERSE_BROWSER_CHANNEL','chrome' if os.name=='nt' else '') or None
    browser=p.chromium.launch(headless=True,channel=channel,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1650,'height':1000})
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error'else None)
    page.goto(URL);page.wait_for_load_state('networkidle');page.wait_for_timeout(800)
    expect(page.get_by_label('宇宙操作身份')).to_have_value('student')
    assert state(page)['camera']['zoom'] < .25
    expect(page.locator('.cosmic-backdrop')).to_be_visible()
    page.get_by_role('button',name='暂停运行',exact=True).click();page.wait_for_timeout(100)
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-space-preview.png'),full_page=True)
    passed('entry opens a broad full-screen space with scattered planets')
    before=state(page);own=before['universe']['entries'][0]
    delta=(100,60);drag(page,point(before,own),delta)
    expect(page.get_by_role('status')).to_contain_text('星球位置已保存')
    after=state(page);moved=after['universe']['entries'][0]
    base=min(before['rect']['width']/1600,before['rect']['height']/900)
    assert abs(moved['position']['x']-own['position']['x']-delta[0]/base/before['camera']['zoom']) < 2
    assert abs(moved['position']['y']-own['position']['y']-delta[1]/base/before['camera']['zoom']) < 2
    assert after['planets']==before['planets']
    assert after['universe']['entries'][1:]==[dict(e,layoutRevision=0) for e in before['universe']['entries'][1:]]
    assert moved['layoutRevision']==1 and after['universe']['schemaVersion']=='1.1.0'
    close_notice(page)
    passed('student drag saves only their own layout anchor, preserving artwork and other planets')
    foreign=after['universe']['entries'][1]
    drag(page,point(after,foreign),(70,-40))
    expect(page.get_by_role('status')).to_contain_text('只能拖拽自己的星球')
    assert state(page)['universe']==after['universe']
    close_notice(page)
    passed('student cannot drag a classmate planet')
    page.get_by_label('宇宙操作身份').select_option('teacher');page.wait_for_timeout(100)
    before=state(page);foreign=before['universe']['entries'][1]
    drag(page,point(before,foreign),(70,60))
    expect(page.get_by_role('status')).to_contain_text('星球位置已保存')
    teacher_layout=state(page)['universe']
    assert teacher_layout['entries'][1]['position']!=foreign['position']
    assert teacher_layout['entries'][0]==before['universe']['entries'][0]
    close_notice(page)
    passed('teacher can drag another student planet without disturbing existing moves')
    page.reload();page.wait_for_load_state('networkidle');page.wait_for_timeout(500)
    assert state(page)['universe']==teacher_layout
    page.get_by_role('button',name='暂停运行',exact=True).click();page.wait_for_timeout(100)
    passed('saved classroom arrangement survives reload')
    before=state(page);r=before['rect'];center=(r['x']+r['width']*.48,r['y']+r['height']*.65)
    generation=page.locator('canvas').get_attribute('data-scene-generation')
    drag(page,center,(90,40));page.wait_for_timeout(100)
    after=state(page)
    assert after['camera']['x']!=before['camera']['x']
    assert after['universe']==before['universe']
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    passed('empty-space drag pans the camera without changing layout or reloading nodes')
    before=state(page);r=before['rect'];c=before['camera'];mouse=(r['x']+r['width']*.64,r['y']+r['height']*.55)
    base=min(r['width']/1600,r['height']/900)
    wx=800+(mouse[0]-r['x']-r['width']/2-c['x']*base)/base/c['zoom']
    wy=450+(mouse[1]-r['y']-r['height']/2-c['y']*base)/base/c['zoom']
    page.mouse.move(*mouse);page.mouse.wheel(0,-180);page.wait_for_timeout(150)
    after=state(page);n=after['camera']
    assert abs(r['x']+r['width']/2+(wx-800)*base*n['zoom']+n['x']*base-mouse[0]) < 1
    assert abs(r['y']+r['height']/2+(wy-450)*base*n['zoom']+n['y']*base-mouse[1]) < 1
    passed('wheel zoom keeps the world point under the cursor fixed')
    page.mouse.dblclick(r['x']+r['width']*.6,r['y']+r['height']*.7)
    page.wait_for_timeout(1800)
    assert state(page)['camera']['zoom']>n['zoom']*1.8
    passed('double-clicking an arbitrary empty point focuses that part of space')
    page.get_by_role('button',name='宇宙全景',exact=True).click();page.wait_for_timeout(1800)
    before=state(page);r=before['rect']
    page.get_by_role('button',name='框选区域',exact=True).click()
    drag(page,(r['x']+r['width']*.4,r['y']+r['height']*.38),(300,210))
    page.wait_for_timeout(1800)
    expect(page.get_by_role('button',name='框选区域',exact=True)).to_have_attribute('aria-pressed','false')
    assert state(page)['camera']['zoom']>before['camera']['zoom']
    assert state(page)['universe']==before['universe']
    passed('rectangle selection focuses a region without moving enclosed planets')
    page.get_by_role('button',name='框选区域',exact=True).click();page.keyboard.press('Escape')
    expect(page.get_by_role('button',name='框选区域',exact=True)).to_have_attribute('aria-pressed','false')
    passed('Escape cancels the region selection tool')
    page.get_by_role('button',name='宇宙全景',exact=True).click();page.wait_for_timeout(1500)
    page.get_by_role('button',name='定位我的星球 ↗',exact=True).click();page.wait_for_timeout(1500)
    expect(page.locator('.planet-peek h2')).to_have_text('日落收藏家')
    before=state(page);own=before['universe']['entries'][0];start=point(before,own)
    page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+80,start[1]+20,steps=5)
    page.keyboard.press('Escape');page.mouse.up();page.wait_for_timeout(100)
    assert state(page)['universe']==before['universe']
    passed('locating my planet works and cancelling a drag does not save a move')
    page.get_by_role('button',name='薄荷来信',exact=True).click();page.wait_for_timeout(1600)
    page.get_by_label('宇宙操作身份').select_option('teacher');page.wait_for_timeout(100)
    before=state(page);start=point(before,before['universe']['entries'][1]);page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+60,start[1]+20,steps=5)
    page.get_by_label('宇宙操作身份').select_option('student');page.mouse.up();page.wait_for_timeout(300)
    assert state(page)['universe']==before['universe']
    passed('revoking teacher movement permission during a drag cancels the move')
    page.get_by_role('button',name='日落收藏家',exact=True).click();page.wait_for_timeout(1600)
    stale=state(page)
    other=context.new_page();other.goto(URL);other.wait_for_load_state('networkidle');other.wait_for_timeout(500)
    other.get_by_role('button',name='暂停运行',exact=True).click();other.wait_for_timeout(100)
    current=state(other);drag(other,point(current,current['universe']['entries'][0]),(45,30))
    expect(other.get_by_role('status')).to_contain_text('星球位置已保存')
    latest=state(other)['universe']
    drag(page,point(stale,stale['universe']['entries'][0]),(60,30))
    expect(page.get_by_role('status')).to_contain_text('另一个窗口已修改')
    assert state(page)['universe']==latest
    close_notice(page);other.close()
    page.reload();page.wait_for_load_state('networkidle');page.wait_for_timeout(500)
    assert state(page)['universe']==latest
    passed('stale drag in a second window is rejected and preserves the newer arrangement')
    page.get_by_role('button',name='宇宙全景',exact=True).click();page.wait_for_timeout(1200)
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    expect(page.get_by_label('宇宙操作身份')).to_be_visible()
    expect(page.get_by_label('放大宇宙')).to_be_visible()
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-mobile-space-preview.png'),full_page=True)
    passed('mobile users can switch local identity and zoom without page overflow')
    assert not errors,errors
    passed('no runtime or resource errors')
    (ROOT/'outputs/COLORVERSE-spatial-test-report.json').write_text(json.dumps({'url':URL,'checks':checks,'errors':errors,'browser':browser.version,'rendering':'SwiftShader WebGL'},ensure_ascii=False,indent=2),encoding='utf-8')
    browser.close()
