"""Regression for empty-selection switches and palette changes in the actual scene."""
import os,sys,json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
URL=os.environ.get('GROWTH_PREVIEW_URL','http://127.0.0.1:5186/growth-preview.html')
out=R/os.environ.get('GROWTH_OUTPUT_DIR','outputs/growth-controls');out.mkdir(parents=True,exist_ok=True)
with sync_playwright()as w:
 b=w.chromium.launch(headless=True,channel='chrome',proxy=({'server':os.environ['GROWTH_PREVIEW_PROXY']}if os.environ.get('GROWTH_PREVIEW_PROXY')else None))
 p=b.new_page(viewport={'width':1536,'height':1100},reduced_motion='reduce');errors=[];requests=[]
 p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url))
 p.goto(URL,wait_until='networkidle')
 p.wait_for_function("[...document.images].every(i=>i.complete&&i.naturalWidth>0)")
 exterior=p.locator('.gp-exterior-stage');room=p.locator('.gp-room-scene');ring=p.get_by_role('checkbox',name='星环',exact=True);frame=p.get_by_role('checkbox',name='星辉边框',exact=True)
 expect(ring).not_to_be_checked();expect(frame).not_to_be_checked()
 expect(exterior.locator('.gp-ring-front')).to_have_count(0)
 ring.check();expect(exterior.locator('.gp-ring-front')).to_have_count(1);expect(exterior.locator('.gp-ring-back')).to_have_count(1)
 assert exterior.locator('.gp-ring-front').evaluate('(e)=>getComputedStyle(e).zIndex')=='2'
 assert exterior.locator('.gp-planet-body').evaluate('(e)=>getComputedStyle(e).zIndex')=='1'
 assert exterior.locator('.gp-ring-back').evaluate('(e)=>getComputedStyle(e).zIndex')=='0'
 on=exterior.screenshot(path=str(out/'ring-on.png'))
 ring.uncheck();expect(exterior.locator('.gp-ring-front')).to_have_count(0);off=exterior.screenshot(path=str(out/'ring-off.png'));assert on!=off
 ring.check();expect(exterior.locator('.gp-ring-front')).to_have_attribute('data-ring','gold')
 frame.check();expect(room.locator('.gp-frame-preset')).to_have_count(1)
 frame.uncheck();expect(room.locator('.gp-frame-preset')).to_have_count(0)
 p.get_by_role('button',name='结束试戴',exact=True).click()
 expect(ring).not_to_be_checked();expect(frame).not_to_be_checked()
 original=p.locator('.gp-planet-body').first.get_attribute('src');background=p.locator('.gp-room-art').get_attribute('src')
 p.get_by_role('button',name='月光银蓝',exact=True).click()
 expect(ring).to_be_checked();expect(exterior.locator('.gp-ring-front')).to_have_count(1)
 expect(p.locator('.gp-preset-card[data-locked=true]')).to_have_count(12)
 p.get_by_role('button',name='试戴边框：翡翠秘境',exact=True).click()
 hashes=[];colours=[]
 for label in ['青金星辉','月光银蓝','紫晶玫瑰']:
  p.get_by_role('button',name=label,exact=True).click()
  colours.append(exterior.locator('.gp-ring-front').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--g-metal").trim()'))
  img=exterior.screenshot(path=str(out/('palette-'+str(len(hashes))+'.png')));hashes.append(hashlib.sha256(img).hexdigest())
  assert room.locator('.gp-frame-preset').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--g-metal").trim()')==colours[-1]
  assert room.locator('[data-charm]').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--g-metal").trim()')==colours[-1]
  assert p.locator('.gp-planet-body').first.get_attribute('src')==original
  assert p.locator('.gp-room-art').get_attribute('src')==background
 assert len(set(hashes))==3,hashes;assert len(set(colours))==3,colours
 p.locator('.gp-preview-grid').screenshot(path=str(out/'rose-preview.png'))
 p.get_by_role('button',name='原配色',exact=True).click()
 assert room.locator('.gp-frame-preset').evaluate('(e)=>getComputedStyle(e).getPropertyValue("--g-metal").trim()')=='#e0c27e'
 p.get_by_role('button',name='试戴星环：水母·星海巡游',exact=True).click()
 jelly=exterior.locator('.gp-jelly-orbit.gp-ring-front')
 p.get_by_role('button',name='月光银蓝',exact=True).click();silver=jelly.screenshot()
 p.get_by_role('button',name='紫晶玫瑰',exact=True).click();rose=jelly.screenshot();assert silver!=rose
 ring.uncheck();expect(exterior.locator('.gp-jelly-orbit')).to_have_count(0)
 ring.check();expect(exterior.locator('.gp-jelly-orbit')).to_have_count(2)
 p.set_viewport_size({'width':390,'height':844});assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 expect(p.locator('.gp-preset-card[data-locked=true]')).to_have_count(12)
 assert not errors,errors;assert not any('/api/'in u for u in requests)
 (out/'checks.json').write_text(json.dumps({'status':'passed','target':URL,'emptySelectionSwitchesAccurate':True,'ringSwitchShowsDefaultTrial':True,'frontBodyRearLayering':True,'ringOnOffPixelsDiffer':True,'frameSwitchWorks':True,'palettesChangeActualScenePixels':hashes,'paletteMetalColours':colours,'paletteAppliesToFrameCharmAndRing':True,'originalPaletteRestore':True,'jellyfishPaletteAndToggle':True,'originalImagesPreserved':True,'allPresetsRemainLocked':True,'mobileNoOverflow':True,'pageErrors':errors,'apiRequests':0},ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS: empty-selection switches, visible split ring, three actual scene colours, frame/charm tint, original-colour restore, jellyfish, locked state and mobile')
 b.close()
