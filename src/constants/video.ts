// Video playback configuration constants
export const VIDEO_CONFIG = {
  DEFAULT_FRAME_RATE: 30,
  LOOP_THRESHOLD: 0.05,
  DEBUG_THRESHOLD: 0.1,
  STEP_BACK_INTERVAL: 1000 / 30, // 30fps in milliseconds
} as const;

// Loop mode constants
export const LOOP_MODES = {
  NONE: 'none',
  LOOP: 'loop', 
  REVERSE: 'reverse',
  PING_PONG: 'ping-pong',
  RANDOM: 'random',
} as const;

export type LoopMode = typeof LOOP_MODES[keyof typeof LOOP_MODES];

// Video element configuration
export const VIDEO_ELEMENT_CONFIG = {
  MUTED: true,
  AUTOPLAY: true,
  CROSS_ORIGIN: 'anonymous',
  PLAYS_INLINE: true,
  PRELOAD: 'auto',
  BACKGROUND_COLOR: '#1a1a1a',
} as const; 

// Frame buffering configuration for worker-based rendering
export const FRAME_BUFFER_CONFIG = {
  MAX_IN_FLIGHT_FRAMES: 2, // keep small to avoid latency and memory
} as const;

// Decode/pipeline buffering parameters
export const VIDEO_PIPELINE_CONFIG = {
  NB_FRAMES_TO_CHECK: 6,
  REQUEST_MARGIN_MS: 90,
  MAX_QUEUE_SIZE: 8,
} as const;