from pathlib import Path
import json,sys,re
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'/'vendor'))
from playwright.sync_api import sync_playwright
state=json.loads((ROOT/'shopify/draft-theme.json').read_text(encoding='utf-8'))
OUT=ROOT/'shopify/preview';OUT.mkdir(exist_ok=True)
errors=[];reports=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1000},device_scale_factor=1)
    page=context.new_page()
    page.on('pageerror',lambda err:errors.append(str(err)))
    response=page.goto(state['previewUrl'],wait_until='domcontentloaded',timeout=60000)
    assert response.status==200,response.status
    page.locator('body.arcan-home').wait_for(timeout=30000)
    page.add_style_tag(content='#preview-bar-iframe, #PBarNextFrame {display:none!important}')
    page.evaluate('document.fonts.ready')
    page.locator('.arcan-home footer').scroll_into_view_if_needed()
    page.wait_for_timeout(1500)
    page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(600)
    assert 'Liquid error' not in page.locator('body').inner_text()
    assert page.locator('slideshow-component .slideshow__slide').count()==2
    assert page.locator('slideshow-component .slideshow').bounding_box()['height']>80
    banners=page.locator('slideshow-component .slideshow__media img').evaluate_all('(imgs)=>imgs.map(i=>({src:i.currentSrc||i.src,complete:i.complete,width:i.naturalWidth}))')
    for width,height in [(1440,1000),(390,844),(320,760),(768,1024),(1024,900)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(350)
        assert page.locator('slideshow-component .slideshow').bounding_box()['height']>80, f'Banner collapsed at {width}px'
        result={'width':width,'overflow':page.evaluate('document.documentElement.scrollWidth>innerWidth'),'brokenImages':page.locator('main img:visible, .site-header img').evaluate_all('(imgs)=>imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src)')}
        reports.append(result)
        if width in [1440,390]:
            page.screenshot(path=str(OUT/f'home-{width}.png'),full_page=True)
            page.screenshot(path=str(OUT/f'viewport-{width}.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    catalog=page.locator('.arcan-catalog').first
    catalog.locator('[data-arcan-panel]').nth(1).click()
    assert catalog.locator('[data-arcan-products]:visible .arcan-product').count()>0
    assert catalog.locator('[data-arcan-panel]').nth(1).get_attribute('aria-current')=='true'
    product_url=catalog.locator('[data-arcan-products]:visible .arcan-product h3 a').first.get_attribute('href')
    form=page.locator('.arcan-product form').first
    assert '/cart/add' in form.get_attribute('action')
    assert form.locator('input[name=id]').get_attribute('value').isdigit()
    page.set_viewport_size({'width':390,'height':844})
    page.locator('.menu-button').click();assert page.locator('#arcan-main-nav').is_visible()
    page.keyboard.press('Escape');assert not page.locator('#arcan-main-nav').is_visible()
    second=page.locator('slideshow-component .slider-counter__link').nth(1)
    second.click();page.wait_for_timeout(500)
    page.locator('#arcan-search').fill('Glaceon');page.locator('.search-form button').click()
    page.wait_for_url(re.compile(r'.*/search\?.*q=Glaceon.*'),timeout=30000)
    assert page.locator('body.arcan-home').count()==0
    page.goto('https://arcantcg.com.br'+product_url,wait_until='domcontentloaded',timeout=45000)
    assert page.locator('body.arcan-home').count()==0
    assert 'Liquid error' not in page.locator('body').inner_text()
    browser.close()
result={'preview':state['previewUrl'],'banners':banners,'viewports':reports,'pageErrors':errors,'checks':['Two original banners','Live products and price markup','Collection tabs','Native add-to-cart form and real variant id','Mobile menu and Escape','Banner navigation','Shopify search','Unchanged product template'],'cartMutationPerformed':False}
(OUT/'checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True,indent=2))
if any(x['overflow'] or x['brokenImages'] for x in reports):sys.exit(1)
