// Vercel Serverless Function — Cerebras Proxy
// Bypasses CORS and proxies streaming chat completions to Cerebras

export const config = {
  runtime: 'edge',
};

const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY || '';

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
    const body = await req.text();

    const upstream = await fetch(CEREBRAS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CEREBRAS_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
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
      JSON.stringify({ error: { message: err.message || 'Cerebras proxy error' } }),
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
