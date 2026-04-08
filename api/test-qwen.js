import axios from 'axios'
import process from 'process'
import { checkRateLimit, sendJson } from './_utils.js'

export default async function handler(req, res) {
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests. Please try again later.' })
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })

  const qwenKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY
  if (!qwenKey) return sendJson(res, 500, { error: 'QWEN_API_KEY (or DASHSCOPE_API_KEY) not configured' })

  const baseUrl = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  try {
    const response = await axios.post(
      url,
      {
        model: process.env.QWEN_MODEL || 'qwen3.6-plus',
        messages: [{ role: 'user', content: 'Respond with: QWEN_OK' }],
        temperature: 0,
        max_tokens: 20,
      },
      {
        headers: {
          Authorization: `Bearer ${qwenKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
      },
    )

    return sendJson(res, 200, {
      status: 'success',
      model: process.env.QWEN_MODEL || 'qwen3.6-plus',
      baseUrl,
      response: response.data?.choices?.[0]?.message?.content,
      usage: response.data?.usage,
    })
  } catch (err) {
    return sendJson(res, 500, {
      status: 'error',
      model: process.env.QWEN_MODEL || 'qwen3.6-plus',
      baseUrl,
      detail: err?.response?.data || err?.message || String(err),
    })
  }
}

