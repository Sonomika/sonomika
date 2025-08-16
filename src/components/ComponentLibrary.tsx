import React, { useState } from 'react';
import { Select, Slider } from './ui';
import { Dialog, Tabs, TabsList, TabsTrigger, Slider } from './ui';

/**
 * Component Library - Interactive Reference for UI Consistency
 * 
 * This component serves as a living documentation and testing ground
 * for all UI components used in the VJ application.
 * 
 * Usage: Import this component in development to test and verify
 * component consistency, or use as a reference for proper implementation.
 */

// Button Component Examples
const ButtonExamples = () => {
  const [activeButton, setActiveButton] = useState<string>('');

  return (
    <div className="component-section">
      <h3 className="section-title">Button System</h3>
      
      <div className="example-group">
        <h4>Button Variants</h4>
        <div className="flex gap-sm">
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-secondary">Secondary</button>
          <button className="btn btn-outline">Outline</button>
          <button className="btn btn-ghost">Ghost</button>
          <button className="btn btn-danger">Danger</button>
          <button className="btn btn-success">Success</button>
        </div>
      </div>

      <div className="example-group">
        <h4>Button Sizes</h4>
        <div className="flex gap-sm items-center">
          <button className="btn btn-primary btn-sm">Small</button>
          <button className="btn btn-primary">Medium</button>
          <button className="btn btn-primary btn-lg">Large</button>
        </div>
      </div>

      <div className="example-group">
        <h4>Interactive States</h4>
        <div className="flex gap-sm">
          <button 
            className={`btn btn-primary ${activeButton === 'hover' ? 'hover-lift' : ''}`}
            onMouseEnter={() => setActiveButton('hover')}
            onMouseLeave={() => setActiveButton('')}
          >
            Hover Effect
          </button>
          <button className="btn btn-outline focus-ring">Focus Ring</button>
          <button className="btn btn-ghost" disabled>Disabled</button>
        </div>
      </div>
    </div>
  );
};

// Form Controls Examples
const FormExamples = () => {
  const [formData, setFormData] = useState({
    text: '',
    select: '',
    range: 50,
    checkbox: false
  });

  return (
    <div className="component-section">
      <h3 className="section-title">Form Controls</h3>
      
      <div className="example-group">
        <h4>Input Fields</h4>
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
      </div>

      <div className="example-group">
        <h4>Select Dropdown</h4>
        <div className="form-control">
          <label className="form-label">Select Option</label>
          <div style={{ maxWidth: 240 }}>
            <Select
              value={formData.select}
              onChange={(v) => setFormData({ ...formData, select: String(v) })}
              options={[
                { value: '', label: 'Choose an option' },
                { value: 'option1', label: 'Option 1' },
                { value: 'option2', label: 'Option 2' },
                { value: 'option3', label: 'Option 3' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="example-group">
        <h4>Range Slider</h4>
        <div className="form-control">
          <label className="form-label">Range Value: {formData.range}</label>
          <div style={{ maxWidth: 240 }}>
            <Slider value={formData.range} min={0} max={100} step={1} onChange={(v) => setFormData({ ...formData, range: v })} />
          </div>
        </div>
      </div>

      <div className="example-group">
        <h4>Checkbox</h4>
        <label className="form-checkbox">
          <input 
            type="checkbox" 
            checked={formData.checkbox}
            onChange={(e) => setFormData({...formData, checkbox: e.target.checked})}
          />
          <span>Accept terms and conditions</span>
        </label>
      </div>
    </div>
  );
};

// Panel and Card Examples
const PanelExamples = () => {
  return (
    <div className="component-section">
      <h3 className="section-title">Panels and Cards</h3>
      
      <div className="example-group">
        <h4>Basic Panel</h4>
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
        <h4>Card with Actions</h4>
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
    </div>
  );
};

// List Examples
const ListExamples = () => {
  const [selectedItem, setSelectedItem] = useState<string>('');

  const listItems = [
    { id: '1', name: 'Video Layer 1', type: 'video' },
    { id: '2', name: 'Audio Layer 1', type: 'audio' },
    { id: '3', name: 'Effect Layer 1', type: 'effect' }
  ];

  return (
    <div className="component-section">
      <h3 className="section-title">Lists and Items</h3>
      
      <div className="example-group">
        <h4>Basic List</h4>
        <div className="list">
          {listItems.map(item => (
            <div 
              key={item.id}
              className={`list-item ${selectedItem === item.id ? 'selected' : ''}`}
              onClick={() => setSelectedItem(item.id)}
            >
              <span className="item-name">{item.name}</span>
              <span className="item-type">{item.type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="example-group">
        <h4>Layer List with Actions</h4>
        <div className="layer-list">
          {listItems.map(item => (
            <div key={item.id} className="layer-item">
              <div className="layer-preview">
                <div className="layer-thumbnail">{item.type}</div>
              </div>
              <div className="layer-info">
                <span className="layer-name">{item.name}</span>
                <div className="layer-controls">
                  <button className="btn btn-ghost btn-sm">Edit</button>
                  <button className="btn btn-danger btn-sm">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Modal Examples
const ModalExamples = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="component-section">
      <h3 className="section-title">Modals and Dialogs</h3>
      
      <div className="example-group">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          Open Modal
        </button>
      </div>

      {showModal && (
        <Dialog open={showModal} onOpenChange={(open) => { if (!open) setShowModal(false); }} title="Example Modal" footer={(
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => setShowModal(false)}>Confirm</button>
          </>
        )}>
          <p>This is an example modal dialog. It demonstrates proper modal structure and behavior.</p>
          <div className="form-control">
            <label className="form-label">Modal Input</label>
            <input className="form-input" type="text" placeholder="Enter text in modal" />
          </div>
        </Dialog>
      )}
    </div>
  );
};

// Layout Examples
const LayoutExamples = () => {
  return (
    <div className="component-section">
      <h3 className="section-title">Layout and Spacing</h3>
      
      <div className="example-group">
        <h4>Flexbox Layouts</h4>
        <div className="flex gap-sm">
          <div className="flex-item">Item 1</div>
          <div className="flex-item">Item 2</div>
          <div className="flex-item">Item 3</div>
        </div>
      </div>

      <div className="example-group">
        <h4>Grid Layout</h4>
        <div className="grid grid-cols-3 gap-md">
          <div className="grid-item">Grid Item 1</div>
          <div className="grid-item">Grid Item 2</div>
          <div className="grid-item">Grid Item 3</div>
          <div className="grid-item">Grid Item 4</div>
          <div className="grid-item">Grid Item 5</div>
          <div className="grid-item">Grid Item 6</div>
        </div>
      </div>

      <div className="example-group">
        <h4>Spacing Utilities</h4>
        <div className="spacing-demo">
          <div className="p-sm border-demo">Small Padding</div>
          <div className="p-md border-demo">Medium Padding</div>
          <div className="p-lg border-demo">Large Padding</div>
        </div>
      </div>
    </div>
  );
};

// Main Component Library Component
const ComponentLibrary: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('buttons');

  const tabs = [
    { id: 'buttons', label: 'Buttons', component: <ButtonExamples /> },
    { id: 'forms', label: 'Forms', component: <FormExamples /> },
    { id: 'panels', label: 'Panels', component: <PanelExamples /> },
    { id: 'lists', label: 'Lists', component: <ListExamples /> },
    { id: 'modals', label: 'Modals', component: <ModalExamples /> },
    { id: 'layout', label: 'Layout', component: <LayoutExamples /> }
  ];

  return (
    <div className="component-library">
      <div className="library-header">
        <h1 className="library-title">VJ Component Library</h1>
        <p className="library-description">
          Interactive reference for maintaining UI consistency across the VJ application.
          Use this as a guide for proper component implementation and styling.
        </p>
      </div>

      <div className="library-tabs">
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)}>
          <TabsList>
            {tabs.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="library-content">
        {tabs.find(tab => tab.id === activeTab)?.component}
      </div>

      <div className="library-footer">
        <h3>Usage Guidelines</h3>
        <ul>
          <li>Always use the established CSS classes and variables</li>
          <li>Follow the spacing and sizing guidelines</li>
          <li>Maintain consistent visual hierarchy</li>
          <li>Test components across different screen sizes</li>
          <li>Ensure accessibility compliance</li>
        </ul>
      </div>
    </div>
  );
};

export default ComponentLibrary;
