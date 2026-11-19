import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../legacy/Icon';
import { Button as BaseButton } from '../ui/Button';
import { MathText } from '../rn/useInlineMath';
import { reportSwallow } from '../../util/reportSwallow.ts';

export interface LightboxImageItem {
  src: string;
  alt?: string;
  caption?: string;
  title?: string;
  sourceUrl?: string;
}

interface ImageLightboxProps {
  images: LightboxImageItem[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, open, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(1);
  }, [initialIndex, open]);

  const currentImage = images[currentIndex] || images[0];

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setZoom(1);
  }, [images.length]);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setZoom(1);
  }, [images.length]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.3, 0.5));
  const handleResetZoom = () => setZoom(1);

  const handleCopy = async () => {
    if (!currentImage?.src) return;
    try {
      await navigator.clipboard.writeText(currentImage.src);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      reportSwallow(error, 'react/intelligent-ui/ImageLightbox.tsx:61', 'expected');
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === '+' || e.key === '=') handleZoomIn();
      else if (e.key === '-') handleZoomOut();
      else if (e.key === '0') handleResetZoom();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, handlePrev, handleNext]);

  if (!open || !currentImage) return null;

  return createPortal(
    <div
      className="intui-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={currentImage.title || currentImage.caption || 'Image preview'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="intui-lightbox-toolbar">
        <div className="intui-lightbox-meta">
          {images.length > 1 && (
            <span className="intui-lightbox-counter">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          {currentImage.title && (
            <span className="intui-lightbox-title">
              <MathText text={currentImage.title} />
            </span>
          )}
        </div>

        <div className="intui-lightbox-actions">
          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={zoom <= 0.6}
            aria-label="Zoom out"
            title="Zoom out (-)"
          >
            <span>−</span>
          </BaseButton>
          <span className="intui-lightbox-zoom-level">{Math.round(zoom * 100)}%</span>
          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <span>+</span>
          </BaseButton>
          {zoom !== 1 && (
            <BaseButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              aria-label="Reset zoom"
              title="Reset zoom (0)"
            >
              1:1
            </BaseButton>
          )}

          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            aria-label="Copy image link"
            title={copied ? 'Link copied!' : 'Copy link'}
          >
            <span>{copied ? '✓' : 'Copy'}</span>
          </BaseButton>

          {currentImage.sourceUrl && (
            <a
              href={currentImage.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="intui-lightbox-link-btn"
              title="View source page"
            >
              Source ↗
            </a>
          )}

          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="intui-lightbox-close"
          >
            <Icon name="close" size={16} />
          </BaseButton>
        </div>
      </div>

      <div
        className="intui-lightbox-content"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {images.length > 1 && (
          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            className="intui-lightbox-nav intui-lightbox-prev"
            onClick={handlePrev}
            aria-label="Previous image"
          >
            ‹
          </BaseButton>
        )}

        <div className="intui-lightbox-img-wrapper" style={{ transform: `scale(${zoom})` }}>
          <img
            src={currentImage.src}
            alt={currentImage.alt || currentImage.caption || 'Image'}
            referrerPolicy="no-referrer"
            draggable={false}
          />
        </div>

        {images.length > 1 && (
          <BaseButton
            type="button"
            variant="ghost"
            size="sm"
            className="intui-lightbox-nav intui-lightbox-next"
            onClick={handleNext}
            aria-label="Next image"
          >
            ›
          </BaseButton>
        )}
      </div>

      {currentImage.caption && (
        <div className="intui-lightbox-caption">
          <MathText text={currentImage.caption} />
        </div>
      )}
    </div>,
    document.body,
  );
}

export default ImageLightbox;
