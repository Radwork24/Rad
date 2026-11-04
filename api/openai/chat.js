// Vercel Serverless Function — OpenAI Proxy
// Bypasses CORS and proxies streaming chat completions to OpenAI

export const config = {
  runtime: 'edge',
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const clientKey = authHeader.replace(/^Bearer\s+/i, '').trim();
    const apiKey = (process.env.OPENAI_API_KEY || clientKey || '').trim();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: { message: 'OPENAI_API_KEY not found in environment variables or request headers.' } }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const rawBody = await req.text();

    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: rawBody,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: err?.message || 'OpenAI proxy error' } }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

