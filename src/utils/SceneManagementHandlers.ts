/**
 * Handle scene rename functionality
 */
export const handleSceneRename = (
  scene: any,
  updateScene: (sceneId: string, updates: any) => void
) => {
  // Create a modal dialog for renaming
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const dialogContent = document.createElement('div');
  dialogContent.style.cssText = `
    background: #141414;
    border: 1px solid #262626;
    border-radius: 8px;
    padding: 1.5rem;
    min-width: 300px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = 'Rename Scene';
  title.style.cssText = `
    margin: 0 0 1rem 0;
    color: #d6d6d6;
    font-size: 1.125rem;
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = scene.name;
  input.style.cssText = `
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #262626;
    border-radius: 4px;
    background: #1f1f1f;
    color: #d6d6d6;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  `;

  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 0.5rem 1rem;
    border: 1px solid #262626;
    border-radius: 4px;
    background: transparent;
    color: #d6d6d6;
    cursor: pointer;
    font-size: 0.875rem;
  `;

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Rename';
  confirmBtn.style.cssText = `
    padding: 0.5rem 1rem;
    border: 1px solid #262626;
    border-radius: 4px;
    background: #1f1f1f;
    color: #d6d6d6;
    cursor: pointer;
    font-size: 0.875rem;
  `;

  const handleConfirm = () => {
    const newName = input.value.trim();
    if (newName && newName !== scene.name) {
      console.log('Updating scene name from:', scene.name, 'to:', newName);
      try {
        updateScene(scene.id, { name: newName });
        console.log('Scene updated successfully');
      } catch (error) {
        console.error('Error updating scene:', error);
      }
    } else {
      console.log('No valid name change or cancelled');
    }
    document.body.removeChild(dialog);
  };

  const handleCancel = () => {
    document.body.removeChild(dialog);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  input.addEventListener('keydown', handleKeyDown);
  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);

  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(confirmBtn);

  dialogContent.appendChild(title);
  dialogContent.appendChild(input);
  dialogContent.appendChild(buttonContainer);
  dialog.appendChild(dialogContent);

  document.body.appendChild(dialog);

  // Focus the input
  setTimeout(() => input.focus(), 100);
};

/**
 * Handle scene delete functionality
 */
export const handleSceneDelete = (
  scene: any,
  scenes: any[],
  removeScene: (sceneId: string) => void
) => {
  const confirmed = window.confirm(`Are you sure you want to delete scene "${scene.name}"?`);
  if (confirmed) {
    removeScene(scene.id);
  }
};

/**
 * Create scene context menu
 */
export const createSceneContextMenu = (
  scene: any,
  scenes: any[],
  updateScene: (sceneId: string, updates: any) => void,
  removeScene: (sceneId: string) => void
) => {
  const menu = document.createElement('div');
  menu.style.cssText = `
    position: fixed;
    background: #141414;
    border: 1px solid #262626;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    min-width: 120px;
  `;

  // Rename option
  const renameOption = document.createElement('div');
  renameOption.textContent = 'Rename';
  renameOption.style.cssText = `
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
    color: #d6d6d6;
    transition: background-color 0.2s ease;
  `;
  renameOption.onmouseenter = () => {
    renameOption.style.backgroundColor = '#1f1f1f';
  };
  renameOption.onmouseleave = () => {
    renameOption.style.backgroundColor = 'transparent';
  };
  renameOption.onclick = () => {
    handleSceneRename(scene, updateScene);
    document.body.removeChild(menu);
  };

  // Delete option (only if more than one scene)
  if (scenes.length > 1) {
    const deleteOption = document.createElement('div');
    deleteOption.textContent = 'Delete';
    deleteOption.style.cssText = `
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      color: #f87171;
      font-size: 0.875rem;
      transition: background-color 0.2s ease;
    `;
    deleteOption.onmouseenter = () => {
      deleteOption.style.backgroundColor = '#1f1f1f';
    };
    deleteOption.onmouseleave = () => {
      deleteOption.style.backgroundColor = 'transparent';
    };
    deleteOption.onclick = () => {
      handleSceneDelete(scene, scenes, removeScene);
      document.body.removeChild(menu);
    };
    menu.appendChild(deleteOption);
  }

  menu.appendChild(renameOption);
  document.body.appendChild(menu);

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      document.body.removeChild(menu);
      document.removeEventListener('click', closeMenu);
    }
  };
  document.addEventListener('click', closeMenu);
}; 