/// <reference path="./globals.d.ts" />

import 'codemirror/addon/runmode/runmode.node.js'

// Our runmode import will have tweaked the requires here so
// that we don't pull in the full CodeMirror
import * as CodeMirror from 'codemirror'

// This is a hack, some modes (looking at you markdown) uses
// CodeMirror.innerMode which isn't defined in the stripped down
// runmode. Luckily it's a simple, dependency free method so we'll
// just import it and stick it on the global CodeMirror object.
import { innerMode } from 'codemirror/src/modes'
const cma = CodeMirror as any
cma.innerMode = innerMode

import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/jsx/jsx'
import 'codemirror/mode/sass/sass'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/mode/markdown/markdown'

interface IToken {
  length: number
  text: string
  token: string
}

type Tokens = {
  [line: number]: { [startIndex: number]: IToken }
}

const extensionMIMEMap = new Map<string, string>()

extensionMIMEMap.set('.ts', 'text/typescript')
extensionMIMEMap.set('.tsx', 'text/jsx')
extensionMIMEMap.set('.js', 'text/javascript')
extensionMIMEMap.set('.json', 'application/json')
extensionMIMEMap.set('.html', 'text/html')
extensionMIMEMap.set('.htm', 'text/html')
extensionMIMEMap.set('.markdown', 'text/x-markdown')
extensionMIMEMap.set('.md', 'text/x-markdown')
extensionMIMEMap.set('.css', 'text/css')
extensionMIMEMap.set('.scss', 'text/x-scss')
extensionMIMEMap.set('.less', 'text/x-less')

onmessage = (ev: MessageEvent) => {
  const startTime = performance ? performance.now() : null

  const tabSize: number = ev.data.tabSize
  const extension: string = ev.data.extension
  const contents: string = ev.data.contents
  const requestedLines: Array<number> | undefined = ev.data.lines

  const mimeType = extensionMIMEMap.get(extension)

  if (!mimeType) {
    throw new Error(`Extension not supported: ${extension}`)
  }

  const mode: CodeMirror.Mode<{}> = CodeMirror.getMode({ tabSize }, mimeType)

  if (!mode) {
    throw new Error(`No mode found for ${mimeType}`)
  }

  const lineFilter =
    requestedLines && requestedLines.length
      ? new Set<number>(requestedLines)
      : null

  const lines = contents.split(/\r?\n/)
  const state: any = mode.startState ? mode.startState() : null

  const tokens: Tokens = {}

  for (const [ix, line] of lines.entries()) {
    // For stateless modes we can optimize by only running
    // the tokenizer over lines we care about.
    if (lineFilter && !state) {
      if (!lineFilter.has(ix)) {
        continue
      }
    }

    if (!line.length) {
      if (mode.blankLine) {
        mode.blankLine(state)
      }

      continue
    }

    const ctx = { lines, line: ix }

    const lineStream = new (CodeMirror as any).StringStream(
      line,
      tabSize,
      ctx
    ) as CodeMirror.StringStream

    while (!lineStream.eol()) {
      const token = mode.token(lineStream, state)

      if (token && (!lineFilter || lineFilter.has(ix))) {
        tokens[ix] = tokens[ix] || {}
        tokens[ix][lineStream.start] = {
          length: lineStream.pos - lineStream.start,
          text: lineStream.current(),
          token,
        }
      }

      lineStream.start = lineStream.pos
    }
  }

  if (startTime) {
    const endTime = performance.now()
    const duration = endTime - startTime
    console.info('Tokenization done in ' + duration)
  }
  postMessage(tokens)
}