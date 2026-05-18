#!/usr/bin/env node
/**
 * Dev relay server — wraps the shared relay with a standalone HTTP server
 * that includes CORS headers for cross-origin dev mode (Next.js on :3000).
 */
import * as http from 'http'
import { createRelay } from './relay'
import { DEFAULT_RELAY_PORT, DEV_WEB_ORIGIN_PATTERN } from '../extension/src/constants'

function resolveRelayPort(): number {
  const raw = process.env.AGENT_FLOW_RELAY_PORT || process.env.NEXT_PUBLIC_RELAY_PORT
  if (!raw) return DEFAULT_RELAY_PORT
  const port = Number.parseInt(raw, 10)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_RELAY_PORT
}

async function main() {
  const workspace = process.argv[2] || process.cwd()
  const relayPort = resolveRelayPort()

  console.log('Starting Agent Flow dev relay...\n')
  console.log(`Workspace: ${workspace}`)

  const relay = await createRelay({ workspace, verbose: true })

  const server = http.createServer((req, res) => {
    // Echo back the request Origin if it matches a localhost pattern, so
    // CORS survives Next.js picking a fallback port when 3000 is busy.
    const origin = req.headers.origin
    if (typeof origin === 'string' && DEV_WEB_ORIGIN_PATTERN.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (req.url === '/events') {
      return relay.handleSSE(req, res)
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Agent Flow Dev Relay')
  })

  server.listen(relayPort, '127.0.0.1', () => {
    console.log(`\nSSE relay on http://127.0.0.1:${relayPort}/events`)
    console.log('Ready! Events will appear in the web app.')
  })

  function cleanup() {
    server.close()
    relay.dispose()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main().catch(e => {
  console.error('Failed to start dev relay:', e)
  process.exit(1)
})
