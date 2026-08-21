export interface AiCandidate {
  start: number;
  end: number;
  title: string;
  hook: string;
  reason: string;
  category: string;
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text;
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('AI response did not contain a JSON array.');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function scoreTranscriptWithAi(
  transcript: string,
  duration: number,
  desiredLength: number,
): Promise<AiCandidate[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !transcript.trim()) return null;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = `You are a short-form video editor. Analyse the timestamped transcript below and return only a JSON array of the strongest self-contained clips. Select 5-15 clips where source length permits. Each must be around ${desiredLength} seconds and longer than 60 seconds, within 0-${duration}, and end on a payoff. Fields: start, end, title, hook, reason, category. Category must be Funny, Emotional, Informative, Controversial, Story, Quote, or High energy. Do not claim guaranteed virality.\n\n${transcript.slice(0, 80000)}`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: 'system', content: 'Return valid JSON only. Be precise with source timestamps.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI analysis failed (${response.status}).`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;
  return extractJson(content) as AiCandidate[];
}
