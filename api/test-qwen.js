import process from 'node:process'
import axios from 'axios'
import { checkRateLimit, sendJson, setCors } from './_utils.js'

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (!checkRateLimit(req)) return sendJson(res, 429, { error: 'Too many requests' })
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })

  const qwenKey = process.env.QWEN_API_KEY
  if (!qwenKey) return sendJson(res, 500, { error: 'QWEN_API_KEY not configured' })

  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen-plus',
        messages: [{ role: 'user', content: 'Respond with: QWEN_OK' }],
        temperature: 0,
        max_tokens: 20,
      },
      {
        headers: {
          Authorization: `Bearer ${qwenKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    )

    return sendJson(res, 200, {
      status: 'success',
      response: response.data?.choices?.[0]?.message?.content,
    })
  } catch (err) {
    return sendJson(res, 500, {
      status: 'error',
      detail: err?.response?.data || err?.message,
    })
  }
}