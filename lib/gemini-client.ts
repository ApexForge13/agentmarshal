// Gemini Pro wrapper via the OpenAI-compatible endpoint.
//
// Pure LLM wrapper — this module does NOT route through Lobster Trap.
// Inspection happens at the route handler layer, which calls
// lobstertrap-client.inspect() before deciding whether to invoke this.

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const MODEL = 'gemini-2.0-flash';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GeminiChatResponse {
  choices?: Array<{
    message?: { role: string; content: string };
  }>;
}

export async function complete(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set — refusing to call Gemini without auth.',
    );
  }

  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
      }),
    });
  } catch (err) {
    throw new Error(
      `Gemini request to ${GEMINI_URL} failed: ${(err as Error).message}`,
    );
  }

  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(
      `Gemini returned ${res.status}: ${bodyText.slice(0, 200)}`,
    );
  }

  let parsed: GeminiChatResponse;
  try {
    parsed = JSON.parse(bodyText) as GeminiChatResponse;
  } catch (err) {
    throw new Error(
      `Gemini returned non-JSON body: ${(err as Error).message}`,
    );
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      `Gemini response missing choices[0].message.content: ${bodyText.slice(0, 200)}`,
    );
  }

  return content;
}
