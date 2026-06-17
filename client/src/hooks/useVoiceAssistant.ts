import { useState, useCallback, useRef, useEffect } from 'react';

// API Configuration - Use environment variables
const GROQ_STT_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''; // Speech-to-Text
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || ''; // Text-to-Speech
const IFLOW_API_KEY = import.meta.env.VITE_IFLOW_API_KEY || '';
const IFLOW_BASE_URL = 'https://apis.iflow.cn/v1';

export interface VoiceCommand {
  action: 'launch' | 'install' | 'navigate' | 'search' | 'info' | 'unknown';
  version?: string;
  loader?: 'vanilla' | 'forge' | 'fabric' | 'quilt' | 'dragon';
  tab?: string;
  query?: string;
  rawText: string;
}

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processedTranscriptsRef = useRef<Set<string>>(new Set());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const wakeWordRecognizerRef = useRef<any>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Speech-to-Text using Groq Whisper
  const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_STT_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text;
  };

  // AI Processing using iFlow
  const processCommand = async (text: string, context: any): Promise<{ command: VoiceCommand; response: string }> => {
    const systemPrompt = `You are a voice assistant for a Minecraft launcher. Parse user commands and respond naturally.

Available actions:
- launch: Launch a Minecraft version (e.g., "launch 1.21.1 vanilla", "play forge 1.20")
- install: Install a version (e.g., "install fabric 1.21", "download vanilla 1.19")
- navigate: Navigate to tabs (e.g., "go to mods", "open settings", "show friends")
- search: Search for mods/versions (e.g., "search for optifine", "find 1.20 versions")
- info: Get information (e.g., "what versions are installed", "show my profile")

Context:
- Installed versions: ${context.installedVersions?.join(', ') || 'none'}
- Current tab: ${context.currentTab || 'home'}
- Username: ${context.username || 'Player'}

Parse the command and respond in JSON format:
{
  "action": "launch|install|navigate|search|info|unknown",
  "version": "version number if applicable",
  "loader": "vanilla|forge|fabric|quilt|dragon if applicable",
  "tab": "tab name if navigating",
  "query": "search query if searching",
  "response": "Natural language response to the user"
}`;

    const response = await fetch(`${IFLOW_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${IFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen3-coder-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI processing failed: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Parse JSON response
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        command: {
          action: parsed.action,
          version: parsed.version,
          loader: parsed.loader,
          tab: parsed.tab,
          query: parsed.query,
          rawText: text,
        },
        response: parsed.response,
      };
    } catch (e) {
      // Fallback if AI doesn't return valid JSON
      return {
        command: {
          action: 'unknown',
          rawText: text,
        },
        response: aiResponse,
      };
    }
  };

  // Text-to-Speech using Deepgram Aura
  const speak = async (text: string): Promise<void> => {
    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    
    setIsSpeaking(true);
    
    try {
      // Use Deepgram's TTS API with Aura 2 Iris model
      const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-2-iris-en', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'text/plain',
        },
        body: text,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Deepgram TTS failed: ${response.statusText} - ${errorText}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };
      
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };
      
      await audio.play();
    } catch (error) {
      console.error('Deepgram TTS error:', error);
      setIsSpeaking(false);
      // Fallback to browser TTS
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Start listening
  const startListening = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        setIsProcessing(true);
        
        try {
          // Transcribe
          const text = await transcribeAudio(audioBlob);
          
          // Only set transcript if it's new (prevent loop)
          if (!processedTranscriptsRef.current.has(text)) {
            setTranscript(text);
            processedTranscriptsRef.current.add(text);
            
            // Clear old transcripts after 10 entries
            if (processedTranscriptsRef.current.size > 10) {
              const firstKey = processedTranscriptsRef.current.values().next().value;
              processedTranscriptsRef.current.delete(firstKey);
            }
          }
          
          setIsProcessing(false);
        } catch (err: any) {
          setError(err.message);
          setIsProcessing(false);
        }
      };
      
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsListening(true);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Stop listening
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  // Wake word detection using Web Speech API
  const startWakeWordDetection = useCallback(async () => {
    console.log('[Wake Word] Checking Speech Recognition support...');
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('[Wake Word] ❌ Speech recognition not supported, using continuous listening mode instead');
      setError('Wake word detection not available. Click the Dynamic Island to use voice commands.');
      return;
    }

    // Stop existing recognizer if any
    if (wakeWordRecognizerRef.current) {
      try {
        wakeWordRecognizerRef.current.stop();
      } catch (e) {
        // Ignore
      }
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[Wake Word] ✅ Listening for wake words...');
      setIsWakeWordListening(true);
      setError(null); // Clear any previous errors
    };

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.toLowerCase().trim();
          console.log('[Wake Word] 👂 Heard:', text);
          
          // Check for wake words at the start
          const wakeWords = ['hey', 'hi', 'hello', 'hallo'];
          const firstWord = text.split(' ')[0];
          
          if (wakeWords.includes(firstWord)) {
            console.log('[Wake Word] ✅ WAKE WORD DETECTED! Activating...');
            // Don't stop recognition, just trigger listening
            // Start full listening
            setTimeout(() => {
              startListening();
            }, 300);
            return;
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('[Wake Word] ❌ Error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        console.error('[Wake Word] 🚫 Speech Recognition blocked by system');
        console.log('[Wake Word] 💡 Falling back to manual activation mode');
        setError('Voice commands available - click Dynamic Island to speak');
        setIsWakeWordListening(false);
      } else if (event.error === 'no-speech') {
        // Ignore no-speech errors, they're normal
        console.log('[Wake Word] No speech detected, continuing...');
      } else if (event.error === 'aborted') {
        // Ignore aborted errors when we stop manually
        console.log('[Wake Word] Recognition aborted');
      } else {
        console.warn('[Wake Word] Non-critical error:', event.error);
      }
    };

    recognition.onend = () => {
      console.log('[Wake Word] Ended, restarting...');
      // Auto-restart if we're still supposed to be listening
      if (!isListening) {
        setTimeout(() => {
          try {
            if (wakeWordRecognizerRef.current === recognition) {
              recognition.start();
            }
          } catch (error: any) {
            if (error.message.includes('already started')) {
              console.log('[Wake Word] Already running');
            } else {
              console.error('[Wake Word] Restart failed:', error.message);
            }
          }
        }, 500);
      }
    };

    wakeWordRecognizerRef.current = recognition;

    try {
      recognition.start();
      console.log('[Wake Word] 🚀 Starting detection...');
    } catch (error: any) {
      if (error.message.includes('already started')) {
        console.log('[Wake Word] Already running');
      } else {
        console.error('[Wake Word] ❌ Failed to start:', error.message);
        console.log('[Wake Word] 💡 Falling back to manual activation - click Dynamic Island to use voice commands');
        setError('Voice commands available - click Dynamic Island to speak');
      }
    }
  }, [isListening, startListening]);

  // Stop wake word detection
  const stopWakeWordDetection = useCallback(() => {
    if (wakeWordRecognizerRef.current) {
      try {
        wakeWordRecognizerRef.current.stop();
        setIsWakeWordListening(false);
        console.log('[Wake Word] Detection stopped');
      } catch (error) {
        console.error('[Wake Word] Failed to stop:', error);
      }
    }
  }, []);

  // Process voice command
  const processVoiceCommand = useCallback(async (text: string, context: any): Promise<VoiceCommand> => {
    setIsProcessing(true);
    try {
      const { command, response: aiResponse } = await processCommand(text, context);
      setResponse(aiResponse);
      
      // Speak the response
      await speak(aiResponse);
      
      setIsProcessing(false);
      return command;
    } catch (err: any) {
      setError(err.message);
      setIsProcessing(false);
      throw err;
    }
  }, []);

  // Cancel speaking
  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);
  
  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript('');
    setResponse('');
    setError(null);
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    transcript,
    response,
    error,
    isWakeWordListening,
    startListening,
    stopListening,
    speak,
    processVoiceCommand,
    stopSpeaking,
    clearTranscript,
    startWakeWordDetection,
    stopWakeWordDetection,
  };
}
