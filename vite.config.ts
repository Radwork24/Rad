import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function terminalLoggerPlugin(): Plugin {
  return {
    name: 'terminal-logger',
    configureServer(server) {
      // 1. Terminal logging endpoint
      server.middlewares.use('/api/terminal-log', (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const { level = 'info', tag = 'RAD', message = '', data } = JSON.parse(body || '{}')
              const time = new Date().toLocaleTimeString()
              const colors: Record<string, string> = {
                error: '\x1b[1;31m',   // Bold Red
                warn: '\x1b[1;33m',    // Bold Yellow
                info: '\x1b[36m',      // Cyan
                success: '\x1b[1;32m', // Bold Green
              }
              const color = colors[level] || '\x1b[37m'
              const reset = '\x1b[0m'
              const dim = '\x1b[2m'
              console.log(`${dim}[${time}]${reset} ${color}[${tag}]${reset} ${message}`)
              if (data !== undefined && data !== null) {
                console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data)
              }
            } catch {
              console.log('[BROWSER RAW]', body)
            }
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/plain')
            res.end('ok')
          })
        } else {
          res.statusCode = 405
          res.end()
        }
      })

      // 2. Dev proxy endpoint to bypass CORS for Firebase Storage & external URLs
      server.middlewares.use('/api/proxy-file', async (req, res) => {
        if (req.method === 'GET') {
          try {
            const parsedUrl = new URL(req.url || '', 'http://localhost')
            const targetUrl = parsedUrl.searchParams.get('url')
            if (!targetUrl) {
              res.statusCode = 400
              res.end('Missing url param')
              return
            }

            console.log(`\x1b[35m[PROXY]\x1b[0m Fetching: ${targetUrl.substring(0, 80)}...`)
            const upstream = await fetch(targetUrl)
            if (!upstream.ok) {
              res.statusCode = upstream.status
              res.end(`Upstream error: ${upstream.status} ${upstream.statusText}`)
              return
            }

            const contentType = upstream.headers.get('content-type') || 'application/pdf'
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Content-Type', contentType)

            const arrayBuffer = await upstream.arrayBuffer()
            res.statusCode = 200
            res.end(Buffer.from(arrayBuffer))
            console.log(`\x1b[32m[PROXY]\x1b[0m Served ${arrayBuffer.byteLength} bytes`)
          } catch (err: any) {
            console.error('\x1b[31m[PROXY ERROR]\x1b[0m', err)
            res.statusCode = 500
            res.end(`Proxy failed: ${err?.message || err}`)
          }
        } else {
          res.statusCode = 405
          res.end()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), terminalLoggerPlugin()],
})
