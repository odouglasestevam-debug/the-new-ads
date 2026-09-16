from pathlib import Path
import sys,json
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'tools/vendor'))
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
 p=b.new_page(viewport={'width':390,'height':844});p.goto(json.loads((root/'shopify/draft-theme.json').read_text())['previewUrl'],wait_until='domcontentloaded');p.wait_for_timeout(1500)
 print(p.locator('slideshow-component').evaluate('''e=>({html:e.outerHTML.slice(0,2400),nodes:[e,...e.querySelectorAll('.slideshow,.slideshow__slide,.slideshow__media,.banner__content')].map(x=>({class:x.className,height:x.getBoundingClientRect().height,width:x.getBoundingClientRect().width,display:getComputedStyle(x).display,position:getComputedStyle(x).position,pseudo:{display:getComputedStyle(x,'::before').display,padding:getComputedStyle(x,'::before').paddingBottom,content:getComputedStyle(x,'::before').content}}))})'''))
 b.close()
