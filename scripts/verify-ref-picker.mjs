import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:4317';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?${new URLSearchParams({cwd:process.cwd()})}`);
  await page.locator('.commit').first().waitFor();
  const trigger = page.getByRole('combobox', {name:'提交范围'}), menu = page.getByRole('listbox', {name:'提交范围'});
  await trigger.click(); await menu.waitFor();
  assert.equal(await page.getByRole('option', {name:'全部提交',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  assert.equal(await trigger.innerText(),'master');
  await page.locator('.commit').first().waitFor();
  await trigger.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  assert.equal(await trigger.innerText(),'全部提交');
  await trigger.click(); await page.keyboard.press('End'); await page.keyboard.press('Escape');
  assert.equal(await trigger.innerText(),'全部提交');
  assert.equal(await trigger.evaluate(el => el === document.activeElement),true);
  await trigger.click(); await page.keyboard.press('m'); await page.keyboard.press('Enter');
  assert.equal(await trigger.innerText(),'master');
  await trigger.click(); await page.getByRole('option', {name:'全部提交',exact:true}).click();
  await trigger.click(); await page.locator('.project').click();
  assert.equal(await menu.count(),0);
  await trigger.click(); await page.keyboard.press('Tab');
  assert.equal(await menu.count(),0);
  for (const width of [1600,760,390]) {
    await page.setViewportSize({width,height:1000});
    for (const theme of ['light','dark']) {
      await page.locator(`.theme-${theme}`).click(); await trigger.click();
      const box = await menu.boundingBox();
      assert.ok(box.x >= 0 && box.x+box.width <= width && box.y+box.height <= 1000);
      assert.equal(await menu.evaluate(el => getComputedStyle(el).backgroundColor),theme==='dark' ? 'rgb(40, 44, 52)' : 'rgb(250, 250, 250)');
      await page.keyboard.press('Escape');
    }
  }
  // Test-only responses stress long labels and scrolling without changing any Git refs.
  await page.route('**/api/repository?*',async route => {
    const response=await route.fetch(), data=await response.json();
    data.refs.push(...Array.from({length:60},(_,i)=>({name:`refs/tags/test-${i}`,label:`long-test-${i}-`+'segment/'.repeat(25),kind:'tag',oid:data.head})));
    await route.fulfill({response,json:data});
  });
  await page.getByRole('button',{name:'刷新',exact:true}).click();
  await page.waitForResponse(response=>response.url().includes('/api/repository?'));
  await page.locator('.refresh:not([disabled])').waitFor();
  await trigger.click(); await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('.scope-menu')?.scrollTop>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok((await menu.boundingBox()).height<=420);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('PASS: themed popup, actual ref filtering, selection check, arrows/Home/End/Enter/Escape/typeahead/Tab, outside dismissal, 1600/760/390px, long refs and scroll, no page errors.');
} finally { await browser.close(); }
