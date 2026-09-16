"""Bounded desktop/mobile preview and interaction check using installed Chrome."""
from pathlib import Path
import json
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'vendor'))
from playwright.sync_api import sync_playwright

out = ROOT / 'preview'
out.mkdir(exist_ok=True)
errors = []
report = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    page = browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto((ROOT / 'index.html').as_uri())
    page.evaluate('document.fonts.ready')
    page.locator('footer').scroll_into_view_if_needed()
    page.wait_for_timeout(500)
    page.evaluate('window.scrollTo(0,0)')
    page.wait_for_timeout(500)
    for width, height in [(1440,1000),(390,844),(320,760),(768,1024),(1024,900)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(200)
        report.append({'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'broken_images':page.locator('img').evaluate_all('(imgs)=>imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src)')})
        if width in [1440,390]:
            page.screenshot(path=str(out / f'home-{width}.png'), full_page=True)
            page.screenshot(path=str(out / f'viewport-{width}.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#search-input').fill('glaceon')
    page.locator('.search-form button').click()
    assert page.locator('#product-grid .product').count()==1
    page.locator('#product-grid [data-detail]').first.click()
    assert page.locator('#product-dialog').is_visible()
    page.locator('#product-dialog [data-add]').click()
    page.keyboard.press('Escape')
    page.locator('#open-cart').click()
    assert page.locator('.cart-item').count()==1
    page.locator('[data-remove]').click()
    assert page.locator('.cart-empty').is_visible()
    page.keyboard.press('Escape')
    page.locator('#search-input').fill('produto que nao existe')
    page.locator('.search-form button').click()
    assert page.locator('#empty-state').is_visible()
    page.locator('#reset-search').click()
    assert page.locator('#product-grid .product').count()==12
    page.locator('.filters [data-filter="cards"]').click()
    assert page.locator('#product-grid .product').count()==5
    page.set_viewport_size({'width':390,'height':844})
    page.locator('.menu-button').click()
    assert page.locator('#main-nav').is_visible()
    page.locator('#main-nav [data-filter="boosters"]').click()
    assert page.locator('#product-grid .product').count()==2
    assert not page.locator('#main-nav').is_visible()
    assert not errors, errors
    assert all(not r['overflow'] and not r['broken_images'] for r in report), report
    browser.close()
result={'viewports':report,'javascript_errors':errors,'interactions':'passed: search, details, add, remove, empty state, reset, filters, mobile menu, Escape'}
(out/'checks.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
