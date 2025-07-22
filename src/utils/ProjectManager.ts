import { AppState } from '../store/types';

export class ProjectManager {
  private static instance: ProjectManager;
  private static readonly STORAGE_KEY = 'vj_app_state';

  private constructor() {}

  static getInstance(): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager();
    }
    return ProjectManager.instance;
  }

  saveProject(state: AppState): void {
    try {
      localStorage.setItem(ProjectManager.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save project:', error);
    }
  }

  loadProject(): AppState | null {
    try {
      const savedState = localStorage.getItem(ProjectManager.STORAGE_KEY);
      if (savedState) {
        return JSON.parse(savedState);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
    }
    return null;
  }

  exportProject(state: AppState): string {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Failed to export project:', error);
      throw error;
    }
  }

  async importProject(file: File): Promise<AppState | null> {
    try {
      const text = await file.text();
      const state = JSON.parse(text);
      
      // Basic validation
      if (!state.scenes || !Array.isArray(state.scenes)) {
        throw new Error('Invalid project file: missing or invalid scenes array');
      }

      return state;
    } catch (error) {
      console.error('Failed to import project:', error);
      throw error;
    }
  }

  clearProject(): void {
    try {
      localStorage.removeItem(ProjectManager.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear project:', error);
    }
  }
} 