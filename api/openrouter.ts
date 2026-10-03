const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'Server misconfiguration: OPENROUTER_API_KEY is missing.' });
    }

    const { action, payload } = req.body;

    try {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://bluamp.vercel.app", // Ensure valid referer for OpenRouter
            "X-Title": "Bluamp Plant OS"
        };

        if (action === 'testConnection') {
            const { model } = payload;
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: model || "deepseek/deepseek-chat",
                    messages: [{ role: "user", content: "ping" }],
                    max_tokens: 5
                })
            });

            if (response.ok) {
                return res.status(200).json({ success: true });
            }
            const errorBody = await response.text();
            return res.status(response.status).json({ error: errorBody });
        }

        if (action === 'generateTextResponse') {
            const { prompt, model } = payload;
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: model || "deepseek/deepseek-chat",
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return res.status(response.status).json({ error: errorBody });
            }
            
            const data = await response.json();
            return res.status(200).json(data);
        }

        if (action === 'extractInvoiceData') {
            const { prompt, fileBase64, mimeType, model } = payload;
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: model || "deepseek/deepseek-chat",
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: prompt },
                                { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } }
                            ]
                        }
                    ],
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return res.status(response.status).json({ error: errorBody });
            }

            const data = await response.json();
            return res.status(200).json(data);
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error('OpenRouter Proxy Error:', error);
        return res.status(500).json({ error: error.message || 'Failed to communicate with OpenRouter API' });
    }
}
