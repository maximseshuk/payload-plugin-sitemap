import fs from 'node:fs/promises'
import path from 'node:path'

import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const outDir = path.join(root, 'media/screenshots')
const baseURL = 'http://localhost:3104'

const login = async (request: APIRequestContext) => {
  const response = await request.post('/api/users/login', {
    data: { email: 'dev@payloadcms.com', password: 'test' },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { token: string }).token
}

const frame = async (page: Page, name: string) => {
  const shot = await page.screenshot()
  const url = new URL(page.url())
  const framePage = await page.context().newPage()
  await framePage.setViewportSize({ height: 960, width: 1408 })
  await framePage.setContent(`<!doctype html>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #0a0c0e; }
  .stage {
    background:
      radial-gradient(60% 70% at 18% 20%, rgba(219, 39, 119, 0.28), transparent 70%),
      radial-gradient(50% 60% at 90% 100%, rgba(219, 39, 119, 0.12), transparent 70%),
      #0a0c0e;
    display: inline-block;
    padding: 64px;
  }
  .window {
    background: #141619;
    border-radius: 14px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 40px 80px -20px rgba(0, 0, 0, 0.8), 0 0 120px rgba(219, 39, 119, 0.12);
    overflow: hidden;
    width: 1280px;
  }
  .bar {
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    gap: 8px;
    height: 40px;
    padding: 0 16px;
    position: relative;
  }
  .dot { border-radius: 50%; height: 12px; width: 12px; }
  .url {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.55);
    font: 13px/24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    left: 50%;
    padding: 0 16px;
    position: absolute;
    transform: translateX(-50%);
  }
  img { display: block; width: 1280px; }
</style>
<div class="stage">
  <div class="window">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="url">${url.pathname}</span>
    </div>
    <img src="data:image/png;base64,${shot.toString('base64')}" />
  </div>
</div>`)
  await framePage.locator('img').evaluate((img: HTMLImageElement) => img.decode())
  await framePage.locator('.stage').screenshot({ path: path.join(outDir, `${name}.png`) })
  await framePage.close()
}

const open = async (page: Page, pathname: string) => {
  await page.goto(pathname)
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
}

test.use({ colorScheme: 'dark', deviceScaleFactor: 2, viewport: { height: 660, width: 1280 } })

test.describe('screenshots', () => {
  let token = ''

  test.beforeAll(async ({ request }) => {
    await fs.mkdir(outDir, { recursive: true })
    token = await login(request)
    const headers = { Authorization: `JWT ${token}` }
    const generate = await request.post('/api/sitemap/generate', { headers })
    expect(generate.status(), await generate.text()).toBe(202)
    await expect
      .poll(
        async () => {
          const status = (await (await request.get('/api/sitemap/status', { headers })).json()) as {
            generatedAt?: string
            state?: string
          }
          return Boolean(status.generatedAt) && status.state === 'idle'
        },
        { intervals: [1000], timeout: 120 * 1000 },
      )
      .toBe(true)
    const layout = await request.post('/api/payload-preferences/dashboard-layout', {
      headers,
      data: { value: { layouts: [{ id: 'sitemap-1', width: 'full' }] } },
    })
    expect(layout.ok()).toBe(true)
  })

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'payload-theme', url: baseURL, value: 'dark' },
      { name: 'payload-token', url: baseURL, value: token },
    ])
  })

  test('sitemap page', async ({ page }) => {
    await open(page, '/admin/sitemap')
    await expect(page.locator('.sitemap-panel__table tbody tr').first()).toBeVisible()
    await frame(page, 'page')
  })

  test('dashboard widget', async ({ page }) => {
    await page.setViewportSize({ height: 280, width: 1280 })
    await open(page, '/admin')
    await expect(page.locator('.sitemap-panel__stats')).toBeVisible()
    await frame(page, 'widget')
  })
})
