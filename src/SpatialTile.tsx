import { Model } from './Model';
import { usePress } from './use-press';

interface SpatialTileProps {
  index: number;
  onSelect: (index: number) => void;
}

/** One hit target on the timeline. `--i` places it; each tile has its own `--press`. */
export function SpatialTile({ index, onSelect }: SpatialTileProps) {
  const [pressed, pressHandlers] = usePress();

  return (
    <Model
      part="tile"
      aria-hidden="true"
      style={{ '--i': index, '--press': pressed ? 1 : 0 }}
      onClick={() => onSelect(index)}
      {...pressHandlers}
    />
  );
}
