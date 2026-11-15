import { useEffect, useState } from 'react';
import type { AssetRef } from '@travelbook/core';
import type { LibraryItem } from '../../../shared/api';
import { fr } from '../../strings/fr';
import { assetUrl } from '../../editor/assetUrl';
import { SliderField } from '../../editor/inspector/controls';
import { splitColor } from '../../editor/inspector/color';
import { Icon } from '../../theme/Icon';
import { bundledOf, imageOrigin, plainImage, resourceUrl, type ImageBackground } from './model';
import type { TabProps } from './types';

const t = fr.backgrounds;

const FITS = [
  ['cover', t.fitCover],
  ['contain', t.fitContain],
  ['tile', t.fitTile],
] as const;

const BLUR_MAX_MM = 20;

/** Fit, opacity, blur and tint of the image the target has. */
function ImageSettings({ image, apply }: { image: ImageBackground; apply: TabProps['apply'] }) {
  const edit = (patch: Partial<ImageBackground>, gesture?: string) =>
    apply(
      { ...image, ...patch },
      { label: t.undoEdit, ...(gesture === undefined ? {} : { mergeKey: `bg:${gesture}` }) },
    );
  return (
    <section className="bg-block" aria-label={t.imageSettings}>
      <h3 className="bg-block__title">{t.imageSettings}</h3>
      <div className="seg" role="group" aria-label={t.fit}>
        {FITS.map(([fit, label]) => (
          <button
            key={fit}
            type="button"
            aria-pressed={image.fit === fit}
            onClick={() => edit({ fit })}
          >
            {label}
          </button>
        ))}
      </div>
      <SliderField
        label={t.opacity}
        value={Math.round(image.opacity * 100)}
        min={0}
        max={100}
        step={1}
        display={t.percent(image.opacity)}
        onChange={(v, gesture) => edit({ opacity: v / 100 }, gesture)}
      />
      <SliderField
        label={t.blur}
        value={image.blur}
        min={0}
        max={BLUR_MAX_MM}
        step={0.5}
        display={t.blurValue(image.blur)}
        onChange={(blur, gesture) => edit({ blur }, gesture)}
      />
      <div className="bg-tint">
        <label className="insp-check">
          <input
            type="checkbox"
            checked={image.tint !== null}
            onChange={(e) => edit({ tint: e.target.checked ? '#c9a27a' : null })}
          />
          {t.tint}
        </label>
        {image.tint !== null && (
          <input
            type="color"
            className="bg-stop__color"
            aria-label={t.tintColor}
            value={splitColor(image.tint).hex}
            onChange={(e) => edit({ tint: e.target.value }, 'tint')}
          />
        )}
      </div>
    </section>
  );
}

/** A square image button of a grid. */
function Thumb({
  src,
  label,
  pressed,
  onClick,
  data,
}: {
  src: string;
  label: string;
  pressed: boolean;
  onClick(): void;
  data: string;
}) {
  return (
    <button
      type="button"
      className="bg-swatch bg-swatch--image"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      data-id={data}
      onClick={onClick}
    >
      <img src={src} alt="" loading="lazy" draggable={false} />
    </button>
  );
}

/** "Texture": the bundled paper textures; chosen, one fills the page. */
export function TextureTab({ book, current, bundled, apply, fail }: TabProps) {
  const textures = bundled.filter((b) => b.kind === 'texture');
  const image = current?.kind === 'image' ? current : null;
  const origin = image === null ? null : imageOrigin(image, book.assets, bundled);
  const chosenFile =
    image === null ? undefined : bundledOf(book.assets[image.assetId], bundled)?.file;
  const choose = (file: string): void => {
    window.tb.assets
      .fromBundled(file)
      .then((asset) => apply(plainImage(asset.id), { assets: [asset] }), fail);
  };
  return (
    <div className="bg-tab">
      <section className="bg-block" aria-label={t.textures}>
        <h3 className="bg-block__title">{t.textures}</h3>
        <div className="bg-grid bg-grid--textures" role="group" aria-label={t.textures}>
          {textures.map((x) => (
            <Thumb
              key={x.file}
              src={resourceUrl(x.file)}
              label={x.title}
              pressed={chosenFile === x.file}
              data={x.file}
              onClick={() => choose(x.file)}
            />
          ))}
        </div>
      </section>
      {image !== null && origin === 'texture' && <ImageSettings image={image} apply={apply} />}
    </div>
  );
}

/** "Photo": any photo of the album, laid behind the page. */
export function PhotoTab({ book, current, bundled, apply }: TabProps) {
  const photos = Object.values(book.assets).filter((a) => a.kind === 'photo');
  const image = current?.kind === 'image' ? current : null;
  const origin = image === null ? null : imageOrigin(image, book.assets, bundled);
  return (
    <div className="bg-tab">
      <section className="bg-block" aria-label={t.photos}>
        <h3 className="bg-block__title">{t.photos}</h3>
        {photos.length === 0 ? (
          <p className="bg-hint">{t.noPhotos}</p>
        ) : (
          <div className="bg-grid bg-grid--textures" role="group" aria-label={t.photos}>
            {photos.map((p: AssetRef) => (
              <Thumb
                key={p.id}
                src={assetUrl(p.id, 'thumb')}
                label={p.originalName}
                pressed={image?.assetId === p.id}
                data={p.id}
                onClick={() => apply(plainImage(p.id))}
              />
            ))}
          </div>
        )}
      </section>
      {image !== null && origin === 'photo' && <ImageSettings image={image} apply={apply} />}
    </div>
  );
}

/** "Mes fonds": images the user keeps in the library, available in every album. */
export function MineTab({ book, current, bundled, apply, fail }: TabProps) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const image = current?.kind === 'image' ? current : null;
  const origin = image === null ? null : imageOrigin(image, book.assets, bundled);

  useEffect(() => {
    let live = true;
    window.tb.library.list('background').then(
      (list) => {
        if (live) setItems(list);
      },
      (error: unknown) => {
        if (live) fail(error);
      },
    );
    return () => {
      live = false;
    };
  }, [fail]);

  const importFiles = async (): Promise<void> => {
    const paths = await window.tb.photos.pick();
    if (paths.length === 0) return;
    await window.tb.library.add('background', paths);
    setItems(await window.tb.library.list('background'));
  };

  const use = (item: LibraryItem): void => {
    window.tb.assets
      .fromLibrary(item.id)
      .then((asset) => apply(plainImage(asset.id), { assets: [asset] }), fail);
  };

  return (
    <div className="bg-tab">
      <button
        type="button"
        className="button"
        onClick={() => {
          importFiles().catch(fail);
        }}
      >
        <Icon name="plus" />
        {t.importMine}
      </button>
      <section className="bg-block" aria-label={t.mine}>
        <h3 className="bg-block__title">{t.mine}</h3>
        {items === null ? (
          <p className="bg-hint">{t.loading}</p>
        ) : items.length === 0 ? (
          <p className="bg-hint">{t.noMine}</p>
        ) : (
          <div className="bg-grid bg-grid--textures" role="group" aria-label={t.mine}>
            {items.map((item) => (
              <Thumb
                key={item.id}
                src={`tb://library/${item.id}`}
                label={item.title}
                pressed={image?.assetId === item.id}
                data={item.id}
                onClick={() => use(item)}
              />
            ))}
          </div>
        )}
      </section>
      {image !== null && origin === 'mine' && <ImageSettings image={image} apply={apply} />}
    </div>
  );
}
