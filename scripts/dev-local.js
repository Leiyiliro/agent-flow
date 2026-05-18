#!/usr/bin/env node
'use strict'

const path = require('path')
const { spawn, spawnSync } = require('child_process')

const WEB_PORT = '37417'
const RELAY_PORT = '37418'
const PNPM = 'pnpm'
const cliArgs = process.argv.slice(2).filter(arg => arg !== '--')
const WORKSPACE = cliArgs[0] || path.resolve(process.cwd(), '..')

const env = {
  ...process.env,
  AGENT_FLOW_RELAY_PORT: RELAY_PORT,
  AGENT_FLOW_ACTIVE_SESSION_AGE_S: '86400',
  AGENT_FLOW_TELEMETRY: 'false',
  DO_NOT_TRACK: '1',
  NEXT_PUBLIC_DEMO: '0',
  NEXT_PUBLIC_RELAY_PORT: RELAY_PORT,
  NEXT_TELEMETRY_DISABLED: '1',
}

function commandFor(command, args) {
  if (process.platform !== 'win32' || command !== PNPM) return { command, args }
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', [PNPM, ...args].join(' ')],
  }
}

function run(name, command, args) {
  const resolved = commandFor(command, args)
  const child = spawn(resolved.command, resolved.args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`))
  return child
}

function runPnpm(name, args) {
  return run(name, PNPM, args)
}

const buildRelay = spawnSync(process.execPath, ['scripts/build-relay.js'], {
  cwd: process.cwd(),
  env,
  encoding: 'utf8',
})

if (buildRelay.stdout) process.stdout.write(buildRelay.stdout)
if (buildRelay.stderr) process.stderr.write(buildRelay.stderr)
if (buildRelay.status !== 0) process.exit(buildRelay.status || 1)

const children = [
  run('relay', process.execPath, ['scripts/.dev-relay.js', WORKSPACE]),
  runPnpm('web', ['--filter', 'agent-flow-web', 'exec', 'next', 'dev', '-p', WEB_PORT]),
]

console.log(`Agent Flow workspace:   ${WORKSPACE}`)
console.log(`Agent Flow local web:   http://localhost:${WEB_PORT}`)
console.log(`Agent Flow local relay: http://127.0.0.1:${RELAY_PORT}/events`)
console.log('Telemetry opt-out: AGENT_FLOW_TELEMETRY=false, DO_NOT_TRACK=1, NEXT_TELEMETRY_DISABLED=1')

let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

for (const child of children) {
  child.on('exit', code => {
    if (!shuttingDown && code !== 0) shutdown(code || 1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
