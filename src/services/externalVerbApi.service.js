require('dotenv').config();

async function fetchWordsByLevelFromExternalApi({
  level,
  targetLang = 'tr',
  limit = 10,
  offset = 0,
}) {
  const baseUrl = process.env.VERB_API_BASE_URL;
  const token = process.env.VERB_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error('VERB_API_BASE_URL and VERB_API_TOKEN must be set in environment');
  }

  const url = `${baseUrl}/words/level/${encodeURIComponent(level)}?targetLang=${encodeURIComponent(targetLang)}&limit=${limit}&offset=${offset}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-token': token,
      },
    });

    const rawBody = await response.text();
    let payload;

    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      console.error('External Verb API invalid JSON response:', {
        url,
        status: response.status,
        rawBody,
        error: parseError,
      });
      throw new Error('External Verb API returned invalid JSON');
    }

    if (!response.ok) {
      console.error('External Verb API HTTP error:', {
        url,
        status: response.status,
        statusText: response.statusText,
        payload,
      });
      throw new Error(`External Verb API request failed with status ${response.status}`);
    }

    if (!payload.success) {
      console.error('External Verb API business error:', {
        url,
        payload,
      });
      throw new Error(payload.message || 'External Verb API returned success: false');
    }

    const data = Array.isArray(payload.data) ? payload.data : [];

    return data.map((item) => ({
      sourceText: item.source?.word || item.verb,
      targetText: item.target?.translation,
      pronunciationText: item.target?.pronunciation,
      level: item.level,
      type: 'word',
    }));
  } catch (error) {
    console.error('External Verb API fetch failed:', {
      level,
      targetLang,
      limit,
      offset,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  fetchWordsByLevelFromExternalApi,
};
