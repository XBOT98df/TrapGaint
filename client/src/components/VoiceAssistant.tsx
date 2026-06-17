import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useVoiceAssistant, type VoiceCommand } from '@/hooks/useVoiceAssistant';

interface VoiceAssistantProps {
  onCommand: (command: VoiceCommand) => void;
  context: {
    installedVersions: string[];
    currentTab: string;
    username: string;
  };
}

export function VoiceAssistant({ onCommand, context }: VoiceAssistantProps) {
  const {
    isListening,
    isProcessing,
    isSpeaking,
    transcript,
    response,
    error,
    isWakeWordListening,
    startListening,
    stopListening,
    processVoiceCommand,
    stopSpeaking,
    clearTranscript,
    startWakeWordDetection,
    stopWakeWordDetection,
  } = useVoiceAssistant();

  const [isOpen, setIsOpen] = useState(false);
  const [hasProcessedTranscript, setHasProcessedTranscript] = useState(false);

  // Auto-start wake word detection on mount
  useEffect(() => {
    // Small delay to ensure everything is initialized
    const timer = setTimeout(() => {
      console.log('[Voice Assistant] Starting wake word detection...');
      startWakeWordDetection();
    }, 500);
    
    return () => {
      clearTimeout(timer);
      stopWakeWordDetection();
    };
  }, [startWakeWordDetection, stopWakeWordDetection]);

  // Process transcript when available (only once per transcript)
  useEffect(() => {
    if (transcript && !isProcessing && !hasProcessedTranscript) {
      setHasProcessedTranscript(true);
      
      processVoiceCommand(transcript, context)
        .then((command) => {
          onCommand(command);
          // Clear transcript after 5 seconds
          setTimeout(() => {
            clearTranscript();
            setHasProcessedTranscript(false);
          }, 5000);
        })
        .catch((err) => {
          console.error('Voice command error:', err);
          setHasProcessedTranscript(false);
        });
    }
  }, [transcript, isProcessing, hasProcessedTranscript, context, onCommand, processVoiceCommand, clearTranscript]);

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
      // Restart wake word detection after stopping
      setTimeout(() => startWakeWordDetection(), 500);
    } else {
      startListening();
    }
  };

  const handleToggleWakeWord = () => {
    if (isWakeWordListening) {
      stopWakeWordDetection();
    } else {
      startWakeWordDetection();
    }
  };

  return (
    <>
      {/* Floating Voice Button */}
      <motion.button
        className="fixed bottom-8 right-8 z-[10000] w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-2xl flex items-center justify-center"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        animate={{
          boxShadow: isListening 
            ? '0 0 0 0 rgba(168, 85, 247, 0.7), 0 0 0 10px rgba(168, 85, 247, 0.4), 0 0 0 20px rgba(168, 85, 247, 0.1)'
            : isWakeWordListening
            ? '0 0 0 0 rgba(236, 72, 153, 0.5), 0 0 0 8px rgba(236, 72, 153, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        transition={{
          boxShadow: {
            duration: isListening ? 1.5 : 2,
            repeat: (isListening || isWakeWordListening) ? Infinity : 0,
            repeatType: 'loop',
          },
        }}
      >
        {isProcessing ? (
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        ) : isListening ? (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <Mic className="w-8 h-8 text-white" />
          </motion.div>
        ) : isWakeWordListening ? (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Mic className="w-8 h-8 text-white" />
          </motion.div>
        ) : (
          <Mic className="w-8 h-8 text-white" />
        )}
      </motion.button>

      {/* Voice Assistant Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-28 right-8 z-[10000] w-96 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-200/50 overflow-hidden"
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            }}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
              <h3 className="text-white text-lg font-semibold">Voice Assistant</h3>
              <p className="text-white/80 text-sm">
                {isWakeWordListening ? 'Say "Hey" or "Hello" to activate' : 'Ready to listen'}
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              {/* Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isListening && (
                    <motion.div
                      className="w-2 h-2 bg-red-500 rounded-full"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                  {isWakeWordListening && !isListening && (
                    <motion.div
                      className="w-2 h-2 bg-pink-500 rounded-full"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                  <span className="text-sm font-medium text-gray-700">
                    {isListening ? 'Listening...' : isProcessing ? 'Processing...' : isSpeaking ? 'Speaking...' : isWakeWordListening ? 'Wake word active' : 'Ready'}
                  </span>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleWakeWord}
                    className={`p-2 rounded-full transition-colors ${
                      isWakeWordListening 
                        ? 'bg-pink-100 text-pink-600 hover:bg-pink-200' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={isWakeWordListening ? 'Disable wake word' : 'Enable wake word'}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={handleToggleListening}
                    className={`p-2 rounded-full transition-colors ${
                      isListening 
                        ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                        : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                    }`}
                    disabled={isProcessing}
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  
                  {isSpeaking && (
                    <button
                      onClick={stopSpeaking}
                      className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <VolumeX className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Transcript */}
              {transcript && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-50 rounded-2xl p-4"
                >
                  <p className="text-xs font-medium text-gray-500 mb-1">You said:</p>
                  <p className="text-sm text-gray-900">{transcript}</p>
                </motion.div>
              )}

              {/* Response */}
              {response && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-4"
                >
                  <p className="text-xs font-medium text-purple-600 mb-1">Assistant:</p>
                  <p className="text-sm text-gray-900">{response}</p>
                </motion.div>
              )}

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 rounded-2xl p-4"
                >
                  <p className="text-xs font-medium text-red-600 mb-1">Error:</p>
                  <p className="text-sm text-red-900">{error}</p>
                </motion.div>
              )}

              {/* Quick Commands */}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-2">Wake words:</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-full">Hey</span>
                  <span className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-full">Hi</span>
                  <span className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-full">Hello</span>
                  <span className="px-2 py-1 bg-pink-50 text-pink-600 text-xs rounded-full">Hallo</span>
                </div>
                <p className="text-xs font-medium text-gray-500 mb-2">Try saying:</p>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600">• "Hey, launch version 1.21.1 vanilla"</p>
                  <p className="text-xs text-gray-600">• "Hello, install fabric 1.20"</p>
                  <p className="text-xs text-gray-600">• "Hi, go to mods tab"</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
