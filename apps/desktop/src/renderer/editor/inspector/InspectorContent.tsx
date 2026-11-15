import { findSpread, useEditor } from '../../store/editor';
import { fr } from '../../strings/fr';
import { PhotoInspector } from './PhotoInspector';
import { TextInspector } from './TextInspector';
import { Section } from './controls';
import './Inspector.css';

/** What the inspector shows: the properties of the selected photo; later tasks add the other kinds. */
export function InspectorContent() {
  const book = useEditor((s) => s.book);
  const spreadId = useEditor((s) => s.currentSpreadId);
  const selection = useEditor((s) => s.selection);
  const spread = findSpread(book, spreadId);
  const only =
    selection.length === 1 ? spread?.elements.find((el) => el.id === selection[0]) : undefined;
  if (book !== null && spread !== undefined && only?.type === 'photo') {
    // One instance per photo: a field's unsaved text must never follow the selection to the next
    // photo and be committed there when it loses focus.
    return <PhotoInspector key={only.id} book={book} spreadId={spread.id} element={only} />;
  }
  if (book !== null && spread !== undefined && only?.type === 'text') {
    return (
      <div className="inspector" data-testid="text-inspector">
        <Section>
          <h2 className="insp-title">{fr.textInspector.title}</h2>
        </Section>
        <TextInspector key={only.id} spreadId={spread.id} element={only} />
      </div>
    );
  }
  return <p className="shell-empty">{fr.shell.inspectorEmpty}</p>;
}
