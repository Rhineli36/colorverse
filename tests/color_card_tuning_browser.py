"""Regression: fast preset-to-HEX edits must not be overwritten by a delayed color sync."""
import os, sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1680, 'height': 1050})
    page.goto('http://127.0.0.1:5174/', wait_until='networkidle')
    page.get_by_role('button', name='编辑你的星球', exact=True).click()
    page.locator('.studio-emotion-colors>summary').click()
    picker = page.get_by_role('region', name='情感色卡创作')
    field = picker.get_by_label('主色调 HEX', exact=True)
    for n in range(8):
        picker.get_by_role('button', name='选择红色色卡', exact=True).click()
        value = '#6F91D2' if n % 2 == 0 else '#8A6DC0'
        field.fill(value)
        expect(page.get_by_label('本机主色调实时预览', exact=True)).to_have_attribute('data-color', value)
        # Incomplete drafts stay editable and cannot become an invalid saved color.
        field.fill('#12')
        picker.get_by_label('希望表达的情感或氛围', exact=True).focus()
        expect(field).to_have_value(value)
    browser.close()
result = {'status': 'passed', 'rapidPresetToHexRounds': 8, 'invalidDraftBlur': 'restores actual valid color'}
(ROOT/'outputs/color-card-tuning-acceptance.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
