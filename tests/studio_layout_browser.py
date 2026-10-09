"""Verify prominent image/layer tools, inspector tabs and bounded planet sizes."""
import io,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'work').mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image
expect.set_options(timeout=15000)
checks,errors=[],[]
def passed(text):checks.append(text);print('PASS:',text,flush=True)
fixture=ROOT/'work/planet-size-fixture.png';Image.new('RGB',(600,300),'#ec7348').save(fixture)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt'else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1650,'height':1000},reduced_motion='reduce')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text)if m.type=='error'else None)
    page.goto(URL);page.wait_for_load_state('networkidle');page.get_by_role('button',name='编辑你的星球',exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    left=page.locator('.left-panel');assert page.get_by_role('tab',name='场景图层',exact=True).count()==0
    top=left.bounding_box()['y'];upload=left.locator('.upload-btn').bounding_box();layers=left.locator('.layer-list').bounding_box()
    assert upload['y']<top+170 and layers['y']<top+390,(top,upload,layers)
    assert page.get_by_label('星球名称',exact=True).is_hidden()
    passed('exterior opens with image import and the current layer list prominently at the top')
    buttons=left.locator('.layer-actions').bounding_box()
    assert 0<=buttons['y']-layers['y']-layers['height']<25
    assert page.locator('.right-panel').get_by_role('button',name='删除图层',exact=True).count()==0
    page.get_by_role('button',name='隐藏图层',exact=True).click();expect(page.get_by_role('button',name='显示图层',exact=True)).to_be_visible()
    page.get_by_role('button',name='显示图层',exact=True).click();expect(page.get_by_role('button',name='隐藏图层',exact=True)).to_be_visible()
    passed('hide/show and delete sit immediately beneath the layer list and operate on the selected layer')
    info=page.get_by_role('tab',name='星球信息',exact=True);info.click();expect(page.get_by_label('星球名称',exact=True)).to_be_visible()
    expect(left.locator('.layer-list')).to_be_visible();expect(left.locator('.upload-btn')).to_be_visible()
    info.press('ArrowRight');expect(page.get_by_role('tab',name='装饰',exact=True)).to_be_focused()
    expect(page.get_by_role('button',name='萤火虫',exact=True)).to_be_visible()
    page.get_by_role('tab',name='装饰',exact=True).press('Home');expect(left.locator('.layer-list')).to_be_visible()
    passed('information/decorations share tabs while layers and import stay visible with keyboard navigation')
    assert page.get_by_role('button',name='缩小图片 −',exact=True).count()==0 and page.get_by_role('button',name='放大图片 ＋',exact=True).count()==0
    expect(page.get_by_label('水平缩放',exact=True)).to_be_visible();expect(page.get_by_role('button',name='缩放图片角点',exact=True)).to_be_visible()
    page.get_by_role('tab',name='基础调色',exact=True).click();expect(page.get_by_label('饱和度',exact=True)).to_be_visible();expect(page.get_by_label('角度',exact=True)).to_be_hidden()
    page.get_by_role('tab',name='图层参数',exact=True).click();assert page.get_by_label('角度',exact=True).count()==0;expect(page.get_by_label('饱和度',exact=True)).to_be_hidden()
    passed('redundant zoom buttons are absent and parameter/color tabs retain sliders and canvas handles')
    page.get_by_role('tab',name='装饰',exact=True).click()
    for _ in range(12):page.get_by_role('button',name='萤火虫',exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    assert left.locator('.layer-list').evaluate('el=>el.scrollHeight>el.clientHeight&&el.clientHeight<=230')
    layers=left.locator('.layer-list').bounding_box();buttons=left.locator('.layer-actions').bounding_box()
    assert buttons['y']-layers['y']-layers['height']<25
    page.get_by_role('button',name='删除图层',exact=True).click();expect(left.locator('.layer-row')).to_have_count(12)
    page.get_by_role('button',name='↶ 撤销',exact=True).click();expect(left.locator('.layer-row')).to_have_count(13)
    before=left.locator('.layer-list').bounding_box();left.locator('.studio-side-details').evaluate('el=>el.scrollTop=el.scrollHeight');assert left.locator('.layer-list').bounding_box()==before
    passed('long lists and decoration details scroll independently while layer actions remain visible')
    page.get_by_role('button',name='内部空间',exact=True).click()
    assert page.get_by_role('tab',name='场景图层',exact=True).count()==0
    expect(page.get_by_label('添加原创图层',exact=True)).to_be_attached()
    expect(page.get_by_label('上传内部背景',exact=True)).to_be_attached()
    page.get_by_label('添加原创图层',exact=True).set_input_files(str(fixture));expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible()
    expect(left.locator('.layer-row')).to_have_count(1);page.get_by_role('button',name='删除图层',exact=True).click();expect(left.locator('.layer-row')).to_have_count(0)
    passed('interior uses the same prominent import/list layout and immediately removes its selected image')
    page.get_by_role('button',name='星球外观',exact=True).click();page.get_by_label('上传星球绘画',exact=True).set_input_files(str(fixture))
    expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible();expect(page.locator('.scene-reset')).to_be_enabled()
    page.get_by_role('button',name='保存',exact=True).click();expect(page.get_by_role('status').filter(has_text='草稿已保存')).to_be_visible()
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-studio-tabs-preview.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(left.locator('.upload-btn')).to_be_visible();expect(left.locator('.layer-list')).to_be_visible()
    passed('mobile view retains import, layer actions and tabs without horizontal overflow')
    # Test legacy scales in an isolated workspace, using identical solid images
    # so actual circular diameters can be measured independently of artwork.
    legacy=page.evaluate("""async()=>{const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const get=s=>new Promise(res=>{const r=db.transaction(s).objectStore(s).getAll();r.onsuccess=()=>res(r.result)});const docs=await get('planets'),u=(await get('universes'))[0];const a=docs.find(d=>d.metadata.name==='日落收藏家'),b=structuredClone(a);b.planetId=docs.find(d=>d.planetId!==a.planetId).planetId;b.metadata.name='尺寸上限测试';a.exterior.scene.layers=a.exterior.scene.layers.slice(0,1);b.exterior.scene.layers=b.exterior.scene.layers.slice(0,1);u.entries=[{planetId:a.planetId,visible:true,position:{x:500,y:200},scale:.1,order:0},{planetId:b.planetId,visible:true,position:{x:1450,y:200},scale:2,order:1}];const tx=db.transaction(['planets','universes'],'readwrite');tx.objectStore('planets').put(a,a.planetId);tx.objectStore('planets').put(b,b.planetId);tx.objectStore('universes').put(u,u.universeId);await new Promise(res=>tx.oncomplete=res);db.close();return u.entries}""")
    page.set_viewport_size({'width':1650,'height':1000});page.reload();page.wait_for_load_state('networkidle');expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    canvas=page.locator('canvas');c=json.loads(canvas.get_attribute('data-camera'));img=Image.open(io.BytesIO(canvas.screenshot())).convert('RGB');base=min(img.width/1600,img.height/900);diameters=[]
    for entry,scale in zip(legacy,[.8,1.2]):
        cx=img.width/2+(entry['position']['x']-800)*base*c['zoom']+c['x']*base
        cy=img.height/2+(entry['position']['y']-450)*base*c['zoom']+c['y']*base
        r=256*.9*scale*base*c['zoom'];xs=[x for x in range(round(cx-1.2*r),round(cx+1.2*r))if max(abs(img.getpixel((x,round(cy)))[i]-[236,115,72][i])for i in range(3))<8]
        assert xs;diameter=max(xs)-min(xs)+1;assert abs(diameter-2*r)<4,(diameter,r);diameters.append(diameter)
    assert abs(diameters[1]/diameters[0]-1.5)<.07
    passed('legacy extreme scales render at 0.8 and 1.2 times standard size in actual canvas pixels')
    preserved=page.evaluate("""async()=>{const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const u=await new Promise(res=>{const r=db.transaction('universes').objectStore('universes').getAll();r.onsuccess=()=>res(r.result[0])});db.close();return u.entries.map(e=>e.scale)}""")
    assert preserved==[.1,2];page.screenshot(path=str(ROOT/'outputs/COLORVERSE-planet-size-preview.png'),full_page=True)
    passed('display limits preserve stored legacy scales and planet layout data')
    context.close();browser.close()
assert not errors,errors
(ROOT/'outputs/COLORVERSE-studio-layout-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} Studio layout browser checks passed.')
