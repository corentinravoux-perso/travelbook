import type { MapElement } from '@travelbook/core';
import { openMapDialog } from '../../maps/dialogModel';
import { fr } from '../../strings/fr';
import { Section } from './controls';

/** The map section of the inspector: the way back into the map dialog. */
export function MapInspector({ spreadId, element }: { spreadId: string; element: MapElement }) {
  return (
    <Section>
      <button
        type="button"
        className="button"
        onClick={() => void openMapDialog({ spreadId, elementId: element.id })}
      >
        {fr.maps.edit}
      </button>
    </Section>
  );
}
