module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ success: false, error: 'Missing server env vars' });
  }

  try {
    const { token, userId, type } = req.body || {};
    const allowed = new Set(['scan', 'positive_click', 'negative_click', 'google_redirect', 'whatsapp_redirect']);
    if (!allowed.has(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    let resolvedUserId = userId || null;
    let resolvedToken = token || null;

    if (!resolvedUserId && resolvedToken) {
      const routeResp = await fetch(`${supabaseUrl}/rest/v1/review_links?select=user_id,token&token=eq.${encodeURIComponent(resolvedToken)}&active=is.true`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      });
      const routeRows = await routeResp.json();
      if (!routeResp.ok || !Array.isArray(routeRows) || !routeRows.length) {
        return res.status(404).json({ success: false, error: 'Route not found' });
      }
      resolvedUserId = routeRows[0].user_id;
      resolvedToken = routeRows[0].token;
    }

    if (!resolvedUserId) {
      return res.status(400).json({ success: false, error: 'Missing route identifier' });
    }

    const payload = {
      user_id: resolvedUserId,
      token: resolvedToken,
      type,
      user_agent: req.headers['user-agent'] || null,
      referrer: req.headers.referer || null
    };

    const insertResp = await fetch(`${supabaseUrl}/rest/v1/clicks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!insertResp.ok) {
      const errorText = await insertResp.text();
      return res.status(500).json({ success: false, error: errorText || 'Insert failed' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Unexpected error' });
  }
}
