// Vercel Serverless Function — LithosAI Proxy
// Bypasses CORS by forwarding requests server-side to LithosAI.
// Supports SSE streaming passthrough for real-time token delivery.

export const config = {
  // Use Edge Runtime for lowest latency + native streaming support
  runtime: 'edge',
};

const LITHOSAI_URL = 'https://api.lithosai.cloud/v1/chat/completions';
const LITHOSAI_KEY = process.env.LITHOSAI_API_KEY || '';

export default async function handler(req) {
  // Handle CORS preflight
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

    const upstream = await fetch(LITHOSAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LITHOSAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    // Stream the response directly back to the browser
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
      JSON.stringify({ error: { message: err.message || 'Proxy error' } }),
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
