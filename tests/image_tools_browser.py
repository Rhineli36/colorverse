"""Image editing and scene UX: masks, crop, live handles, deletion and recovery."""
import io,json,os,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
(ROOT/'work').mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from cloud_teacher_fixture import enable_teacher
from PIL import Image,ImageChops,ImageDraw
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
checks,errors=[],[]
def passed(message):checks.append(message);print('PASS:',message,flush=True)
def read(page):
    return page.evaluate("""async()=>{const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const docs=await new Promise(res=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>res(r.result)});db.close();return docs.find(d=>d.metadata.name==='日落收藏家')}""")
def save(page):
    expect(page.locator('.scene-reset')).to_be_enabled()
    page.get_by_role('button',name='保存',exact=True).click()
    expect(page.get_by_role('status').filter(has_text='草稿已保存')).to_be_visible()
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    return read(page)
def pixels(page):return Image.open(io.BytesIO(page.locator('canvas').screenshot())).convert('RGB')
def drag(page,locator,delta):
    b=locator.bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+delta[0],y+delta[1],steps=8);page.mouse.up()
def setnum(page,label,value):page.get_by_label(label,exact=True).fill(str(value))
def upload(page,label,fixture):
    close=page.get_by_role('button',name='关闭提示',exact=True)
    if close.count():close.click()
    page.get_by_label(label,exact=True).set_input_files(str(fixture))
    expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible()
fixture=ROOT/'work/image-tools-fixture.png';image=Image.new('RGB',(800,400),'#ec7348');d=ImageDraw.Draw(image)
d.rectangle((400,0,799,399),fill='#36aec6');image.save(fixture)
original_hash=hashlib.sha256(fixture.read_bytes()).hexdigest()
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1650,'height':1000},accept_downloads=True)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text)if m.type=='error'else None)
    page.goto(URL);page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='日落收藏家',exact=True).click();page.get_by_role('button',name='进入星球内部 ↗').click();page.get_by_role('button',name='编辑这颗星球 ↗').click()
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true');initial=read(page)
    assert page.get_by_label('上传内部背景').count()==0 and page.get_by_label('纯色背景',exact=True).count()==0
    assert page.locator('.right-panel').get_by_label('主色',exact=True).count()==1
    assert page.locator('.left-panel').get_by_label('星球名称',exact=True).count()==1
    passed('exterior upload is separate from interior background and colors sit with image controls')
    upload(page,'上传星球绘画',fixture);doc=save(page)
    body=doc['exterior']['scene']['layers'][0];asset=next(a for a in doc['assetRefs']if a['assetId']==body['source']['assetId'])
    assert asset['original']['sha256']==original_hash
    a=pixels(page);cx=a.width/2;cy=a.height/2;base=min(a.width/1600,a.height/900);radius=200*base
    assert max(a.getpixel((round(cx+.8*radius),round(cy+.8*radius))))<45
    assert max(a.getpixel((round(cx),round(cy))))>100
    expect(page.locator('canvas')).to_have_attribute('data-planet-mask','true')
    passed('wide photo fills a circular planet without rectangle corners or changing original bytes')
    assert page.get_by_role('button',name='放大图片 ＋',exact=True).count()==0
    old=body['transform'];page.get_by_label('水平缩放',exact=True).fill(str(round(old['scaleX']*1.15,2)));doc=save(page)
    assert doc['exterior']['scene']['layers'][0]['transform']['scaleX']>old['scaleX']
    page.get_by_label('锁定图片比例',exact=True).uncheck();page.get_by_label('水平缩放',exact=True).fill('0.8');doc=save(page)
    assert doc['exterior']['scene']['layers'][0]['transform']['scaleX']==.8 and doc['exterior']['scene']['layers'][0]['transform']['scaleY']!=.8
    passed('scaling slider and independent width stretching update saved image parameters')
    page.get_by_role('button',name='裁剪图片',exact=True).click()
    setnum(page,'裁剪左边距 (%)',50);setnum(page,'裁剪宽度 (%)',50);setnum(page,'裁剪上边距 (%)',0);setnum(page,'裁剪高度 (%)',100)
    before=read(page)['exterior']['scene']['layers'][0]['source'];assert 'crop'not in before
    page.get_by_role('button',name='应用裁剪',exact=True).click();cropped=save(page)
    assert cropped['exterior']['scene']['layers'][0]['source']['crop']=={'x':.5,'y':0,'width':.5,'height':1}
    assert cropped['assetRefs']==doc['assetRefs'] and 'image-crop@1'in cropped['requiredCapabilities']
    assert ImageChops.difference(a,pixels(page)).getbbox()is not None
    passed('crop applies as a reversible parameter while all original asset records stay identical')
    page.get_by_role('button',name='↶ 撤销',exact=True).click();undone=save(page)
    assert 'crop'not in undone['exterior']['scene']['layers'][0]['source']
    page.get_by_role('button',name='↷ 重做',exact=True).click();save(page)
    passed('undo and redo restore the exact optional crop state')
    generation=page.locator('canvas').get_attribute('data-scene-generation')
    old=read(page)['exterior']['scene']['layers'][0]['transform'];zone=page.get_by_role('button',name='拖动选中图片',exact=True);b=zone.bounding_box()
    page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2);page.mouse.down();page.mouse.move(b['x']+b['width']/2+35,b['y']+b['height']/2+18,steps=8)
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    page.mouse.up();moved=save(page)['exterior']['scene']['layers'][0]['transform'];assert moved['x']>old['x']and moved['y']>old['y']
    page.get_by_role('button',name='↶ 撤销',exact=True).click();assert save(page)['exterior']['scene']['layers'][0]['transform']==old
    passed('canvas dragging previews without reloading and commits one undoable move')
    drag(page,page.get_by_role('button',name='缩放图片角点',exact=True),(20,15));resized=save(page)
    assert resized['exterior']['scene']['layers'][0]['transform']['scaleX']>old['scaleX']
    passed('canvas corner handle resizes the selected image')
    page.get_by_role('button',name='裁剪图片',exact=True).click();setnum(page,'裁剪宽度 (%)',20);page.get_by_role('button',name='取消裁剪',exact=True).click()
    assert save(page)['exterior']['scene']['layers'][0]['source']==resized['exterior']['scene']['layers'][0]['source']
    passed('cancelling a crop does not save a draft crop')
    with page.expect_download()as pending:page.get_by_role('button',name='导出作品 ZIP ↗',exact=True).click()
    package=ROOT/'work/cropped-planet.zip';pending.value.save_as(str(package))
    page.get_by_role('button',name='宇宙展览',exact=True).click()
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    page.get_by_role('button',name='暂停运行',exact=True).click();page.get_by_role('button',name='日落收藏家',exact=True).click()
    page.wait_for_function('Math.abs(JSON.parse(document.querySelector("canvas").dataset.camera).zoom-.38)<.005')
    c=json.loads(page.locator('canvas').get_attribute('data-camera'))
    entry=page.evaluate("""async(id)=>{const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const u=await new Promise(res=>{const r=db.transaction('universes').objectStore('universes').getAll();r.onsuccess=()=>res(r.result[0])});db.close();return u.entries.find(e=>e.planetId===id)}""",resized['planetId'])
    view=pixels(page);base=min(view.width/1600,view.height/900);r=256*.9*entry['scale']*base*c['zoom']
    center=view.getpixel((round(view.width/2),round(view.height/2)));corner=view.getpixel((round(view.width/2+.8*r),round(view.height/2+.8*r)))
    assert max(abs(center[i]-[54,174,198][i])for i in range(3))<10,center
    assert max(abs(corner[i]-[54,174,198][i])for i in range(3))>40,corner
    passed('universe uses the same circular mask and cropped photo without rectangular corners')
    page.get_by_role('button',name='编辑你的星球',exact=True).click();expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    page.get_by_label('外观图片用途',exact=True).select_option('layer');upload(page,'添加原创图层',fixture);added=save(page)
    assert len(added['exterior']['scene']['layers'])==2
    page.get_by_role('button',name='删除图层 2',exact=True).click();deleted=save(page);assert len(deleted['exterior']['scene']['layers'])==1
    page.get_by_role('button',name='↶ 撤销',exact=True).click();assert len(save(page)['exterior']['scene']['layers'])==2
    passed('layer-row delete removes an added image and undo restores it')
    page.get_by_role('tab',name='装饰',exact=True).click();page.get_by_role('button',name='萤火虫',exact=True).click();effects=save(page)
    page.get_by_role('button',name='删除图层 3',exact=True).click();assert len(save(page)['exterior']['scene']['layers'])==2
    passed('layer-row delete also removes an optional decoration immediately')
    page.get_by_role('button',name='复位星球外观',exact=True).click();reset=save(page)
    assert reset['exterior']['scene']==initial['exterior']['scene'] and reset['interior']==effects['interior']
    assert any(a['original']['sha256']==original_hash for a in reset['assetRefs'])
    page.get_by_role('button',name='↶ 撤销',exact=True).click();recovered=save(page)
    assert recovered['exterior']['scene']!=initial['exterior']['scene']
    passed('exterior reset restores the original scene from stored history and can be undone')
    page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name='编辑你的星球',exact=True).click()
    expect(page.get_by_role('button',name='裁剪图片',exact=True)).to_be_visible();assert read(page)['exterior']['scene']==recovered['exterior']['scene']
    passed('image transforms, crops and additional layers survive refresh')
    page.get_by_role('button',name='内部空间',exact=True).click()
    expect(page.get_by_label('上传内部背景')).to_be_attached()
    assert page.get_by_label('上传星球绘画').count()==0
    upload(page,'添加原创图层',fixture);inside=save(page)
    expect(page.locator('canvas')).to_have_attribute('data-planet-mask','false')
    assert inside['exterior']['scene']==recovered['exterior']['scene'] and len(inside['interior']['layers'])==1
    passed('interior upload stays rectangular and does not change the exterior scene')
    page.get_by_label('纯色背景',exact=True).fill('#445566');page.get_by_role('button',name='使用主题色渐变',exact=True).click();save(page)
    assert page.locator('.right-panel').get_by_label('辅助色',exact=True).count()==1
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-interior-editor-preview.png'),full_page=True)
    page.get_by_role('button',name='复位内部空间',exact=True).click();restored=save(page)
    assert restored['interior']==initial['interior'] and restored['exterior']['scene']==inside['exterior']['scene']
    passed('interior reset is independent and theme color controls are beside background controls')
    page.get_by_role('button',name='星球外观',exact=True).click();page.screenshot(path=str(ROOT/'outputs/COLORVERSE-image-editor-preview.png'),full_page=True)
    context.close()
    second=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce');other=second.new_page();other.on('pageerror',lambda e:errors.append(str(e)))
    other.goto(URL);other.wait_for_load_state('networkidle');enable_teacher(other);other.get_by_role('button',name='教师演示',exact=True).click()
    other.locator('input[type=file][accept=".zip,.json"]').set_input_files(str(package));expect(other.get_by_role('dialog',name='作品包校验报告')).to_be_visible(timeout=20000)
    other.get_by_role('button',name='确认导入宇宙').click();card=other.locator('.teacher-cards article').filter(has_text='日落收藏家 · 副本');expect(card).to_be_visible();card.get_by_role('button',name='编辑',exact=True).click()
    expect(other.get_by_role('button',name='恢复完整取景',exact=True)).to_be_enabled()
    expect(other.locator('canvas')).to_have_attribute('data-planet-mask','true')
    passed('ZIP restores crop parameters and masked rendering into an independent browser context')
    other.set_viewport_size({'width':390,'height':844});other.wait_for_timeout(300)
    assert other.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(other.get_by_role('button',name='复位星球外观',exact=True)).to_be_visible()
    other.screenshot(path=str(ROOT/'outputs/COLORVERSE-image-editor-mobile.png'),full_page=True)
    passed('mobile editor retains reset and image controls without horizontal overflow')
    second.close();browser.close()
assert not errors,errors
(ROOT/'outputs/COLORVERSE-image-tools-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} image editor browser checks passed.')

