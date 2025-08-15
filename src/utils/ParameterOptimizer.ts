import React, { useRef, useCallback } from 'react';

/**
 * Utility to optimize parameter updates by batching changes
 * and preventing unnecessary re-renders
 */
export class ParameterOptimizer {
  private static instance: ParameterOptimizer;
  private pendingUpdates: Map<string, Map<string, any>> = new Map();
  private updateTimeout: number | null = null;
  private updateCallbacks: Map<string, (updates: any) => void> = new Map();

  static getInstance(): ParameterOptimizer {
    if (!ParameterOptimizer.instance) {
      ParameterOptimizer.instance = new ParameterOptimizer();
    }
    return ParameterOptimizer.instance;
  }

  /**
   * Register a callback for a specific layer
   */
  registerCallback(layerId: string, callback: (updates: any) => void) {
    this.updateCallbacks.set(layerId, callback);
  }

  /**
   * Unregister a callback for a specific layer
   */
  unregisterCallback(layerId: string) {
    this.updateCallbacks.delete(layerId);
    this.pendingUpdates.delete(layerId);
  }

  /**
   * Queue a parameter update
   */
  queueUpdate(layerId: string, paramName: string, value: any) {
    if (!this.pendingUpdates.has(layerId)) {
      this.pendingUpdates.set(layerId, new Map());
    }
    
    const layerUpdates = this.pendingUpdates.get(layerId)!;
    layerUpdates.set(paramName, value);

    // Schedule the update if not already scheduled
    if (this.updateTimeout === null) {
      this.updateTimeout = window.setTimeout(() => {
        this.flushUpdates();
      }, 16); // ~60fps
    }
  }

  /**
   * Flush all pending updates
   */
  private flushUpdates() {
    this.updateTimeout = null;

    this.pendingUpdates.forEach((updates, layerId) => {
      const callback = this.updateCallbacks.get(layerId);
      if (callback && updates.size > 0) {
        const updateObject: any = {};
        updates.forEach((value, paramName) => {
          updateObject[paramName] = { value };
        });
        
        callback({ params: updateObject });
        updates.clear();
      }
    });
  }

  /**
   * Force flush all updates immediately
   */
  forceFlush() {
    if (this.updateTimeout !== null) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    this.flushUpdates();
  }
}

/**
 * React hook to use the parameter optimizer
 */
export function useParameterOptimizer(layerId: string, updateCallback: (updates: any) => void) {
  const optimizer = useRef(ParameterOptimizer.getInstance());

  // Register callback on mount
  React.useEffect(() => {
    optimizer.current.registerCallback(layerId, updateCallback);
    return () => {
      optimizer.current.unregisterCallback(layerId);
    };
  }, [layerId, updateCallback]);

  const queueUpdate = useCallback((paramName: string, value: any) => {
    optimizer.current.queueUpdate(layerId, paramName, value);
  }, [layerId]);

  return { queueUpdate };
}
