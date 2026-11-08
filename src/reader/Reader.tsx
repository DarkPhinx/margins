import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { isBookId } from '../bible/books';
import { chapterCount, versesInChapter } from '../bible/verseIndex';
import { getProvider, isAvailable } from '../translations/registry';
import { getSettings, useSettings } from '../settings';
import { ContinuousReader } from './ContinuousReader';
import { PagedReader, type ReaderProps } from './PagedReader';
import { SelectionBar } from '../study/SelectionBar';
import { WordSelection } from '../words/WordSelection';
import { useStudy } from '../study/StudyContext';
import { StudyPanel } from '../study/StudyPanel';
import { readerPath } from './nav';

export function Reader() {
  const params = useParams();
  const [search] = useSearchParams();
  const t = params.translation ?? '';
  const bookParam = (params.book ?? '').toUpperCase();
  const chapterNum = Number(params.chapter);

  if (!isAvailable(t) || !isBookId(bookParam) || !Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > chapterCount(bookParam)) {
    const book = isBookId(bookParam) ? bookParam : 'JHN';
    const chapter = Number.isInteger(chapterNum) ? Math.min(Math.max(chapterNum, 1), chapterCount(book)) : 1;
    return <Navigate replace to={readerPath(isAvailable(t) ? t : 'bsb', book, chapter)} />;
  }
  const v = Number(search.get('v'));
  const verse = Number.isInteger(v) && v >= 1 && v <= versesInChapter(bookParam, chapterNum) ? v : null;
  return <ReaderPage key={t} translation={t} book={bookParam} chapter={chapterNum} verse={verse} />;
}

function ReaderPage(props: ReaderProps) {
  const settings = useSettings();
  // Continuous reading is for bundled translations only: the ESV may never show more than half a book at once.
  const continuous = settings.continuousScroll && getProvider(props.translation).meta.source === 'bundled';

  // Switching to continuous mid-chapter keeps your place (the paged reader saves it but doesn't put it in the URL).
  const { last } = getSettings();
  const resumeVerse = last.book === props.book && last.chapter === props.chapter && last.verse > 1 ? last.verse : null;

  const { panelOpen, selection } = useStudy();
  const classes = ['reader', settings.redLetters && 'red-letters', panelOpen && 'study-open', selection && 'has-selection']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
        {continuous ? <ContinuousReader {...props} resumeVerse={resumeVerse} /> : <PagedReader {...props} />}
        <StudyPanel />
        <SelectionBar />
        <WordSelection translation={props.translation} />
    </div>
  );
}
