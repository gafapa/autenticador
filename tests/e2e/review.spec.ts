import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import { readFile } from 'node:fs/promises'

async function docxFile(name = 'sample.docx') {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t><w:tab/><w:t>world</w:t><w:br/><w:t>Next &amp; &#33;</w:t></w:r></w:p></w:body></w:document>')
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await zip.generateAsync({ type: 'nodebuffer' }) }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('docforensics-locale')) localStorage.setItem('docforensics-locale', 'en') } catch {}
  })
})

test('DOCX upload, keyboard access, history reload, invalid file recovery and offline restore', async ({ page, context, baseURL }, testInfo) => {
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const origin = new URL(baseURL!).origin
  page.on('request', request => { if (!request.url().startsWith(`${origin}/`) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) external.push(request.url()) })
  await page.goto('./')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /Drop documents/ })).toBeFocused()
  await page.locator('input[type=file]').setInputFiles(await docxFile())
  await expect(page.getByText('Insufficient text — analysis limited', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: /Extracted text/ }).click()
  await expect(page.locator('pre')).toHaveText('Hello world Next & !')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('docforensics-analysis-history')!)[0].fileName)).toBe('sample.docx')
  await expect(page.getByText(/This index summarizes/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('review.png'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('button', { name: /sample.docx/ })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.docx', mimeType: 'application/zip', buffer: Buffer.from('broken') })
  await expect(page.getByRole('alert')).toContainText('invalid or unsupported')
  await expect(page.getByRole('button', { name: /sample.docx/ })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: /sample.docx/ })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Clear history', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /sample.docx/ })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('real PDF extraction and full PDF report download respect the production CSP', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const pdf = new jsPDF()
  pdf.setProperties({ author: 'Fictional Author', creator: 'Bardwell Publishing', title: 'Synthetic fixture' })
  pdf.text('Local PDF fixture with a few words.', 20, 20)
  await page.goto('./')
  await page.evaluate(() => { (window as any).cspErrors = []; document.addEventListener('securitypolicyviolation', e => (window as any).cspErrors.push(e.violatedDirective)) })
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf.output('arraybuffer')) })
  await expect(page.getByRole('button', { name: /sample.pdf/ })).toBeVisible()
  await page.getByRole('button', { name: /Extracted text/ }).click()
  await expect(page.locator('pre')).toContainText('Local PDF fixture')
  await expect(page.getByText('AI software named in metadata', { exact: true })).toHaveCount(0)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Generate PDF report', exact: true }).click()
  const download = await downloadEvent
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(3000)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const reportTask = pdfjs.getDocument({ data: Uint8Array.from(bytes) })
  const report = await reportTask.promise
  const reportText: string[] = []
  const outOfBounds: string[] = []
  for (let number = 1; number <= report.numPages; number++) {
    const reportPage = await report.getPage(number)
    const content = await reportPage.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      reportText.push(item.str)
      if (item.transform[5] < 0 || item.transform[5] > reportPage.view[3]) outOfBounds.push(item.str)
    }
  }
  await reportTask.destroy()
  expect(outOfBounds).toEqual([])
  expect(reportText.join(' ')).toContain('not an AI probability')
  expect(reportText.join(' ')).toContain('Insufficient text')
  await page.locator('input[type=file]').setInputFiles({ name: 'second.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf.output('arraybuffer')) })
  await expect(page.getByRole('button', { name: /second.pdf/ })).toBeVisible()
  expect(await page.evaluate(() => (window as any).cspErrors)).toEqual([])
  expect(errors).toEqual([])
})

test('blocked browser storage still allows analysis and displays a recoverable warning', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, { value() { throw new DOMException('Storage blocked', 'SecurityError') } })
  })
  await page.goto('./')
  await page.getByRole('combobox').selectOption('en')
  await page.locator('input[type=file]').setInputFiles(await docxFile())
  await expect(page.getByRole('button', { name: /sample.docx/ })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Current results remain in this session')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Generate PDF report', exact: true }).click()
  await download
  expect(errors).toEqual([])
})

test('corrupt history is preserved and all seven locales expose the limited-analysis state', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('docforensics-analysis-history', '[{"analyzedAt":"invalid","metadata":{}}]'))
  await page.goto('./')
  await expect(page.getByRole('status')).toContainText('original storage has been preserved')
  expect(await page.evaluate(() => localStorage.getItem('docforensics-analysis-history'))).toBe('[{"analyzedAt":"invalid","metadata":{}}]')
  await page.locator('input[type=file]').setInputFiles(await docxFile())
  for (const locale of ['en', 'es', 'gl', 'fr', 'de', 'ca', 'eu']) {
    await page.getByRole('combobox').selectOption(locale)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.locator('main')).not.toContainText('document appears authentic')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
