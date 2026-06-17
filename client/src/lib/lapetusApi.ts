// Hardcoded API Configuration
const API_CONFIG = {
  baseUrl: 'https://apis.iflow.cn/v1',
  apiKey: 'sk-47555004c8c5a30dfa082861fc0fd563',
  model: 'qwen3-max',
  maxTokens: 8192,
  temperature: 0.7,
  stream: true,
  endpoint: '/chat/completions'
} as const;

// Additional instruction to append to system prompt
const NO_EMOJI_INSTRUCTION = '\n\nIMPORTANT: Never use emojis in your responses. Use plain text only.';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Load system prompt from file
let SYSTEM_PROMPT = '';

async function loadSystemPrompt(): Promise<string> {
  if (SYSTEM_PROMPT) return SYSTEM_PROMPT;
  
  try {
    const response = await fetch('/systemprompt.txt');
    SYSTEM_PROMPT = await response.text();
    console.log('[Lapetus API] System prompt loaded successfully');
    return SYSTEM_PROMPT;
  } catch (error) {
    console.error('[Lapetus API] Failed to load system prompt:', error);
    return 'You are Lapetus, an expert Minecraft PvP coach.';
  }
}

export interface StreamResult {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  elapsedTime: number;
}

export async function sendChatMessageStream(
  messages: Message[],
  onChunk: (text: string) => void
): Promise<StreamResult> {
  const startTime = Date.now();
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  
  try {
    console.log('[Lapetus API] Sending request with streaming enabled');
    console.log('[Lapetus API] Using model:', API_CONFIG.model);
    
    // Load system prompt
    const systemPrompt = await loadSystemPrompt();
    
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt + NO_EMOJI_INSTRUCTION
          },
          ...messages
        ],
        max_tokens: API_CONFIG.maxTokens,
        temperature: API_CONFIG.temperature,
        stream: API_CONFIG.stream,
      }),
    });

    console.log('[Lapetus API] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Lapetus API] Error Response:', errorText);
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body reader available');
    }

    let buffer = '';
    let chunkCount = 0;
    let rawDataCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        const elapsedTime = (Date.now() - startTime) / 1000; // Convert to seconds
        console.log('[Lapetus API] Stream completed. Total chunks:', chunkCount, 'Elapsed time:', elapsedTime + 's');
        return {
          totalTokens,
          promptTokens,
          completionTokens,
          elapsedTime
        };
      }

      const decoded = decoder.decode(value, { stream: true });
      rawDataCount++;
      console.log('[Lapetus API] Raw data chunk', rawDataCount, ':', decoded);
      
      buffer += decoded;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        console.log('[Lapetus API] Processing line:', trimmedLine);
        
        // Handle both "data: " and "data:" formats
        if (trimmedLine.startsWith('data:')) {
          const data = trimmedLine.startsWith('data: ') 
            ? trimmedLine.slice(6) 
            : trimmedLine.slice(5);
          
          if (data === '[DONE]') {
            console.log('[Lapetus API] Received [DONE] signal');
            const elapsedTime = (Date.now() - startTime) / 1000;
            return {
              totalTokens,
              promptTokens,
              completionTokens,
              elapsedTime
            };
          }

          try {
            const parsed = JSON.parse(data);
            console.log('[Lapetus API] Parsed data:', parsed);
            
            // Extract token usage if available
            if (parsed.usage) {
              totalTokens = parsed.usage.total_tokens || 0;
              promptTokens = parsed.usage.prompt_tokens || 0;
              completionTokens = parsed.usage.completion_tokens || 0;
              console.log('[Lapetus API] Token usage:', { totalTokens, promptTokens, completionTokens });
            }
            
            const content = parsed.choices[0]?.delta?.content;
            
            if (content) {
              chunkCount++;
              console.log('[Lapetus API] Chunk', chunkCount, ':', content);
              onChunk(content);
            }
          } catch (e) {
            console.warn('[Lapetus API] Failed to parse chunk:', trimmedLine, e);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Lapetus API] Error:', error);
    const elapsedTime = (Date.now() - startTime) / 1000;
    throw error;
  }
}
