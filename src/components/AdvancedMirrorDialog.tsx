import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Select } from './ui';

type Orientation = 'horizontal' | 'vertical';

export interface AdvancedMirrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (opts: { count: number; orientation: Orientation }) => void;
}

export const AdvancedMirrorDialog: React.FC<AdvancedMirrorDialogProps> = ({ open, onOpenChange, onStart }) => {
  const [count, setCount] = useState<number>(2);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tw-z-[6000]">
        <DialogHeader>
          <DialogTitle>Advanced Mirror</DialogTitle>
        </DialogHeader>
        <div className="tw-space-y-3">
          <div className="tw-flex tw-items-center tw-justify-between">
            <label className="tw-text-sm tw-text-white">Slices</label>
            <input
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
              className="tw-w-24 tw-bg-black tw-text-white tw-border tw-border-gray-700 tw-rounded tw-px-2 tw-py-1"
            />
          </div>
          <div className="tw-flex tw-items-center tw-justify-between">
            <label className="tw-text-sm tw-text-white">Orientation</label>
            <Select value={orientation} onChange={(v: any) => setOrientation(v as Orientation)}
              options={[{ label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical', value: 'vertical' }]} />
          </div>

          <div className="tw-flex tw-justify-end tw-pt-2 tw-space-x-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => { onStart({ count, orientation }); onOpenChange(false); }}>Open</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};


