"""Motion controls, atomic layouts, real WebGL following and portable backups."""
import json, os, sys, zipfile, math, io, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageChops, ImageStat
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173/')
checks,errors=[],[]
def passed(text): checks.append(text);print('PASS:',text,flush=True)
def observe(page):
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
def state(page):
    return page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const get=s=>new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result)});const u=(await get('universes'))[0],planets=await get('planets');db.close();return {u,planets};}""")
def controls(page): return page.get_by_role('region',name='星球运动设置',exact=True)
def save(page):
    before=state(page)['u']['entries'][0].get('layoutRevision',0)
    controls(page).get_by_role('button',name='保存运动设置',exact=True).click()
    page.wait_for_function("""async expected=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const u=await new Promise(ok=>{const r=db.transaction('universes').objectStore('universes').getAll();r.onsuccess=()=>ok(r.result[0])});db.close();return u.entries[0].layoutRevision>expected;}""",arg=before)
    expect(controls(page).get_by_role('button',name='保存运动设置',exact=True)).to_be_disabled()
def editor(page):
    page.get_by_role('button',name='编辑你的星球',exact=True).click()
    page.get_by_role('tab',name='运动',exact=True).click()
def focus(page,name='日落收藏家'):
    page.get_by_role('button',name=name,exact=True).click()
    if page.get_by_role('button',name='星球运动设置',exact=True).count():page.get_by_role('button',name='星球运动设置',exact=True).click()
    expect(controls(page)).to_be_visible()
def camera(page): return json.loads(page.locator('canvas').get_attribute('data-camera'))
def settle_camera(page):
    deadline=time.monotonic()+20
    stable=0
    while time.monotonic()<deadline:
        a=camera(page);page.wait_for_timeout(500);b=camera(page)
        delta=math.hypot(b['x']-a['x'],b['y']-a['y'])+abs(b['zoom']-a['zoom'])
        stable=stable+1 if delta<.01 else 0
        if stable>=2:return
    raise AssertionError('camera did not settle while the planet was stationary or viewing was paused')
def close_notice(page):
    if page.get_by_role('button',name='关闭提示',exact=True).count():page.get_by_role('button',name='关闭提示',exact=True).click()
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    page=ctx.new_page();observe(page);page.goto(URL);page.wait_for_load_state('networkidle')
    before=state(page);editor(page)
    expect(controls(page).locator('.motion-path-options button')).to_have_count(4)
    controls(page).get_by_role('button',name='快速',exact=True).click();controls(page).get_by_role('button',name='八字漫游',exact=True).click()
    assert state(page)==before
    controls(page).get_by_role('button',name='取消调整',exact=True).click()
    expect(controls(page).get_by_role('button',name='慢速',exact=True)).to_have_attribute('aria-pressed','true')
    passed('editor offers four bounded trajectory previews; cancel never modifies saved layout')
    controls(page).get_by_role('button',name='静止',exact=True).click();save(page)
    stored=state(page);assert stored['u']['schemaVersion']=='1.1.0';assert stored['u']['entries'][0]['motion']['mode']=='stationary';assert stored['planets']==before['planets']
    assert all('motion' not in e for e in stored['u']['entries'][1:])
    passed('saving stationary upgrades only layout and keeps original artwork and other legacy paths')
    page.reload();page.wait_for_load_state('networkidle');editor(page)
    expect(controls(page).get_by_role('button',name='静止',exact=True)).to_have_attribute('aria-pressed','true')
    passed('refresh restores saved per-planet motion independently from artwork revisions')
    page.get_by_role('button',name='宇宙展览',exact=True).click();focus(page);settle_camera(page)
    a=camera(page);page.wait_for_timeout(1000);assert math.hypot(camera(page)['x']-a['x'],camera(page)['y']-a['y'])<.05
    canvas=page.locator('canvas');generation=canvas.get_attribute('data-scene-generation');handle=canvas.element_handle()
    controls(page).get_by_role('button',name='快速',exact=True).click();controls(page).get_by_role('button',name='八字漫游',exact=True).click();controls(page).get_by_label('星球活动范围').select_option('wide');controls(page).get_by_label('星球运行方向').select_option('reverse')
    # The domain-generated path already applies reverse; SVG must not reverse it twice.
    expect(controls(page).get_by_role('button',name='八字漫游',exact=True).locator('animateMotion')).to_have_attribute('keyPoints','0;1')
    save(page)
    assert canvas.get_attribute('data-scene-generation')==generation
    assert page.evaluate('(old)=>old===document.querySelector("canvas")',handle)
    page.wait_for_timeout(1500);a=camera(page);page.wait_for_timeout(1000);b=camera(page)
    assert math.hypot(a['x']-b['x'],a['y']-b['y'])>0.5
    page.get_by_role('button',name='显示运行轨迹',exact=True).click()
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-motion-universe-preview.png'),full_page=True)
    passed('stationary stays fixed; fast motion follows the real selected planet without rebuilding renderer or textures')
    close_notice(page);page.get_by_role('button',name='暂停运行',exact=True).click();settle_camera(page)
    a=camera(page);paused_time=canvas.get_attribute('data-atmosphere-time');page.wait_for_timeout(700);b=camera(page);assert math.hypot(b['x']-a['x'],b['y']-a['y'])<.2,(a,b,page.locator('.universe-main').get_attribute('data-motion'));assert canvas.get_attribute('data-atmosphere-time')==paused_time
    box=canvas.bounding_box();start=(box['x']+box['width']/2,box['y']+box['height']/2)
    old=state(page);page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+50,start[1]+25,steps=10);page.mouse.up()
    page.wait_for_function("""async n=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const u=await new Promise(ok=>{const r=db.transaction('universes').objectStore('universes').getAll();r.onsuccess=()=>ok(r.result[0])});db.close();return u.entries[0].layoutRevision>n;}""",arg=old['u']['entries'][0]['layoutRevision'])
    after=state(page);assert after['u']['entries'][0]['motion']==old['u']['entries'][0]['motion'];assert after['planets']==old['planets'];assert after['u']['entries'][1:]==old['u']['entries'][1:]
    assert canvas.get_attribute('data-scene-generation')==generation
    passed('global pause changes no saved configuration; dragging keeps motion and resumes from the new anchor')
    focus(page,'薄荷来信');expect(controls(page).get_by_role('button',name='快速',exact=True)).to_be_disabled();assert controls(page).get_by_role('button',name='保存运动设置',exact=True).count()==0
    page.get_by_label('宇宙操作身份').select_option('teacher');expect(controls(page).get_by_role('button',name='快速',exact=True)).to_be_enabled()
    controls(page).get_by_role('button',name='快速',exact=True).click();controls(page).get_by_role('button',name='轻柔往返',exact=True).click();controls(page).get_by_role('button',name='保存运动设置',exact=True).click()
    expect(controls(page).get_by_role('button',name='保存运动设置',exact=True)).to_be_disabled();assert state(page)['u']['entries'][1]['motion']['trajectory']=='drift'
    page.get_by_label('宇宙操作身份').select_option('student');expect(controls(page).get_by_role('button',name='快速',exact=True)).to_be_disabled()
    passed('students see classmates settings read-only; local teacher controls others and losing permission disables editing')
    page.get_by_role('button',name='宇宙全景',exact=True).click();focus(page);close_notice(page)
    other=ctx.new_page();observe(other);other.goto(URL);other.wait_for_load_state('networkidle');editor(other)
    stale=state(other);controls(other).get_by_role('button',name='静止',exact=True).click()
    controls(page).get_by_role('button',name='慢速',exact=True).click();save(page);winner=state(page)
    controls(other).get_by_role('button',name='保存运动设置',exact=True).click()
    expect(other.get_by_role('status').filter(has_text='另一个窗口')).to_be_visible();assert state(other)==winner;assert winner['u']['entries'][0]['layoutRevision']>stale['u']['entries'][0]['layoutRevision']
    other.close();passed('a second window cannot overwrite a newer speed or drag revision and refreshes on conflict')
    frozen=state(page)
    page.evaluate("""()=>{window.motionOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='universes')throw new DOMException('模拟存储空间不足','QuotaExceededError');return window.motionOriginalPut.apply(this,args);};}""")
    controls(page).get_by_role('button',name='快速',exact=True).click();controls(page).get_by_role('button',name='保存运动设置',exact=True).click()
    expect(controls(page).get_by_role('alert')).to_contain_text('模拟存储空间不足');assert state(page)==frozen
    # While globally paused, a failed drag must restore pixels immediately too.
    close_notice(page);settle_camera(page);box=canvas.bounding_box();start=(box['x']+box['width']/2,box['y']+box['height']/2)
    clip={'x':start[0]-40,'y':start[1]-40,'width':80,'height':80};before_pixels=Image.open(io.BytesIO(page.screenshot(clip=clip))).convert('RGB')
    page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+50,start[1]+25,steps=10);page.mouse.up()
    expect(page.get_by_role('status').filter(has_text='模拟存储空间不足')).to_be_visible();page.wait_for_timeout(100)
    assert state(page)==frozen;after_pixels=Image.open(io.BytesIO(page.screenshot(clip=clip))).convert('RGB')
    # Tiny camera-easing/antialias differences are allowed; a displaced planet is not.
    mean_diff=max(ImageStat.Stat(ImageChops.difference(before_pixels,after_pixels)).mean)
    assert mean_diff<.5,mean_diff
    page.evaluate('()=>{IDBObjectStore.prototype.put=window.motionOriginalPut;delete window.motionOriginalPut;}');focus(page);controls(page).get_by_role('button',name='快速',exact=True).click();save(page)
    passed('storage failure preserves saved layout and visual state; an explicit retry succeeds')
    page.get_by_role('button',name='教师演示',exact=True).click()
    with page.expect_download() as task:page.get_by_role('button',name='导出完整宇宙备份 ↗',exact=True).click()
    backup=ROOT/'outputs/COLORVERSE-motion-universe-backup.zip';task.value.save_as(str(backup))
    with zipfile.ZipFile(backup) as z:
        manifest=json.loads(z.read('manifest.json'));u=json.loads(z.read('universe.json'))
        assert manifest['packageVersion']=='1.1.0' and 'motion-presets@1' in manifest['requiredCapabilities'];assert u==state(page)['u']
    page.locator('input[type=file][accept=".zip,.json"]').set_input_files(str(backup));expect(page.get_by_role('dialog',name='作品包校验报告')).to_be_visible(timeout=20000);page.get_by_role('button',name='确认导入宇宙',exact=True).click();expect(page.locator('.teacher-cards article')).to_have_count(12)
    copies=state(page);assert copies['u']['entries'][6]['motion']==u['entries'][0]['motion'];assert copies['u']['entries'][6]['layoutRevision']==0
    passed('whole-universe ZIP declares the new capability, restores motion in copies and resets layout revisions')
    page.get_by_role('button',name='编辑你的星球',exact=True).click()
    with page.expect_download() as task:page.get_by_role('button',name='导出作品 ZIP ↗',exact=True).click()
    solo=ROOT/'outputs/COLORVERSE-motion-standalone-test.zip';task.value.save_as(str(solo))
    with zipfile.ZipFile(solo) as z:
        assert 'universe.json' not in z.namelist();assert 'motion-presets@1' not in json.loads(z.read('manifest.json'))['requiredCapabilities']
    page.get_by_role('button',name='＋ 创建星球',exact=True).click()
    expect(page.locator('.studio-bar strong')).to_have_text('我的新星球')
    latest=state(page);new=latest['u']['entries'][-1];assert new['layoutRevision']==0 and 'motion' not in new
    passed('standalone ZIP carries no universe motion or owner; newly added planets retain the legacy default')
    reduced=browser.new_context(viewport={'width':390,'height':650},reduced_motion='reduce')
    small=reduced.new_page();observe(small);small.goto(URL);small.wait_for_load_state('networkidle');editor(small)
    assert controls(small).locator('animateMotion').count()==0
    controls(small).get_by_role('button',name='快速',exact=True).click();controls(small).get_by_role('button',name='圆形绕行',exact=True).click();save(small)
    assert state(small)['u']['entries'][0]['motion']['mode']=='fast'
    small.get_by_role('button',name='宇宙展览',exact=True).click();focus(small);small.wait_for_timeout(300)
    a=camera(small);small.wait_for_timeout(800);assert camera(small)==a
    assert small.evaluate('document.documentElement.scrollWidth<=innerWidth')
    controls(small).get_by_role('button',name='保存运动设置',exact=True).scroll_into_view_if_needed()
    rect=controls(small).get_by_role('button',name='保存运动设置',exact=True).bounding_box();assert rect['y']>=0 and rect['y']+rect['height']<=650
    small.screenshot(path=str(ROOT/'outputs/COLORVERSE-motion-mobile-preview.png'),full_page=True)
    passed('small screens retain reachable controls; reduced motion pauses viewing without changing saved fast mode')
    # Synthetic 24-planet classroom fixture; real school hardware remains separate.
    large=ctx.new_page();observe(large);large.goto(URL);large.wait_for_load_state('networkidle')
    layout=json.loads((ROOT/'tests/fixtures/universe-24-layout.json').read_text(encoding='utf8'))
    large.evaluate("""async layout=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const get=s=>new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result)});const docs=await get('planets'),u=(await get('universes'))[0];const planets=Array.from({length:24},(_,i)=>{const d=structuredClone(docs[i%docs.length]);d.planetId=crypto.randomUUID();d.metadata.name='混合运动星球 '+(i+1);return d;});u.schemaVersion='1.1.0';u.layout.version='1.1.0';u.requiredCapabilities=['motion-presets@1'];u.entries=planets.map((d,i)=>({planetId:d.planetId,position:layout[i].position,scale:layout[i].scale,order:i,visible:true,layoutRevision:0,motion:{version:'1.0.0',mode:['stationary','slow','fast'][i%3],trajectory:['circle','ellipse','figure-eight','drift'][i%4],range:'wide',direction:i%2?'reverse':'forward'}}));const tx=db.transaction(['planets','universes'],'readwrite');tx.objectStore('planets').clear();planets.forEach(d=>tx.objectStore('planets').put(d,d.planetId));tx.objectStore('universes').put(u,u.universeId);await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close();}""",layout)
    large.reload();large.wait_for_load_state('networkidle');expect(large.locator('.planet-directory button')).to_have_count(24);expect(large.locator('canvas')).to_have_attribute('data-scene-ready','true');assert camera(large)['zoom']<.32
    mixed=state(large);large.wait_for_timeout(1200);assert state(large)==mixed
    large.get_by_role('button',name='混合运动星球 3',exact=True).click();large.wait_for_timeout(3500);a=camera(large);large.wait_for_timeout(1000);b=camera(large);assert math.hypot(a['x']-b['x'],a['y']-b['y'])>.5
    passed('24 mixed preset paths fit the panorama and continue moving without per-frame database writes')
    assert not errors,errors
    (ROOT/'outputs/COLORVERSE-motion-test-report.json').write_text(json.dumps({'status':'passed','checks':checks,'errors':errors,'rendering':'headless Chrome / SwiftShader; not classroom performance acceptance'},ensure_ascii=False,indent=2),encoding='utf8')
    browser.close()
print(json.dumps({'passed':len(checks),'errors':errors},ensure_ascii=False))
