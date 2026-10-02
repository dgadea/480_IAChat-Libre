import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import type { ConnectDropTarget, DropTargetMonitor } from 'react-dnd';

interface UseFileDropParams {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
}

interface UseFileDropResult {
  isOver: boolean;
  canDrop: boolean;
  drop: ConnectDropTarget;
}

/**
 * Native-file drop target for panels that upload to a fixed destination.
 *
 * `useDragHelpers` cannot serve them: it reads the chat context and resolves the
 * destination through the upload-option chooser, neither of which exists in the
 * agent builder, where the tool resource is already decided by the panel.
 */
export default function useFileDrop({
  onDrop,
  disabled = false,
}: UseFileDropParams): UseFileDropResult {
  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      canDrop: () => !disabled,
      drop: (item: { files: File[] }) => {
        if (disabled || !item.files?.length) {
          return;
        }
        onDrop(item.files);
      },
      collect: (monitor: DropTargetMonitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onDrop, disabled],
  );

  return { canDrop, isOver, drop };
}
