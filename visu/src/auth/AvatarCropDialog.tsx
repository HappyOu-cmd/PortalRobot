import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LoaderCircle, Move, ZoomIn } from 'lucide-react';

const FRAME_SIZE = 280;
const OUTPUT_SIZE = 512;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export function AvatarCropDialog({ source, onApply, onClose }: {
  source: string;
  onApply: (avatarDataUrl: string) => void;
  onClose: () => void;
}) {
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const baseScale = dimensions ? Math.max(FRAME_SIZE / dimensions.width, FRAME_SIZE / dimensions.height) : 1;
  const scale = baseScale * zoom;
  const scaledWidth = dimensions ? dimensions.width * scale : FRAME_SIZE;
  const scaledHeight = dimensions ? dimensions.height * scale : FRAME_SIZE;
  const maxOffsetX = Math.max(0, (scaledWidth - FRAME_SIZE) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - FRAME_SIZE) / 2);
  const limitedOffset = useMemo(() => ({
    x: clamp(offset.x, -maxOffsetX, maxOffsetX),
    y: clamp(offset.y, -maxOffsetY, maxOffsetY),
  }), [maxOffsetX, maxOffsetY, offset]);

  useEffect(() => {
    let active = true;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDimensions(null);
    setLoadError('');
    sourceImageRef.current = null;

    const image = new Image();
    const loaded = () => {
      if (!active) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        setLoadError('Не удалось определить размер фотографии. Выберите другой файл.');
        return;
      }
      sourceImageRef.current = image;
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    };
    const failed = () => {
      if (active) setLoadError('Не удалось открыть фотографию. Подойдёт JPEG, PNG или WebP.');
    };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    image.src = source;
    if (image.complete) loaded();

    return () => {
      active = false;
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
  }, [source]);

  const moveImage = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    setOffset({
      x: clamp(pointer.offsetX + event.clientX - pointer.x, -maxOffsetX, maxOffsetX),
      y: clamp(pointer.offsetY + event.clientY - pointer.y, -maxOffsetY, maxOffsetY),
    });
  };
  const finishMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointerRef.current = null;
  };
  const saveCrop = () => {
    const image = sourceImageRef.current;
    if (!image || !dimensions) return;
    const visibleSourceSize = FRAME_SIZE / scale;
    const sourceX = dimensions.width / 2 - visibleSourceSize / 2 - limitedOffset.x / scale;
    const sourceY = dimensions.height / 2 - visibleSourceSize / 2 - limitedOffset.y / scale;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sourceX, sourceY, visibleSourceSize, visibleSourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    onApply(canvas.toDataURL('image/webp', 0.9));
  };

  return <div className="avatar-crop-backdrop" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
    <section className="avatar-crop-dialog">
      <header><div><span>ФОТОГРАФИЯ ПРОФИЛЯ</span><h3 id="avatar-crop-title">Выберите область</h3><p>Перетащите фотографию и отрегулируйте масштаб — круг покажет готовый аватар.</p></div></header>
      <div
        className="avatar-crop-preview"
        onPointerDown={(event) => {
          if (!dimensions) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: limitedOffset.x, offsetY: limitedOffset.y };
        }}
        onPointerMove={moveImage}
        onPointerUp={finishMove}
        onPointerCancel={finishMove}
      >
        <img
          src={source}
          alt="Выбор области фотографии"
          draggable={false}
          style={dimensions ? { width: scaledWidth, height: scaledHeight, left: FRAME_SIZE / 2 - scaledWidth / 2 + limitedOffset.x, top: FRAME_SIZE / 2 - scaledHeight / 2 + limitedOffset.y } : undefined}
        />
        {!dimensions && !loadError && <LoaderCircle className="spin" aria-label="Загрузка фотографии" />}
        {loadError && <span className="avatar-crop-error" role="alert">{loadError}</span>}
        <i aria-hidden="true" />
      </div>
      <div className="avatar-crop-controls">
        <span><Move aria-hidden="true" />Перетащите фото</span>
        <label><ZoomIn aria-hidden="true" /><span>Масштаб</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={!dimensions} /></label>
      </div>
      <footer><button type="button" onClick={onClose}>Отмена</button><button className="primary" type="button" onClick={saveCrop} disabled={!dimensions}>Сохранить область</button></footer>
    </section>
  </div>;
}
