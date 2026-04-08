import axios from 'axios'
import { checkRateLimit, sendJson, getRequiredEnv } from './_utils.js'

export default async function handler(req, res) {
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again later.' })
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })

  try {
    const deepseekKey = getRequiredEnv('DEEPSEEK_API_KEY')
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello, just testing the API. Respond with "API working" only.' }],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${deepseekKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    )

    return sendJson(res, 200, {
      status: 'success',
      response: response.data?.choices?.[0]?.message?.content,
      usage: response.data?.usage,
    })
  } catch (err) {
    return sendJson(res, 500, {
      error: 'DeepSeek API test failed',
      detail: err?.response?.data || err?.message || String(err),
    })
  }
}

