import { useNavigate } from 'react-router-dom';
import { bookInfo } from '../../bible/books';
import { chapterTitle, readerPath } from '../../reader/nav';
import { getSettings } from '../../settings';
import { getProvider } from '../../translations/registry';

/** Home section: pick up where you left off. */
export function ContinueReading() {
  const navigate = useNavigate();
  const { translation, last } = getSettings();
  const title = chapterTitle(last.book, last.chapter);
  return (
    <button
      type="button"
      className="continue-card"
      onClick={() => navigate(readerPath(translation, last.book, last.chapter, last.verse))}
    >
      <span className="continue-label">Continue reading</span>
      <span className="continue-place">
        {bookInfo(last.book).chapters === 1 ? `${title} ${last.verse}` : `${title}:${last.verse}`}
      </span>
      <span className="continue-meta">{getProvider(translation).meta.abbreviation}</span>
    </button>
  );
}
