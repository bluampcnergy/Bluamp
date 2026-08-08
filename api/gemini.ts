import { GoogleGenAI, Type } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!API_KEY) {
        return res.status(500).json({ error: 'Server misconfiguration: GEMINI_API_KEY is missing.' });
    }

    const { action, payload } = req.body;

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        if (action === 'generateTextResponse') {
            const { prompt } = payload;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { temperature: 0.7, maxOutputTokens: 2048 }
            });
            return res.status(200).json({ text: response.text });
        }

        if (action === 'extractInvoiceData') {
            const { fileBase64, mimeType, prompt, schema } = payload;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType, data: fileBase64 } },
                        { text: prompt }
                    ]
                },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.1,
                    maxOutputTokens: 8192,
                }
            });
            return res.status(200).json({ text: response.text });
        }

        if (action === 'generateInvoiceFromText') {
            const { prompt, schema } = payload;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.1,
                }
            });
            return res.status(200).json({ text: response.text });
        }

        if (action === 'findSuppliers') {
            const { prompt, schema } = payload;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2,
                    maxOutputTokens: 8192,
                }
            });
            return res.status(200).json({ text: response.text });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error('Gemini Proxy Error:', error);
        return res.status(500).json({ error: error.message || 'Failed to communicate with Gemini API' });
    }
}
