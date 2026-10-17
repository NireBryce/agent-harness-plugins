import { describe, expect, test } from 'claude-code/testing'
import type { FsEntry, RenderElement } from 'claude-code'

// A small tree the test's own fs hooks answer from, beneath the plugin.
const TREE: Record<string, FsEntry[]> = {
  '.': [
    { name: 'README.md', kind: 'file', size: 12, mtimeMs: 1, isLink: false },
    { name: 'flake', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: '.git', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: '.envrc', kind: 'file', size: 3, mtimeMs: 1, isLink: false },
  ],
  flake: [{ name: 'flake.nix', kind: 'file', size: 20, mtimeMs: 1, isLink: false }],
}
const FILES: Record<string, string> = {
  'README.md': '# hello',
  'flake/flake.nix': '{ outputs = _: { }; }',
}

const PANE = {
  component: 'Pane',
  requestId: 'file-browser',
  props: {
    title: 'Files',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

describe('file-browser', () => {
  test('lists, descends, previews and goes back on mobile', async ($, on) => {
    // The engine hands fs hooks the path resolved against the working
    // directory: match it to the tree by its tail, the root being the rest.
    const known = [...Object.keys(TREE), ...Object.keys(FILES)].filter(key => key !== '.')
    const rel = (path: string) => known.find(key => path.endsWith(`/${key}`)) ?? '.'
    on('fs.list', async (_$, e) => ({ value: TREE[rel(e.path)] ?? [] }))
    on('fs.stat', async (_$, e) => ({
      value: { kind: 'file' as const, size: FILES[rel(e.path)]?.length ?? 0, mtimeMs: 1, isLink: false },
    }))
    on('fs.read', async (_$, e) => ({ value: FILES[rel(e.path)] ?? '' }))

    const ui = await $.ui.mount({ plugin: 'file-browser', surface: 'mobile', ...PANE })

    expect(await ui.find({ key: 'file:README.md' })).toBeDefined()
    expect(await ui.find({ key: 'dir:flake' })).toBeDefined()
    expect(await ui.find({ key: 'dir:.git' })).toBeUndefined()
    expect(await ui.find({ key: 'file:.envrc' })).toBeUndefined()

    await ui.press({ key: 'hidden' })
    expect(await ui.find({ key: 'file:.envrc' })).toBeDefined()
    expect(await ui.find({ key: 'dir:.git' })).toBeUndefined()

    await ui.press({ key: 'dir:flake' })
    expect(await ui.find({ key: 'file:flake.nix' })).toBeDefined()

    await ui.press({ key: 'file:flake.nix' })
    expect((await ui.find({ type: 'Code' }))?.text).toBe('{ outputs = _: { }; }')

    await ui.press({ key: 'back' })
    await ui.press({ key: 'up' })
    expect(await ui.find({ key: 'file:README.md' })).toBeDefined()
    expect(await ui.find({ key: 'up' })).toBeUndefined()
  })

  test('says a binary file is binary instead of drawing it', async ($, on) => {
    on('fs.list', async () => ({
      value: [{ name: 'logo.png', kind: 'file' as const, size: 4, mtimeMs: 1, isLink: false }],
    }))
    on('fs.stat', async () => ({
      value: { kind: 'file' as const, size: 4, mtimeMs: 1, isLink: false },
    }))
    on('fs.read', async () => ({ value: 'PNG\u0000' }))

    const ui = await $.ui.mount({ plugin: 'file-browser', surface: 'mobile', ...PANE })
    await ui.press({ key: 'file:logo.png' })

    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Binary file/ })).toBeDefined()
  })

  test('draws the browser in the /files output row on mobile only', async ($, on) => {
    on('fs.list', async () => ({
      value: [{ name: 'README.md', kind: 'file' as const, size: 7, mtimeMs: 1, isLink: false }],
    }))
    // Stands in for the engine's own row, which the plugin passes on off mobile.
    on('ui.render', async ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, {}, 'engine row') as RenderElement
    })
    const ROW = {
      component: 'CommandOutput',
      props: { command: 'files', args: '', text: 'opened', isErrored: false },
    } as const

    const mobile = await $.ui.mount({ plugin: 'file-browser', surface: 'mobile', ...ROW })
    expect(await mobile.find({ key: 'file:README.md' })).toBeDefined()

    const desktop = await $.ui.mount({ plugin: 'file-browser', surface: 'desktop', ...ROW })
    expect(await desktop.find({ key: 'file:README.md' })).toBeUndefined()
    expect(await desktop.find({ type: 'Text', text: 'engine row' })).toBeDefined()
  })
})
