import React from 'react';
import { useStore } from '../store/store';
import { TransitionType, AppState } from '../store/types';

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Transition Settings</h2>

        <div className="transition-settings">
          <div>
            <label htmlFor="transition-type">Transition Type</label>
            <select
              id="transition-type"
              value={transitionType}
              onChange={(e) => setTransitionType(e.target.value as TransitionType)}
            >
              <option value="cut">Cut</option>
              <option value="fade">Fade</option>
              <option value="fade-through-black">Fade Through Black</option>
            </select>
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
            <input
              id="transition-duration"
              type="number"
              min={0}
              max={5000}
              step={100}
              value={transitionDuration}
              onChange={(e) => setTransitionDuration(Number(e.target.value))}
              disabled={transitionType === 'cut'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}; 