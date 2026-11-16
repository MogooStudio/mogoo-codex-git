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
  const repositoryResponse = page.waitForResponse(response => response.url().includes('/api/repository?'));
  await page.goto(`${base}/?${new URLSearchParams({ cwd: process.cwd(), token: process.env.UI_AUTH_TOKEN || '' })}`);
  const repository = await (await repositoryResponse).json();
  await page.locator('.commit').first().waitFor();
  const trigger = page.getByRole('combobox', {name:'提交范围'}), menu = page.getByRole('listbox', {name:'提交范围'});
  const filter = page.getByRole('textbox', {name:'搜索分支或标签'});
  await trigger.click(); await menu.waitFor();
  assert.equal(await page.getByRole('option', {name:'所有分支与标签',exact:true}).getAttribute('aria-selected'),'true');
  const locals = menu.getByRole('group', {name:'本地分支',exact:true});
  const localCount = repository.refs.filter(ref=>ref.kind==='local').length;
  assert.equal(await filter.getAttribute('placeholder'),'搜索分支或标签');
  if (localCount) assert.equal(await locals.locator('.scope-group-count').innerText(),String(localCount));
  if (repository.branch) {
    const current = page.getByRole('option', {name:repository.branch,exact:true});
    assert.equal(await locals.getByRole('option').first().getAttribute('aria-label'),repository.branch);
    assert.equal(await current.getAttribute('aria-current'),'true');
    assert.equal(await current.getAttribute('aria-selected'),'false');
    assert.equal(await current.locator('.scope-current').innerText(),'当前');
  } else assert.equal(await menu.locator('[aria-current=true]').count(),0);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  assert.equal(await trigger.innerText(),'当前 HEAD 的历史');
  await page.locator('.commit').first().waitFor();
  await trigger.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  assert.equal(await trigger.innerText(),'所有分支与标签');
  await trigger.click(); await page.keyboard.press('End'); await page.keyboard.press('Escape');
  assert.equal(await trigger.innerText(),'所有分支与标签');
  assert.equal(await trigger.evaluate(el => el === document.activeElement),true);
  await trigger.click(); await filter.fill('refs/heads/master');
  assert.equal(await locals.locator('.scope-group-count').innerText(),`1/${localCount}`);
  await page.getByRole('button', {name:'清除分支或标签搜索'}).click();
  assert.equal(await filter.inputValue(),'');
  assert.equal(await filter.evaluate(el=>el===document.activeElement),true);
  assert.equal(await locals.getByRole('option').count(),localCount);
  await filter.fill('refs/heads/master'); await filter.press('Enter');
  assert.equal(await trigger.innerText(),'master');
  await trigger.click();
  if (repository.branch) assert.equal(await menu.locator('[aria-current=true]').getAttribute('aria-label'),repository.branch);
  await page.keyboard.press('Escape');
  await trigger.click(); await page.getByRole('option', {name:'所有分支与标签',exact:true}).click();
  await trigger.click(); await page.locator('.project').click();
  assert.equal(await menu.count(),0);
  await trigger.click(); await page.keyboard.press('Tab');
  assert.equal(await menu.count(),0);
  for (const width of [1600,760,588,390]) {
    await page.setViewportSize({width,height:1000});
    for (const theme of ['light','dark']) {
      await page.getByRole('button', { name: '界面主题' }).click();
      await page.locator(`.theme-${theme}`).click(); await trigger.click();
      const popup = page.locator('.scope-menu');
      const box = await popup.boundingBox(), anchor = await trigger.boundingBox();
      assert.ok(box.x >= 0 && box.x+box.width <= width && box.y+box.height <= 1000);
      assert.equal(box.width, 360);
      assert.ok(Math.abs(box.x + box.width - anchor.x - anchor.width) < 1);
      assert.equal(await popup.evaluate(el => getComputedStyle(el).backgroundColor),theme==='dark' ? 'rgb(47, 52, 62)' : 'rgb(248, 249, 251)');
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
  await page.waitForFunction(()=>document.querySelector('.scope-results')?.scrollTop>0);
  const last = menu.getByRole('option').last(), longLabel = last.locator('.scope-option-label');
  assert.equal(await last.getAttribute('title'),await last.getAttribute('aria-label'));
  assert.equal(await longLabel.evaluate(el=>getComputedStyle(el).webkitLineClamp),'2');
  assert.ok(await longLabel.evaluate(el=>el.clientHeight<=40));
  const tagHeader = menu.getByRole('group',{name:'标签',exact:true}).locator('.scope-group-label');
  const sticky = await tagHeader.evaluate(el=>({position:getComputedStyle(el).position,
    top:el.getBoundingClientRect().top,parentTop:el.closest('.scope-results').getBoundingClientRect().top}));
  assert.equal(sticky.position,'sticky');
  assert.ok(Math.abs(sticky.top-sticky.parentTop)<2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.ok((await menu.boundingBox()).height<=420);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('PASS: current branch independent of filter, counts, clear, two-line names, sticky groups, aligned themes at 1600/760/588/390px, keyboard navigation and dismissal.');
} finally { await browser.close(); }
