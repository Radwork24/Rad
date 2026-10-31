import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

function terminalLoggerPlugin(env: Record<string, string>): Plugin {
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

      // Helper to create SSE streaming proxies for AI providers (bypasses CORS in dev)
      const createStreamingProxyHandler = (
        upstreamUrl: string,
        defaultKey: string,
        defaultModel: string,
        label: string
      ) => {
        return async (req: any, res: any) => {
          if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            res.statusCode = 204
            res.end()
            return
          }

          if (req.method === 'POST') {
            try {
              let body = ''
              req.on('data', (chunk: Buffer) => { body += chunk })
              req.on('end', async () => {
                try {
                  const parsed = JSON.parse(body || '{}')
                  const apiKey = defaultKey
                  const model = parsed.model || defaultModel

                  console.log(`\x1b[36m[${label} PROXY]\x1b[0m → ${model}`)

                  const upstream = await fetch(upstreamUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(parsed),
                  })

                  res.statusCode = upstream.status
                  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream')
                  res.setHeader('Cache-Control', 'no-cache')
                  res.setHeader('Access-Control-Allow-Origin', '*')

                  if (!upstream.body) {
                    res.end()
                    return
                  }

                  const reader = (upstream.body as any).getReader()
                  const pump = async () => {
                    while (true) {
                      const { done, value } = await reader.read()
                      if (done) { res.end(); break }
                      res.write(value)
                    }
                  }
                  pump().catch((err: any) => {
                    console.error(`\x1b[31m[${label} PROXY ERROR]\x1b[0m`, err?.message)
                    res.end()
                  })
                } catch (innerErr: any) {
                  console.error(`\x1b[31m[${label} PROXY PARSE ERROR]\x1b[0m`, innerErr?.message)
                  res.statusCode = 500
                  res.end(JSON.stringify({ error: { message: innerErr?.message || 'Proxy error' } }))
                }
              })
            } catch (err: any) {
              res.statusCode = 500
              res.end()
            }
          } else {
            res.statusCode = 405
            res.end()
          }
        }
      }

      // 2. Multi-Engine Proxies (LithosAI, Groq, Cerebras)
      // Keys are loaded strictly from .env — no secrets in source code
      server.middlewares.use(
        '/api/lithos/chat',
        createStreamingProxyHandler(
          'https://api.lithosai.cloud/v1/chat/completions',
          env.LITHOSAI_API_KEY || process.env.LITHOSAI_API_KEY || '',
          'deepseek-ai/DeepSeek-V4.1-Flash-fast',
          'LITHOS'
        )
      )

      server.middlewares.use(
        '/api/groq/chat',
        createStreamingProxyHandler(
          'https://api.groq.com/openai/v1/chat/completions',
          env.GROQ_API_KEY || process.env.GROQ_API_KEY || '',
          'qwen/qwen3.8-27b',
          'GROQ'
        )
      )

      server.middlewares.use(
        '/api/cerebras/chat',
        createStreamingProxyHandler(
          'https://api.cerebras.ai/v1/chat/completions',
          env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY || '',
          'qwen-3.8-27b',
          'CEREBRAS'
        )
      )

      // 3. Dev proxy endpoint to bypass CORS for Firebase Storage & external URLs
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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), terminalLoggerPlugin(env)],
    // Expose FIREBASE_*, LITHOSAI_*, GROQ_*, CEREBRAS_* to the client
    envPrefix: ['FIREBASE_', 'LITHOSAI_', 'GROQ_', 'CEREBRAS_'],
  }
})
