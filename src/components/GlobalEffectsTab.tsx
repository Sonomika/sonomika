import React from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useStore } from '../store/store';
import { EffectParamsEditor } from './EffectParamsEditor';
import { v4 as uuidv4 } from 'uuid';
import { getDefaultEffectParams } from '../utils/LayerManagerUtils';
import { TrashIcon, ChevronDownIcon } from '@radix-ui/react-icons';

interface GlobalEffectsTabProps {
  className?: string;
}

export const GlobalEffectsTab: React.FC<GlobalEffectsTabProps> = ({ className = '' }) => {
  const { scenes, currentSceneId, updateScene } = useStore() as any;
  const currentScene = scenes.find((s: any) => s.id === currentSceneId);

  const effects: any[] = currentScene?.globalEffects || [];

  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    // Ensure new slots have a default open state
    const next: Record<string, boolean> = { ...openMap };
    effects.forEach((slot) => {
      const key = slot?.id || '';
      if (key && next[key] === undefined) {
        next[key] = Boolean(slot?.effectId);
      }
    });
    setOpenMap(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects.length]);

  const setEffects = (next: any[]) => updateScene(currentSceneId, { globalEffects: next });

  const handleAddEffect = () => {
    // Placeholder effect slot; user will assign via drag/drop into the slot or future selector
    const newSlot = {
      id: uuidv4(),
      effectId: '',
      name: 'Empty',
      enabled: true,
      params: {}
    };
    setEffects([...effects, newSlot]);
  };

  const handleRemove = (index: number) => {
    const toRemove = effects[index];
    setEffects(effects.filter((_, i) => i !== index));
    if (toRemove?.id) {
      setOpenMap((prev) => {
        const copy = { ...prev };
        delete copy[toRemove.id];
        return copy;
      });
    }
  };

  const handleParamsChange = (index: number, newParams: Record<string, any>) => {
    const next = [...effects];
    next[index] = { ...next[index], params: newParams };
    setEffects(next);
  };

  const handleDropIntoSlot = (index: number, data: any) => {
    if (!data?.isEffect) return;
    const next = [...effects];
    const effectId = data.id || data.name || data.filePath || '';
    next[index] = {
      id: next[index]?.id || uuidv4(),
      effectId,
      name: data.name || effectId,
      enabled: true,
      params: getDefaultEffectParams(effectId)
    };
    setEffects(next);
    const newId = next[index].id;
    if (newId) setOpenMap((prev) => ({ ...prev, [newId]: true }));
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...effects];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setEffects(next);
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('application/x-global-effect-index', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDropReorder = (e: React.DragEvent, toIndex: number) => {
    const fromStr = e.dataTransfer.getData('application/x-global-effect-index');
    if (fromStr) {
      const from = parseInt(fromStr, 10);
      if (!Number.isNaN(from)) move(from, toIndex);
      return;
    }
    const raw = e.dataTransfer.getData('application/json');
    try {
      const data = raw ? JSON.parse(raw) : null;
      if (data?.isEffect) {
        handleDropIntoSlot(toIndex, data);
      }
    } catch {}
  };

  const minSlots = 5;
  const numSlots = Math.max(minSlots, effects.length);

  return (
    <div className={`tw-h-full tw-flex tw-flex-col ${className}`}>
      <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
        <h3 className="tw-text-sm tw-font-semibold tw-text-neutral-200">Global Effects</h3>
        <button
          className="tw-rounded tw-border tw-border-neutral-700 tw-bg-neutral-800 tw-text-neutral-100 tw-px-2 tw-py-1 hover:tw-bg-neutral-700"
          onClick={handleAddEffect}
          title="Add global effect slot"
        >
          + Slot
        </button>
      </div>
      <ScrollArea.Root className="tw-h-full" type="always">
        <ScrollArea.Viewport className="tw-h-full tw-w-full">
          <div className="tw-space-y-2">
            {Array.from({ length: numSlots }).map((_, index) => {
              const slot = effects[index];
              const title = slot?.name || slot?.effectId || `Empty Slot ${index + 1}`;
              const isEmpty = !slot || !slot.effectId;
              const isOpen = slot?.id ? Boolean(openMap[slot.id]) : false;
              return (
                <div
                  key={slot?.id || `empty-${index}`}
                  className="tw-border tw-border-neutral-800 tw-rounded-md tw-bg-neutral-900"
                  draggable={Boolean(slot)}
                  onDragStart={(e) => onDragStart(e, index)}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDropReorder(e, index)}
                >
                  <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-neutral-800">
                    <button
                      className="tw-flex tw-items-center tw-gap-2 tw-text-left"
                      onClick={() => slot?.id && setOpenMap((prev) => ({ ...prev, [slot.id]: !Boolean(prev[slot.id]) }))}
                      disabled={!slot}
                    >
                      <ChevronDownIcon
                        className={`tw-transition-transform ${isOpen ? '' : '-tw-rotate-90'} tw-text-neutral-300`}
                      />
                      <span className="tw-text-sm tw-text-neutral-200">{title}</span>
                      {isEmpty && <span className="tw-text-xs tw-text-neutral-400">(drop an effect)</span>}
                    </button>
                    {slot && (
                      <button
                        className="tw-text-neutral-300 hover:tw-text-red-400"
                        onClick={() => handleRemove(index)}
                        title="Remove effect"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="tw-p-3">
                      {slot && slot.effectId ? (
                        <EffectParamsEditor
                          effectId={slot.effectId}
                          params={slot.params}
                          onChange={(newParams) => handleParamsChange(index, newParams)}
                        />
                      ) : (
                        <div
                          className="tw-h-16 tw-rounded tw-border tw-border-dashed tw-border-neutral-700 tw-bg-neutral-900 tw-flex tw-items-center tw-justify-center tw-text-neutral-400 tw-text-sm"
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const raw = e.dataTransfer.getData('application/json');
                            try {
                              const data = raw ? JSON.parse(raw) : null;
                              if (data?.isEffect) handleDropIntoSlot(index, data);
                            } catch {}
                          }}
                        >
                          Drop an effect here
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="tw-flex tw-w-2" orientation="vertical">
          <ScrollArea.Thumb className="tw-flex-1 tw-bg-neutral-500 tw-rounded-[10px]" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
};


