/**
 * Hook to automatically register audio elements with the app audio capture system
 */

import { useEffect, useRef } from 'react';
import { audioContextManager } from '../utils/AudioContextManager';

export function useAppAudioCapture(audioElement: HTMLAudioElement | null) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!audioElement || registeredRef.current) return;

    // Initialize audio context manager if needed
    audioContextManager.initialize().then(() => {
      // Register the audio element for app audio capture
      audioContextManager.registerAudioElement(audioElement);
      registeredRef.current = true;
    }).catch((error) => {
      console.warn('[useAppAudioCapture] Failed to initialize audio context:', error);
    });

    // Cleanup on unmount
    return () => {
      if (audioElement && registeredRef.current) {
        audioContextManager.unregisterAudioElement(audioElement);
        registeredRef.current = false;
      }
    };
  }, [audioElement]);

  return {
    isRegistered: registeredRef.current,
    audioContextReady: audioContextManager.isReady()
  };
}
