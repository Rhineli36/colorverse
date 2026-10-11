"""Default artwork, one-time student entry and panorama; isolated browser data only."""
import json, os, sys, hashlib, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5173/')
checks, errors, backgrounds = [], [], []
def passed(message):
    checks.append(message); print('PASS:', message, flush=True)
def state(page):
    return page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const get=s=>new Promise(ok=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result)});const result={p:await get('planets'),u:(await get('universes'))[0]};db.close();return result;}""")
def loaded(page):
    page.wait_for_load_state('networkidle')
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready', 'true')
def observe(page):
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('response', lambda r: backgrounds.append(r.url) if 'universe-v2-' in r.url and r.url.endswith('.webp') else None)
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = browser.new_context(viewport={'width':1780,'height':1080}, reduced_motion='reduce', accept_downloads=True)
    page = ctx.new_page(); observe(page); page.goto(URL); loaded(page)
    first = state(page)
    assert len(first['p']) == 6
    assert all(next(a for a in p['assetRefs'] if a['assetId'] == p['exterior']['scene']['layers'][0]['source']['assetId'])['variants'][0]['recipeVersion'] == 'demo-v2' for p in first['p'])
    assert page.get_by_role('button', name='＋ 创建我的星球', exact=True).count() == 0
    expect(page.get_by_role('button', name='编辑你的星球', exact=True)).to_be_visible()
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-default-art-overview.png'), full_page=True)
    box = page.locator('canvas').bounding_box(); camera = json.loads(page.locator('canvas').get_attribute('data-camera'))
    entry = first['u']['entries'][0]; base = min(box['width']/1600, box['height']/900)
    radius = 256 * min(1.2,max(.8,entry['scale'])) * .9 * base * camera['zoom']
    px = box['x']+box['width']/2+(entry['position']['x']-800)*base*camera['zoom']+camera['x']*base
    py = box['y']+box['height']/2+(entry['position']['y']-450)*base*camera['zoom']+camera['y']*base
    page.mouse.click(px-radius*.9, py)
    expect(page.locator('.universe-main')).to_have_attribute('data-view-mode', 'focus')
    assert json.loads(page.locator('canvas').get_attribute('data-camera'))['zoom'] == .38
    page.get_by_role('button', name='宇宙全景', exact=True).click()
    passed('six shaded default sprites load with clickable rims; an existing student has only the edit entry')
    for _ in range(12): page.get_by_label('缩小宇宙', exact=True).click()
    assert json.loads(page.locator('canvas').get_attribute('data-camera'))['zoom'] == .04
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-default-art-distant.png'), full_page=True)
    canvas = page.locator('canvas'); box = canvas.bounding_box()
    page.mouse.move(box['x']+box['width']*.7, box['y']+box['height']*.65)
    page.mouse.down(); page.mouse.move(box['x']+box['width']*.95, box['y']+box['height']*.85, steps=8); page.mouse.up()
    assert state(page) == first
    assert len(backgrounds) == 1, backgrounds
    page.get_by_role('button', name='宇宙全景', exact=True).click()
    passed('minimum 4% zoom and panning use one panorama without new textures or data writes')
    page.get_by_role('button', name='日落收藏家', exact=True).click()
    assert json.loads(page.locator('canvas').get_attribute('data-camera'))['zoom'] == .38
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-default-art-focus.png'), full_page=True)
    page.get_by_role('button', name='进入星球内部 ↗', exact=True).click()
    expect(page.get_by_text('欣赏模式 · INSIDE THE PLANET', exact=True)).to_be_visible()
    passed('the gentle 38% focus and explicit viewing-mode navigation remain intact')
    # Simulate an old installed default plus student-authored artwork, in this test context.
    legacy = page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const docs=await new Promise(ok=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>ok(r.result)});const p=docs[0],student=docs[1],fresh=p.assetRefs.find(a=>a.assetId===p.exterior.scene.layers[0].source.assetId),old=p.assetRefs[0];p.assetRefs=p.assetRefs.filter(a=>a.assetId!==fresh.assetId);p.exterior.scene.layers[0].source.assetId=old.assetId;p.exterior.scene.layers[0].transform.x=815;p.exterior.scene.layers[0].adjustments.saturation=.8;p.metadata.name='旧版本自定义名字';p.revision=3;student.metadata.name='学生保留作品';const art=student.assetRefs.find(a=>a.assetId===student.exterior.scene.layers[0].source.assetId);art.rights.license='student-original';const tx=db.transaction(['planets','revisions','assets','settings'],'readwrite');tx.objectStore('planets').put(p,p.planetId);tx.objectStore('planets').put(student,student.planetId);tx.objectStore('revisions').put(p,p.planetId+':3');for(const f of [fresh.original,...fresh.variants])tx.objectStore('assets').delete(f.path);tx.objectStore('settings').delete('demo-body-v2:'+p.planetId);await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close();return {p,student};}""")
    page.reload(); loaded(page); after = state(page)
    migrated = next(p for p in after['p'] if p['planetId'] == legacy['p']['planetId'])
    preserved = next(p for p in after['p'] if p['planetId'] == legacy['student']['planetId'])
    assert migrated['revision'] == 4 and migrated['metadata'] == legacy['p']['metadata']
    assert migrated['exterior']['scene']['layers'][0]['transform'] == legacy['p']['exterior']['scene']['layers'][0]['transform']
    assert migrated['exterior']['scene']['layers'][0]['adjustments'] == legacy['p']['exterior']['scene']['layers'][0]['adjustments']
    assert migrated['archiveEntries'] == legacy['p']['archiveEntries'] and preserved == legacy['student']
    page.reload(); loaded(page); assert state(page) == after
    passed('verified legacy defaults upgrade once; names, fitting, colors, archives and student artwork survive')
    page.get_by_role('button', name='编辑你的星球', exact=True).click()
    page.get_by_label('上传星球绘画', exact=True).set_input_files(str(ROOT/'tests/fixtures/media/sample-2.webp'))
    expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible()
    page.get_by_role('button', name='保存', exact=True).click()
    saved = state(page); page.reload(); loaded(page); assert state(page) == saved
    page.get_by_role('button', name='编辑你的星球', exact=True).click()
    with page.expect_download() as task: page.get_by_role('button', name='导出作品 ZIP ↗', exact=True).click()
    backup = ROOT/'outputs/COLORVERSE-default-art-backup-test.zip'; task.value.save_as(str(backup))
    with zipfile.ZipFile(backup) as z:
        doc = json.loads(z.read('planet.json'))
        for a in doc['assetRefs']:
            for f in [a['original'], *a['variants']]: assert hashlib.sha256(z.read(f['path'])).hexdigest() == f['sha256']
    passed('a real upload survives reload; exports retain valid hashes for both old and new original assets')
    # Simulate a student who has not created a planet yet; demo ownership is not re-assigned on refresh.
    page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const tx=db.transaction('ownership','readwrite');const s=tx.objectStore('ownership');const keys=await new Promise(ok=>{const r=s.getAllKeys();r.onsuccess=()=>ok(r.result)});for(const key of keys){const owner=await new Promise(ok=>{const r=s.get(key);r.onsuccess=()=>ok(r.result)});if(owner==='demo-student-1')s.delete(key)}await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close();}""")
    page.reload(); loaded(page)
    expect(page.get_by_role('button', name='＋ 创建我的星球', exact=True)).to_be_visible()
    assert page.get_by_role('button', name='编辑你的星球', exact=True).count() == 0
    assert page.get_by_role('button', name='定位我的星球 ↗', exact=True).count() == 0
    page.set_viewport_size({'width':390,'height':844})
    expect(page.get_by_role('button', name='＋ 创建我的星球', exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-first-planet-mobile.png'), full_page=True)
    passed('a first-time student sees a single clear creation entry, reachable on mobile')
    page.get_by_role('button', name='＋ 创建我的星球', exact=True).click()
    expect(page.locator('.studio-bar strong')).to_have_text('我的新星球')
    created = state(page); new = next(p for p in created['p'] if p['metadata']['name'] == '我的新星球')
    assert len(created['p']) == 7 and not new['archiveEntries'] and not new['growthEvents'] and not new['interior']['hotspots']
    assert new['exterior']['scene']['layers'][0]['transform']['x'] == 800
    assert new['exterior']['scene']['layers'][0]['adjustments']['saturation'] == 1
    entry = next(e for e in created['u']['entries'] if e['planetId'] == new['planetId'])
    assert entry['scale'] == 1 and 'motion' not in entry and entry.get('layoutRevision',0) == 0
    assert page.get_by_role('button', name='＋ 创建我的星球', exact=True).count() == 0
    expect(page.get_by_role('button', name='编辑你的星球', exact=True)).to_be_visible()
    page.reload(); loaded(page); assert state(page) == created
    page.get_by_role('button', name='编辑你的星球', exact=True).click()
    expect(page.locator('.studio-bar strong')).to_have_text('我的新星球')
    passed('creation opens a pristine owned planet once; later reloads expose editing and no duplicate creation')
    ctx.close(); browser.close()
assert not errors, errors
(ROOT/'outputs/COLORVERSE-default-art-test-report.json').write_text(
    json.dumps({'checks':checks,'errors':errors,'rendering':'headless Chrome / SwiftShader; not target hardware acceptance'},ensure_ascii=False,indent=2),encoding='utf8')
print(f'{len(checks)} default art / entry browser checks passed.')
