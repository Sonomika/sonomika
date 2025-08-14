import React from 'react';
import ComponentLibrary from './ComponentLibrary';

/**
 * Component Library Demo Page
 * 
 * This is a simple wrapper that renders the ComponentLibrary component.
 * Use this page to test and reference the UI components during development.
 * 
 * To use this in your app:
 * 1. Import this component where needed
 * 2. Or add it to your routing system
 * 3. Or temporarily replace your main app content with this
 */

const ComponentLibraryDemo: React.FC = () => {
  return <ComponentLibrary />;
};

export default ComponentLibraryDemo;
