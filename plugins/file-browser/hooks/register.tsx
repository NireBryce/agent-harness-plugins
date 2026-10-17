import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, FsEntry, Register } from 'claude-code'

const PANE = 'file-browser'
const TITLE = 'Files'
// What one preview draws: a tree draws 100,000 characters in all, and the
// rows around the code need some of that.
const PREVIEW_CHARS = 60_000
// $.fs.read rejects past 4 MiB.
const READ_LIMIT = 4 * 1024 * 1024
// A listing longer than this draws its head and says how many it left out.
const MAX_ENTRIES = 400
// Tools whose calls may change the tree, so a shown pane re-lists after them.
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])

const dir = atom({ plugin: 'file-browser', key: 'dir' } as const, '')
const file = atom({ plugin: 'file-browser', key: 'file' } as const, '')
const showHidden = atom({ plugin: 'file-browser', key: 'showHidden' } as const, false)

type Row = { name: string; isDir: boolean; size: number }

const join = (parent: string, name: string) => (parent === '' ? name : `${parent}/${name}`)
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/')

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// A symbolic link lists as `other`; stat follows it to say what it leads to.
const toRow = async ($: EngineInterface, parent: string, entry: FsEntry): Promise<Row> => {
  if (entry.kind !== 'other') {
    return { name: entry.name, isDir: entry.kind === 'dir', size: entry.size }
  }
  const stat = await $.fs.stat(join(parent, entry.name)).catch(() => undefined)

  return { name: entry.name, isDir: stat?.kind === 'dir', size: stat?.size ?? 0 }
}

const listRows = async ($: EngineInterface, path: string, isHiddenShown: boolean) => {
  const entries = await $.fs.list(path === '' ? '.' : path)
  const shown = entries.filter(
    entry => entry.name !== '.git' && (isHiddenShown || !entry.name.startsWith('.')),
  )
  const rows = await Promise.all(shown.map(entry => toRow($, path, entry)))

  return rows.sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
  )
}

type Preview = { text: string; note?: string }

const loadPreview = async ($: EngineInterface, path: string): Promise<Preview> => {
  const stat = await $.fs.stat(path)
  if (stat.size > READ_LIMIT) {
    return { text: '', note: `Too large to preview (${formatSize(stat.size)}).` }
  }
  const text = await $.fs.read(path)
  if (text.includes('\u0000')) {
    return { text: '', note: `Binary file (${formatSize(stat.size)}).` }
  }
  if (text.length > PREVIEW_CHARS) {
    return {
      text: text.slice(0, PREVIEW_CHARS),
      note: `Showing the first ${PREVIEW_CHARS} of ${text.length} characters.`,
    }
  }

  return { text }
}

// The elements the browser draws with: every surface's table has these.
type Elements = Pick<ElementTable, 'Box' | 'Text' | 'Button' | 'Code'>

// The browser itself, drawn in the side pane where a surface places panes,
// and in the /files command's output row on the mobile app, which places none.
const drawBrowser = async ($: EngineInterface, { Box, Text, Button, Code }: Elements) => {
  const shownDir = await read($, dir)
  const shownFile = await read($, file)
  const isHiddenShown = await read($, showHidden)

  const goTo = (path: string) => update($, dir, () => path)
  const openFile = (path: string) => update($, file, () => path)
  const closeFile = () => update($, file, () => '')

  if (shownFile !== '') {
    const preview = await loadPreview($, shownFile).catch(
      (error: unknown): Preview => ({ text: '', note: `Cannot read it: ${String(error)}` }),
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          <Button key="back" hotkey="b" autoFocus onPress={() => void closeFile()}>
            ← Back
          </Button>
          <Text weight="semibold" wrap="truncate-start">
            {shownFile}
          </Text>
        </Box>
        {preview.note !== undefined && <Text dimColor>{preview.note}</Text>}
        {preview.text !== '' && <Code source={preview.text} path={shownFile} startLine={1} />}
      </Box>
    )
  }

  const listed = await listRows($, shownDir, isHiddenShown).then(
    rows => ({ rows }),
    (error: unknown) => ({ rows: [] as Row[], error: String(error) }),
  )
  const rows = listed.rows.slice(0, MAX_ENTRIES)

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {shownDir !== '' && (
          <Button key="up" hotkey="u" onPress={() => void goTo(parentOf(shownDir))}>
            ↑ Up
          </Button>
        )}
        <Button key="refresh" hotkey="r" onPress={() => $.ui.invalidate('ui.render')}>
          Refresh
        </Button>
        <Button
          key="hidden"
          hotkey="h"
          dimColor={!isHiddenShown}
          onPress={() => void update($, showHidden, isShown => !isShown)}
        >
          {isHiddenShown ? 'Hide dotfiles' : 'Show dotfiles'}
        </Button>
      </Box>
      <Text weight="semibold" wrap="truncate-start">
        {shownDir === '' ? './' : `./${shownDir}/`}
      </Text>
      {'error' in listed && <Text color="error">Cannot list it: {listed.error}</Text>}
      {!('error' in listed) && rows.length === 0 && <Text dimColor>Empty.</Text>}
      <Box flexDirection="column">
        {rows.map(row =>
          row.isDir ? (
            <Button
              key={`dir:${row.name}`}
              plain
              onPress={() => void goTo(join(shownDir, row.name))}
            >
              📁 {row.name}/
            </Button>
          ) : (
            <Button
              key={`file:${row.name}`}
              plain
              onPress={() => void openFile(join(shownDir, row.name))}
            >
              {row.name} <Text dimColor>{formatSize(row.size)}</Text>
            </Button>
          ),
        )}
      </Box>
      {listed.rows.length > rows.length && (
        <Text dimColor>{listed.rows.length - rows.length} more not shown.</Text>
      )}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'files',
      description: 'Browse the files in the working tree (a side pane; inline on mobile)',
    })

    return next(e)
  })

  on('command.run', { command: 'files' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })

    return {
      text: isPlaced
        ? 'Files pane opened.'
        : 'No surface here places a side pane; the mobile app draws the browser in this row.',
    }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WRITERS.has(e.tool)) $.ui.invalidate('ui.render')

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) =>
    drawBrowser($, $.ui.resolve(e)),
  )

  on('ui.render', { component: 'CommandOutput', props: { command: 'files' } }, async ($, e, next) =>
    e.surface === 'mobile' ? drawBrowser($, $.ui.resolve(e)) : next(e),
  )
}
