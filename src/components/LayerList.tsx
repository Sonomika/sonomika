import React from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useStore } from '../store/store';
import { Column, Layer, AppState } from '../store/types';

type StoreActions = {
  reorderLayers: (columnId: string, startIndex: number, endIndex: number) => void;
  moveBetweenColumns: (
    sourceColumnId: string,
    destinationColumnId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => void;
  setSelectedLayer: (layerId: string | null) => void;
};

type Store = AppState & StoreActions;

interface DraggableLayerProps {
  layer: Layer;
  index: number;
  columnId: string;
}

const DraggableLayer: React.FC<DraggableLayerProps> = ({ layer, index, columnId }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: layer.id,
    data: {
      type: 'layer',
      index,
      columnId,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`layer-item ${layer.locked ? 'locked' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="layer-info">
        <span className="layer-type">{layer.type}</span>
        <span className="layer-name">{layer.name}</span>
      </div>
      <div className="layer-status">
        {layer.solo && <span className="status-indicator solo">S</span>}
        {layer.mute && <span className="status-indicator mute">M</span>}
        {layer.locked && <span className="status-indicator locked">L</span>}
      </div>
    </div>
  );
};

interface Props {
  column: Column;
}

export const LayerList: React.FC<Props> = ({ column }) => {
  const {
    selectedLayerId,
    reorderLayers,
    moveBetweenColumns,
    setSelectedLayer,
  } = useStore() as Store;

  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const handleDragStart = (event: any) => {
    const { active } = event;
    setSelectedLayer(active.id);
  };

  const handleDragOver = (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData.columnId !== overData.columnId) {
      moveBetweenColumns(
        activeData.columnId,
        overData.columnId,
        activeData.index,
        overData.index
      );
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData.columnId === overData.columnId) {
      if (activeData.index !== overData.index) {
        reorderLayers(activeData.columnId, activeData.index, overData.index);
      }
    }
  };

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={column.layers.map(layer => layer.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="layer-list">
          {column.layers.map((layer, index) => (
            <DraggableLayer
              key={layer.id}
              layer={layer}
              index={index}
              columnId={column.id}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {selectedLayerId && (
          <div className="layer-item dragging">
            {column.layers.find(l => l.id === selectedLayerId)?.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}; 