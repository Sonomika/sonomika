import React, { useState } from 'react';
import { ParamRow } from './ParamRow';
import { ButtonGroup } from './ButtonGroup';

/**
 * Style Guide - Developer Reference for UI Consistency
 * 
 * Compact, minimal style guide with only 2 font sizes and Inter font.
 * Route: /__style (hidden from production builds)
 */

interface StyleGuideProps {
  onClose?: () => void;
}

export const StyleGuide: React.FC<StyleGuideProps> = ({ onClose }) => {
  const [formData, setFormData] = useState({
    text: '',
    select: '',
    range: 50,
    slider1: 25,
    slider2: 75,
    checkbox: false,
    radio: 'option1'
  });

  const [activeButton, setActiveButton] = useState<string>('');
  const [activeTab, setActiveTab] = useState('effects');

  return (
    <div className="style-guide">
      <div className="style-guide-header">
        <h1>VJ App Style Guide</h1>
        <p>Developer reference for UI components and design tokens</p>
        {onClose && (
          <button className="btn btn-secondary" onClick={onClose}>
            Close Style Guide
          </button>
        )}
      </div>

      <div className="style-guide-content">
        {/* ParamRow Slider Component Preview */}
        <section className="style-section">
          <h2>ParamRow Slider Component</h2>
          <p>Preview of the unified slider component used across all panels</p>
          <p><strong>Font Size Restriction:</strong> Only 12px and 14px fonts are allowed in this design system</p>
          
          <div className="param-preview">
            <div className="preview-group">
              <h3>Integer Slider (step: 1)</h3>
              <ParamRow
                label="Sample Parameter"
                value={formData.slider1}
                min={0}
                max={100}
                step={1}
                onChange={(value) => setFormData({...formData, slider1: value})}
                onIncrement={() => setFormData({...formData, slider1: Math.min(100, formData.slider1 + 1)})}
                onDecrement={() => setFormData({...formData, slider1: Math.max(0, formData.slider1 - 1)})}
              />
            </div>

            <div className="preview-group">
              <h3>Decimal Slider (step: 0.1)</h3>
              <ParamRow
                label="Precision Control"
                value={formData.slider2 / 100}
                min={0}
                max={1}
                step={0.1}
                onChange={(value) => setFormData({...formData, slider2: Math.round(value * 100)})}
                onIncrement={() => setFormData({...formData, slider2: Math.min(100, formData.slider2 + 10)})}
                onDecrement={() => setFormData({...formData, slider2: Math.max(0, formData.slider2 - 10)})}
              />
            </div>

            <div className="preview-group">
              <h3>Coarse Slider (step: 5)</h3>
              <ParamRow
                label="Range Value"
                value={formData.range}
                min={0}
                max={100}
                step={5}
                onChange={(value) => setFormData({...formData, range: value})}
                onIncrement={() => setFormData({...formData, range: Math.min(100, formData.range + 5)})}
                onDecrement={() => setFormData({...formData, range: Math.max(0, formData.range - 5)})}
              />
            </div>

            <div className="preview-group">
              <h3>Without Buttons</h3>
              <ParamRow
                label="Slider Only"
                value={50}
                min={0}
                max={100}
                step={1}
                onChange={() => {}}
                showButtons={false}
              />
            </div>

            <div className="preview-group">
              <h3>Without Label</h3>
              <ParamRow
                label="Hidden Label"
                value={75}
                min={0}
                max={100}
                step={1}
                onChange={() => {}}
                showLabel={false}
              />
            </div>
          </div>
        </section>

        {/* ButtonGroup Component */}
        <section className="style-section">
          <h2>ButtonGroup Component</h2>
          <p>Preview of the unified button group component used for blend modes and other selections</p>
          
          <div className="param-preview">
            <div className="preview-group">
              <h3>Small Size (4 columns)</h3>
              <ButtonGroup
                options={[
                  { value: 'add', label: 'Add' },
                  { value: 'multiply', label: 'Multiply' },
                  { value: 'screen', label: 'Screen' },
                  { value: 'overlay', label: 'Overlay' }
                ]}
                value="add"
                onChange={() => {}}
                columns={4}
                size="small"
              />
            </div>

            <div className="preview-group">
              <h3>Medium Size (3 columns)</h3>
              <ButtonGroup
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'darken', label: 'Darken' },
                  { value: 'lighten', label: 'Lighten' }
                ]}
                value="normal"
                onChange={() => {}}
                columns={3}
                size="medium"
              />
            </div>

            <div className="preview-group">
              <h3>Large Size (2 columns)</h3>
              <ButtonGroup
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' }
                ]}
                value="yes"
                onChange={() => {}}
                columns={2}
                size="large"
              />
            </div>
          </div>
        </section>

        {/* Color System */}
        <section className="style-section">
          <h2>Color System</h2>
          <div className="color-grid">
            <div className="color-swatch">
              <div className="color-preview" style={{ backgroundColor: '#6b95a1' }}></div>
              <div className="color-info">
                <strong>Highlighted & Buttons</strong>
                <code>#6b95a1</code>
                <span>Primary accent color</span>
              </div>
            </div>
            <div className="color-swatch">
              <div className="color-preview" style={{ backgroundColor: '#f20d0d' }}></div>
              <div className="color-info">
                <strong>Warning/Error</strong>
                <code>#f20d0d</code>
                <span>Error states & warnings</span>
              </div>
            </div>
            <div className="color-swatch">
              <div className="color-preview" style={{ backgroundColor: '#1a1a1a' }}></div>
              <div className="color-info">
                <strong>Panel Background</strong>
                <code>#1a1a1a</code>
                <span>Grey panel backgrounds</span>
              </div>
            </div>
            <div className="color-swatch">
              <div className="color-preview" style={{ backgroundColor: '#141414' }}></div>
              <div className="color-info">
                <strong>Main Background</strong>
                <code>#141414</code>
                <span>Primary app background</span>
              </div>
            </div>
            <div className="color-swatch">
              <div className="color-preview" style={{ backgroundColor: '#818181' }}></div>
              <div className="color-info">
                <strong>Titles & Headings</strong>
                <code>#818181</code>
                <span>Section titles and headings</span>
              </div>
            </div>
            <div className="color-swatch">
              <div className="color-preview" style={{ backgroundColor: '#e6c688' }}></div>
              <div className="color-info">
                <strong>Secondary Highlight</strong>
                <code>#e6c688</code>
                <span>Secondary accent and highlights</span>
              </div>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="style-section">
          <h2>Typography</h2>
          <div className="typography-examples">
            <div className="text-example">
              <h1>Heading 1 - Main Title</h1>
              <code>h1 - 14px, 600 weight</code>
            </div>
            <div className="text-example">
              <h2>Heading 2 - Section Title</h2>
              <code>h2 - 14px, 600 weight</code>
            </div>
            <div className="text-example">
              <p className="body-text">Body text - Regular paragraph text with good readability.</p>
              <code>p - 14px, 400 weight</code>
            </div>
            <div className="text-example">
              <p className="small-text">Small text - Used for captions and metadata.</p>
              <code>small - 12px, 400 weight</code>
            </div>
          </div>
        </section>

        {/* VJ App Tabs */}
        <section className="style-section">
          <h2>VJ App Tabs</h2>
          
          <div className="vj-tabs-container">
            <div className="vj-tabs">
              <button 
                className={`vj-tab ${activeTab === 'effects' ? 'active' : ''}`}
                onClick={() => setActiveTab('effects')}
              >
                Effects
              </button>
              <button 
                className={`vj-tab ${activeTab === 'sources' ? 'active' : ''}`}
                onClick={() => setActiveTab('sources')}
              >
                Sources
              </button>
              <button 
                className={`vj-tab ${activeTab === 'layers' ? 'active' : ''}`}
                onClick={() => setActiveTab('layers')}
              >
                Layers
              </button>
              <button 
                className={`vj-tab ${activeTab === 'timeline' ? 'active' : ''}`}
                onClick={() => setActiveTab('timeline')}
              >
                Timeline
              </button>
              <button 
                className={`vj-tab ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                Settings
              </button>
            </div>
            
            <div className="vj-tab-content">
              {activeTab === 'effects' && (
                <div className="tab-panel">
                  <h3>Effects Browser</h3>
                  <p>Visual effects, audio reactive effects, and generative content</p>
                  <div className="effect-grid">
                    <div className="effect-card">Blob Detection</div>
                    <div className="effect-card">Matrix Numbers</div>
                    <div className="effect-card">Pulse Hexagon</div>
                    <div className="effect-card">Flux Effect</div>
                  </div>
                </div>
              )}
              
              {activeTab === 'sources' && (
                <div className="tab-panel">
                  <h3>Media Sources</h3>
                  <p>Video files, webcam feeds, and image sources</p>
                  <div className="source-grid">
                    <div className="source-card">Video Files</div>
                    <div className="source-card">Webcam</div>
                    <div className="source-card">Images</div>
                    <div className="source-card">Audio</div>
                  </div>
                </div>
              )}
              
              {activeTab === 'layers' && (
                <div className="tab-panel">
                  <h3>Layer Management</h3>
                  <p>Composition layers, blending modes, and opacity</p>
                  <div className="layer-list">
                    <div className="layer-item">Background Layer</div>
                    <div className="layer-item">Effect Layer 1</div>
                    <div className="layer-item">Video Layer</div>
                    <div className="layer-item">Overlay Layer</div>
                  </div>
                </div>
              )}
              
              {activeTab === 'timeline' && (
                <div className="tab-panel">
                  <h3>Timeline Controls</h3>
                  <p>Playback, scrubbing, and keyframe animation</p>
                  <div className="timeline-controls">
                    <button className="play-btn">▶</button>
                    <button className="stop-btn">■</button>
                    <button className="rewind-btn">⏪</button>
                    <button className="forward-btn">⏩</button>
                  </div>
                </div>
              )}
              
              {activeTab === 'settings' && (
                <div className="tab-panel">
                  <h3>Composition Settings</h3>
                  <p>Resolution, frame rate, and output settings</p>
                  <div className="settings-form">
                    <div className="setting-item">
                      <label>Resolution</label>
                      <select>
                        <option>1920x1080</option>
                        <option>1280x720</option>
                        <option>3840x2160</option>
                      </select>
                    </div>
                    <div className="setting-item">
                      <label>Frame Rate</label>
                      <select>
                        <option>30 fps</option>
                        <option>60 fps</option>
                        <option>24 fps</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Button System */}
        <section className="style-section">
          <h2>Button System</h2>
          
          <div className="button-examples">
            <div className="example-group">
              <h3>Button Variants</h3>
              <div className="button-row">
                <button className="btn btn-primary">Primary</button>
                <button className="btn btn-secondary">Secondary</button>
                <button className="btn btn-outline">Outline</button>
                <button className="btn btn-ghost">Ghost</button>
                <button className="btn btn-danger">Danger</button>
                <button className="btn btn-success">Success</button>
              </div>
            </div>

            <div className="example-group">
              <h3>Button Sizes</h3>
              <div className="button-row">
                <button className="btn btn-primary btn-sm">Small</button>
                <button className="btn btn-primary">Medium</button>
                <button className="btn btn-primary btn-lg">Large</button>
              </div>
            </div>

            <div className="example-group">
              <h3>Interactive States</h3>
              <div className="button-row">
                <button 
                  className={`btn btn-primary ${activeButton === 'hover' ? 'hover-lift' : ''}`}
                  onMouseEnter={() => setActiveButton('hover')}
                  onMouseLeave={() => setActiveButton('')}
                >
                  Hover Effect
                </button>
                <button className="btn btn-outline focus-ring">Focus Ring</button>
                <button className="btn btn-ghost" disabled>Disabled</button>
                <button className="btn btn-primary" style={{ opacity: 0.6 }}>Loading...</button>
              </div>
            </div>

            <div className="example-group">
              <h3>Special Buttons</h3>
              <div className="button-row">
                <button className="window-control minimize">─</button>
                <button className="window-control maximize">□</button>
                <button className="window-control close">×</button>
                <button className="play-button">▶</button>
                <button className="toggle-button enabled">✓</button>
                <button className="toggle-button disabled">✗</button>
              </div>
            </div>
          </div>
        </section>

        {/* Form Controls */}
        <section className="style-section">
          <h2>Form Controls</h2>
          
          <div className="form-examples">
            <div className="example-group">
              <h3>Input Fields</h3>
              <div className="form-control">
                <label className="form-label">Text Input</label>
                <input 
                  className="form-input" 
                  type="text" 
                  placeholder="Enter text here"
                  value={formData.text}
                  onChange={(e) => setFormData({...formData, text: e.target.value})}
                />
              </div>
              
              <div className="form-control">
                <label className="form-label">Number Input</label>
                <input 
                  className="form-input" 
                  type="number" 
                  placeholder="Enter number"
                  min="0"
                  max="100"
                />
              </div>

              <div className="form-control">
                <label className="form-label">Color Input</label>
                <input 
                  className="form-input color-picker" 
                  type="color" 
                  defaultValue="#6b95a1"
                />
              </div>
            </div>

            <div className="example-group">
              <h3>Select Dropdown</h3>
              <div className="form-control">
                <label className="form-label">Select Option</label>
                <select 
                  className="form-select"
                  value={formData.select}
                  onChange={(e) => setFormData({...formData, select: e.target.value})}
                >
                  <option value="">Choose an option</option>
                  <option value="option1">Option 1</option>
                  <option value="option2">Option 2</option>
                  <option value="option3">Option 3</option>
                </select>
              </div>
            </div>

            <div className="example-group">
              <h3>Range Sliders</h3>
              <div className="form-control">
                <label className="form-label">Range Value: {formData.range}</label>
                <input 
                  className="form-range" 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={formData.range}
                  onChange={(e) => setFormData({...formData, range: parseInt(e.target.value)})}
                />
              </div>

              <div className="form-control">
                <label className="form-label">Slider 1: {formData.slider1}</label>
                <input 
                  className="seek-bar" 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={formData.slider1}
                  onChange={(e) => setFormData({...formData, slider1: parseInt(e.target.value)})}
                />
              </div>

              <div className="form-control">
                <label className="form-label">Slider 2: {formData.slider2}</label>
                <input 
                  className="seek-bar" 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={formData.slider2}
                  onChange={(e) => setFormData({...formData, slider2: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className="example-group">
              <h3>Checkboxes & Radio</h3>
              <div className="form-control">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={formData.checkbox}
                    onChange={(e) => setFormData({...formData, checkbox: e.target.checked})}
                  />
                  <span>Checkbox Option</span>
                </label>
              </div>

              <div className="form-control">
                <label className="radio-label">
                  <input 
                    type="radio" 
                    name="radio-group"
                    value="option1"
                    checked={formData.radio === 'option1'}
                    onChange={(e) => setFormData({...formData, radio: e.target.value})}
                  />
                  <span>Radio Option 1</span>
                </label>
                <label className="radio-label">
                  <input 
                    type="radio" 
                    name="radio-group"
                    value="option2"
                    checked={formData.radio === 'option2'}
                    onChange={(e) => setFormData({...formData, radio: e.target.value})}
                  />
                  <span>Radio Option 2</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Cards and Panels */}
        <section className="style-section">
          <h2>Cards and Panels</h2>
          
          <div className="card-examples">
            <div className="example-group">
              <h3>Basic Panel</h3>
              <div className="panel">
                <div className="panel-header">
                  <h3 className="panel-title">Panel Title</h3>
                </div>
                <div className="panel-body">
                  <p>This is the panel content area. It can contain any type of content including forms, lists, or other components.</p>
                </div>
              </div>
            </div>

            <div className="example-group">
              <h3>Card with Actions</h3>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Effect Card</h3>
                  <div className="card-actions">
                    <button className="btn btn-ghost btn-sm">Edit</button>
                    <button className="btn btn-danger btn-sm">Delete</button>
                  </div>
                </div>
                <div className="card-body">
                  <p>This is an effect card that shows information about a visual effect.</p>
                </div>
                <div className="card-footer">
                  <button className="btn btn-primary">Apply Effect</button>
                </div>
              </div>
            </div>

            <div className="example-group">
              <h3>Effect Item</h3>
              <div className="effect-item">
                <div className="effect-icon">✨</div>
                <div className="effect-info">
                  <div className="effect-name">Sample Effect</div>
                  <div className="effect-description">A sample visual effect for demonstration</div>
                </div>
                <div className="effect-tag">VISUAL</div>
              </div>
            </div>

            <div className="example-group">
              <h3>Preview Window</h3>
              <div className="preview-window" style={{ maxWidth: '400px', minWidth: '300px' }}>
                <div className="preview-header">
                  <h3>Preview</h3>
                </div>
                <div className="preview-content" style={{ aspectRatio: '16/9' }}>
                  <div className="preview-placeholder">
                    <p>Preview content area</p>
                    <small>16:9 aspect ratio</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Components */}
        <section className="style-section">
          <h2>Navigation Components</h2>
          
          <div className="navigation-examples">
            <div className="example-group">
              <h3>Tabs</h3>
              <div className="effects-tabs">
                <button className="effects-tab active">Effects</button>
                <button className="effects-tab">Sources</button>
                <button className="effects-tab">Generative</button>
              </div>
            </div>

            <div className="example-group">
              <h3>Menu Items</h3>
              <div className="menu-bar">
                <button className="menu-item">Mirror</button>
                <button className="menu-item">Fullscreen</button>
                <button className="menu-item">File</button>
                <button className="menu-item">Settings</button>
              </div>
            </div>

            <div className="example-group">
              <h3>Category Buttons</h3>
              <div className="effect-category-toggle">
                <button className="category-button active">All</button>
                <button className="category-button">Visual</button>
                <button className="category-button">Audio</button>
                <button className="category-button">Data</button>
              </div>
            </div>
          </div>
        </section>

        {/* Status and Feedback */}
        <section className="style-section">
          <h2>Status and Feedback</h2>
          
          <div className="status-examples">
            <div className="example-group">
              <h3>Loading States</h3>
              <div className="status-row">
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading...</p>
                </div>
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p>Processing...</p>
                </div>
              </div>
            </div>

            <div className="example-group">
              <h3>Empty States</h3>
              <div className="empty-state">
                <div className="upload-icon">📁</div>
                <h3>No Effects Found</h3>
                <p>Try adding some effects to get started</p>
              </div>
            </div>

            <div className="example-group">
              <h3>Error States</h3>
              <div className="error-state">
                <p>Something went wrong. Please try again.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Tags and Badges */}
        <section className="style-section">
          <h2>Tags and Badges</h2>
          
          <div className="tag-examples">
            <div className="example-group">
              <h3>Effect Tags</h3>
              <div className="tag-row">
                <span className="effect-tag">VISUAL</span>
                <span className="effect-tag">AUDIO</span>
                <span className="effect-tag">DATA</span>
                <span className="effect-tag">GENERATIVE</span>
              </div>
            </div>

            <div className="example-group">
              <h3>Type Badges</h3>
              <div className="tag-row">
                <span className="asset-type-badge">IMAGE</span>
                <span className="asset-type-badge">VIDEO</span>
                <span className="asset-type-badge">AUDIO</span>
              </div>
            </div>
          </div>
        </section>

        {/* Layout Utilities */}
        <section className="style-section">
          <h2>Layout Utilities</h2>
          
          <div className="layout-examples">
            <div className="example-group">
              <h3>Spacing</h3>
              <div className="spacing-demo">
                <div className="spacing-item small">Small (8px)</div>
                <div className="spacing-item medium">Medium (16px)</div>
                <div className="spacing-item large">Large (24px)</div>
              </div>
            </div>

            <div className="example-group">
              <h3>Grid System</h3>
              <div className="grid-demo">
                <div className="grid-item">Grid Item 1</div>
                <div className="grid-item">Grid Item 2</div>
                <div className="grid-item">Grid Item 3</div>
                <div className="grid-item">Grid Item 4</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StyleGuide;
