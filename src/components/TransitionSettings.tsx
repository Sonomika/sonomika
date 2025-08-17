import React from 'react';
import { useStore } from '../store/store';
import { TransitionType, AppState } from '../store/types';
import { Dialog, Select, Slider } from './ui';

type StoreActions = {
  setTransitionType: (type: TransitionType) => void;
  setTransitionDuration: (duration: number) => void;
};

type Store = AppState & StoreActions;

interface Props {
  onClose: () => void;
}

export const TransitionSettings: React.FC<Props> = ({ onClose }) => {
  const {
    transitionType,
    transitionDuration,
    setTransitionType,
    setTransitionDuration,
  } = useStore() as Store;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Transition Settings">
      <div className="transition-settings tw-space-y-3">
          <div>
            <label htmlFor="transition-type">Transition Type</label>
            <div style={{ maxWidth: 220 }}>
              <Select
                value={transitionType}
                onChange={(v) => setTransitionType(v as TransitionType)}
                options={[
                  { value: 'cut', label: 'Cut' },
                  { value: 'fade', label: 'Fade' },
                  { value: 'fade-through-black', label: 'Fade Through Black' },
                ]}
              />
            </div>
          </div>

          <div>
            <label htmlFor="transition-duration">
              Duration (ms)
              {transitionType !== 'cut' && (
                <span className="setting-description">
                  Time in milliseconds for the transition to complete
                </span>
              )}
            </label>
            <div style={{ maxWidth: 320 }}>
              <Slider
                min={0}
                max={5000}
                step={100}
                value={[transitionDuration]}
                onValueChange={(values) => values && values.length > 0 && setTransitionDuration(values[0])}
                className={transitionType === 'cut' ? 'tw-opacity-50' : ''}
              />
            </div>
          </div>
      </div>
    </Dialog>
  );
}; 